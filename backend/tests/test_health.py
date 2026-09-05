"""
test_health.py

Tests for health endpoints and REST fallback APIs.
"""
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "bin-vision-backend"
    assert "timestamp" in data


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "BIN-Vision" in data["message"]
    assert "/ws/agent" in data["websocket"]


def test_rest_agent_act():
    payload = {
        "session_id": "test_session_rest",
        "message_type": "page_context",
        "goal": "Fill test form",
        "upr": {
            "page": {
                "title": "Registration",
                "url": "https://test.local",
                "snapshot_hash": "sha256:111",
                "timestamp": 123.0
            },
            "elements": [
                {
                    "id": "e1",
                    "tagName": "INPUT",
                    "type": "input",
                    "label": "Name",
                    "semantic": "NAME",
                    "tokenized": "SECRET_USER_NAME",
                    "visible": True,
                    "interactable": True
                }
            ],
            "forms": [],
            "perception_source": ["dom"],
            "overall_confidence": 0.95
        },
        "step": 1
    }

    response = client.post("/api/agent/act", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "test_session_rest"
    assert data["message_type"] == "action"
    assert len(data["actions"]) == 1
    assert data["actions"][0]["element_id"] == "e1"
    assert data["actions"][0]["value"] == "SECRET_USER_NAME"
