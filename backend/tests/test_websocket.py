"""
test_websocket.py

Integration tests for WebSocket communication between extension client and backend agent.
"""
import pytest
import json
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_websocket_ping_pong():
    with client.websocket_connect("/ws/agent") as websocket:
        msg = {
            "session_id": "sess_ping_test",
            "message_type": "ping",
            "step": 1
        }
        websocket.send_text(json.dumps(msg))
        response_text = websocket.receive_text()
        data = json.loads(response_text)

        assert data["session_id"] == "sess_ping_test"
        assert data["message_type"] == "pong"
        assert data["step"] == 1


def test_websocket_page_context_and_actions():
    with client.websocket_connect("/ws/agent") as websocket:
        # Step 1: Send page context with an unfilled input
        page_msg = {
            "session_id": "sess_form_flow",
            "message_type": "page_context",
            "goal": "Register account",
            "upr": {
                "page": {
                    "title": "Sign Up",
                    "url": "https://example.com/signup",
                    "snapshot_hash": "sha256:abc",
                    "timestamp": 12345.0
                },
                "elements": [
                    {
                        "id": "e_email",
                        "tagName": "INPUT",
                        "type": "input",
                        "label": "Email Address",
                        "semantic": "EMAIL",
                        "tokenized": "SECRET_USER_EMAIL",
                        "visible": True,
                        "interactable": True
                    },
                    {
                        "id": "btn_submit",
                        "tagName": "BUTTON",
                        "type": "button",
                        "label": "Sign Up",
                        "semantic": "SUBMIT",
                        "visible": True,
                        "interactable": True
                    }
                ],
                "forms": [],
                "perception_source": ["dom"],
                "overall_confidence": 1.0
            },
            "step": 1
        }
        websocket.send_text(json.dumps(page_msg))
        response_text = websocket.receive_text()
        data = json.loads(response_text)

        assert data["session_id"] == "sess_form_flow"
        assert data["message_type"] == "action"
        assert len(data["actions"]) == 1
        assert data["actions"][0]["type"] == "fill"
        assert data["actions"][0]["element_id"] == "e_email"
        assert data["actions"][0]["value"] == "SECRET_USER_EMAIL"

        # Step 2: Report action result
        result_msg = {
            "session_id": "sess_form_flow",
            "message_type": "action_result",
            "action_result": {
                "action_id": data["actions"][0]["action_id"],
                "success": True
            },
            "step": 1
        }
        websocket.send_text(json.dumps(result_msg))

        # Step 3: Now send updated page context where input is filled
        page_msg_filled = {
            "session_id": "sess_form_flow",
            "message_type": "page_context",
            "goal": "Register account",
            "upr": {
                "page": {
                    "title": "Sign Up",
                    "url": "https://example.com/signup",
                    "snapshot_hash": "sha256:def",
                    "timestamp": 12350.0
                },
                "elements": [
                    {
                        "id": "e_email",
                        "tagName": "INPUT",
                        "type": "input",
                        "label": "Email Address",
                        "semantic": "EMAIL",
                        "value": "SECRET_USER_EMAIL",
                        "visible": True,
                        "interactable": True
                    },
                    {
                        "id": "btn_submit",
                        "tagName": "BUTTON",
                        "type": "button",
                        "label": "Sign Up",
                        "semantic": "SUBMIT",
                        "visible": True,
                        "interactable": True
                    }
                ],
                "forms": [],
                "perception_source": ["dom"],
                "overall_confidence": 1.0
            },
            "step": 2
        }
        websocket.send_text(json.dumps(page_msg_filled))
        resp2 = json.loads(websocket.receive_text())

        assert resp2["message_type"] == "action"
        assert len(resp2["actions"]) == 1
        assert resp2["actions"][0]["type"] == "click"
        assert resp2["actions"][0]["element_id"] == "btn_submit"


def test_websocket_error_handling():
    with client.websocket_connect("/ws/agent") as websocket:
        websocket.send_text("NOT_VALID_JSON{")
        response_text = websocket.receive_text()
        data = json.loads(response_text)
        assert data["message_type"] == "error"
        assert "Invalid message format" in data["error"]
