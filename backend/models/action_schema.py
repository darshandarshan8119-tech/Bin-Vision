"""
action_schema.py

Pydantic models corresponding to AgentAction, ActionResult, and WebSocket wire protocols.
Matches extension/src/shared/types.ts exactly.
"""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from .upr_schema import UnifiedPageRepresentation


ActionType = Literal[
    "fill",
    "click",
    "select",
    "scroll",
    "navigate",
    "wait",
    "submit",
    "back"
]


class AgentAction(BaseModel):
    action_id: str
    type: ActionType
    element_id: Optional[str] = None
    value: Optional[str] = None
    url: Optional[str] = None
    direction: Optional[Literal["up", "down"]] = None
    duration_ms: Optional[int] = None
    reason: Optional[str] = None

    model_config = {
        "extra": "ignore"
    }


class ActionResult(BaseModel):
    action_id: str
    success: bool
    error: Optional[str] = None

    model_config = {
        "extra": "ignore"
    }


class ExtToBackendMessage(BaseModel):
    session_id: str
    message_type: Literal["page_context", "action_result", "ping"]
    goal: Optional[str] = None
    upr: Optional[UnifiedPageRepresentation] = None
    action_result: Optional[ActionResult] = None
    step: int = 1

    model_config = {
        "extra": "ignore"
    }


class BackendToExtMessage(BaseModel):
    session_id: str
    message_type: Literal["action", "done", "error", "pong"]
    actions: Optional[List[AgentAction]] = None
    reasoning: Optional[str] = None
    done: Optional[bool] = False
    error: Optional[str] = None
    step: int = 1

    model_config = {
        "extra": "ignore"
    }
