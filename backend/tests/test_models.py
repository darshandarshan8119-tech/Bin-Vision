"""
test_models.py

Unit tests for UPR and Action Pydantic models.
"""
import pytest
from backend.models.upr_schema import (
    UPRElement,
    UPRPage,
    UPRForm,
    UnifiedPageRepresentation,
)
from backend.models.action_schema import (
    AgentAction,
    ActionResult,
    ExtToBackendMessage,
    BackendToExtMessage,
)


def test_upr_element_creation():
    elem = UPRElement(
        id="e1",
        tagName="INPUT",
        type="input",
        htmlType="email",
        label="Email Address",
        semantic="EMAIL",
        pii=True,
        tokenized="SECRET_EMAIL123",
        source="dom",
        confidence=0.95
    )
    assert elem.id == "e1"
    assert elem.pii is True
    assert elem.tokenized == "SECRET_EMAIL123"
    assert elem.visible is True
    assert elem.interactable is True
    assert elem.bbox == [0.0, 0.0, 0.0, 0.0]


def test_unified_page_representation():
    page = UPRPage(
        title="Register",
        url="https://example.com/register",
        snapshot_hash="sha256:abc123",
        timestamp=1700000000.0
    )
    element = UPRElement(
        id="e1",
        tagName="INPUT",
        type="input",
        label="Full Name",
        semantic="NAME",
        tokenized="SECRET_NAME1"
    )
    form = UPRForm(
        form_id="reg_form",
        element_ids=["e1"],
        semantic_purpose="REGISTRATION"
    )
    upr = UnifiedPageRepresentation(
        page=page,
        elements=[element],
        forms=[form],
        perception_source=["dom"],
        overall_confidence=0.92
    )

    data = upr.model_dump()
    assert data["page"]["title"] == "Register"
    assert len(data["elements"]) == 1
    assert data["elements"][0]["tokenized"] == "SECRET_NAME1"
    assert data["overall_confidence"] == 0.92


def test_agent_action_model():
    action = AgentAction(
        action_id="act_001",
        type="fill",
        element_id="e1",
        value="SECRET_NAME1",
        reason="Filling name field"
    )
    assert action.action_id == "act_001"
    assert action.type == "fill"
    assert action.element_id == "e1"
    assert action.value == "SECRET_NAME1"


def test_wire_messages():
    msg = ExtToBackendMessage(
        session_id="tab_123",
        message_type="page_context",
        goal="Fill registration form",
        step=1
    )
    assert msg.session_id == "tab_123"
    assert msg.message_type == "page_context"

    resp = BackendToExtMessage(
        session_id="tab_123",
        message_type="action",
        actions=[
            AgentAction(action_id="a1", type="click", element_id="e2")
        ],
        step=1
    )
    assert resp.message_type == "action"
    assert len(resp.actions) == 1
    assert resp.actions[0].type == "click"
