"""
test_planner.py

Unit tests for ActionGenerator, HeuristicLLMClient, and TaskPlanner.
"""
import pytest
import json
from backend.agent.action_generator import ActionGenerator
from backend.agent.llm_client import HeuristicLLMClient, MockLLMClient
from backend.agent.planner import TaskPlanner
from backend.models.upr_schema import (
    UnifiedPageRepresentation,
    UPRPage,
    UPRElement,
    UPRForm,
)
from backend.models.action_schema import ActionResult


def test_action_generator_clean_json():
    raw_json = json.dumps({
        "actions": [
            {"action_id": "a1", "type": "fill", "element_id": "e1", "value": "SECRET_101", "reason": "Fill name"}
        ],
        "reasoning": "Plan name fill",
        "done": False
    })
    actions, reasoning, done = ActionGenerator.parse_llm_response(raw_json)
    assert len(actions) == 1
    assert actions[0].action_id == "a1"
    assert actions[0].type == "fill"
    assert actions[0].value == "SECRET_101"
    assert done is False
    assert reasoning == "Plan name fill"


def test_action_generator_markdown_blocks():
    raw = """```json
    {
      "actions": [
        {"action_id": "a2", "type": "click", "element_id": "btn_sub"}
      ],
      "reasoning": "Submit the form",
      "done": false
    }
    ```"""
    actions, reasoning, done = ActionGenerator.parse_llm_response(raw)
    assert len(actions) == 1
    assert actions[0].type == "click"
    assert actions[0].element_id == "btn_sub"


def test_action_generator_filters_invalid_actions():
    raw = json.dumps({
        "actions": [
            {"action_id": "a1", "type": "malicious_script", "element_id": "e1"},
            {"action_id": "a2", "type": "fill", "element_id": "e2", "value": "test"}
        ],
        "done": False
    })
    actions, reasoning, done = ActionGenerator.parse_llm_response(raw)
    assert len(actions) == 1
    assert actions[0].type == "fill"
    assert actions[0].action_id == "a2"


@pytest.mark.asyncio
async def test_heuristic_llm_client_unfilled_form():
    client = HeuristicLLMClient()

    upr = {
        "elements": [
            {
                "id": "e1",
                "type": "input",
                "semantic": "EMAIL",
                "label": "Email Address",
                "value": None,
                "tokenized": "SECRET_EMAIL_ABC",
                "visible": True,
                "interactable": True
            },
            {
                "id": "e2",
                "type": "button",
                "semantic": "SUBMIT",
                "label": "Register",
                "visible": True,
                "interactable": True
            }
        ]
    }

    user_prompt = f"### SANITIZED UNIFIED PAGE REPRESENTATION (UPR):\n{json.dumps(upr)}\nAnalyze"
    raw_plan = await client.generate_plan(system_prompt="", user_prompt=user_prompt)
    actions, reasoning, done = ActionGenerator.parse_llm_response(raw_plan)

    assert len(actions) == 1
    assert actions[0].type == "fill"
    assert actions[0].element_id == "e1"
    assert actions[0].value == "SECRET_EMAIL_ABC"
    assert done is False


@pytest.mark.asyncio
async def test_task_planner_filters_nonexistent_elements():
    # Mock client returns action pointing to non-existent 'e99'
    mock_client = MockLLMClient(json.dumps({
        "actions": [
            {"action_id": "a1", "type": "fill", "element_id": "e99", "value": "SECRET_BAD"},
            {"action_id": "a2", "type": "fill", "element_id": "e1", "value": "SECRET_GOOD"}
        ],
        "reasoning": "Test filter",
        "done": False
    }))

    planner = TaskPlanner(llm_client=mock_client)

    upr = UnifiedPageRepresentation(
        page=UPRPage(title="Test", url="https://example.com"),
        elements=[
            UPRElement(id="e1", tagName="INPUT", type="input", label="Name", semantic="NAME")
        ]
    )

    actions, reasoning, done = await planner.plan_next_step(goal="Fill form", upr=upr, step=1)
    assert len(actions) == 1
    assert actions[0].element_id == "e1"
    assert actions[0].value == "SECRET_GOOD"


@pytest.mark.asyncio
async def test_task_planner_budget_limit():
    planner = TaskPlanner(max_steps=5)
    upr = UnifiedPageRepresentation(
        page=UPRPage(title="Test", url="https://example.com"),
        elements=[]
    )

    actions, reasoning, done = await planner.plan_next_step(goal="Endless loop", upr=upr, step=6)
    assert done is True
    assert len(actions) == 0
    assert "Exceeded maximum task step budget" in reasoning
