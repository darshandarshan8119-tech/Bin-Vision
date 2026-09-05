"""
agent.py

WebSocket and REST routers for BIN-Vision agent communications.
Implements the bidirectional wire protocol between Chrome extension and backend.
"""
import json
import logging
from typing import Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, status
from ..models.upr_schema import UnifiedPageRepresentation
from ..models.action_schema import (
    ExtToBackendMessage,
    BackendToExtMessage,
    AgentAction,
    ActionResult,
)
from ..agent.planner import TaskPlanner
from ..agent.llm_client import get_llm_client

logger = logging.getLogger("bin_vision.agent_router")

router = APIRouter(tags=["Agent"])


class ConnectionManager:
    """
    Manages active WebSocket sessions and associated planners.
    """
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.planners: Dict[str, TaskPlanner] = {}
        self.session_goals: Dict[str, str] = {}
        self.session_steps: Dict[str, int] = {}
        self.last_results: Dict[str, Optional[ActionResult]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[session_id] = websocket
        self.planners[session_id] = TaskPlanner(llm_client=get_llm_client())
        self.session_steps[session_id] = 1
        self.last_results[session_id] = None
        logger.info(f"WebSocket session established: {session_id}")

    def disconnect(self, session_id: str):
        self.active_connections.pop(session_id, None)
        self.planners.pop(session_id, None)
        self.session_goals.pop(session_id, None)
        self.session_steps.pop(session_id, None)
        self.last_results.pop(session_id, None)
        logger.info(f"WebSocket session disconnected and cleaned: {session_id}")

    async def send_message(self, session_id: str, message: BackendToExtMessage):
        ws = self.active_connections.get(session_id)
        if ws:
            payload = message.model_dump(exclude_none=True)
            await ws.send_text(json.dumps(payload))


manager = ConnectionManager()


@router.websocket("/ws/agent")
async def websocket_agent_endpoint(websocket: WebSocket):
    """
    Primary WebSocket endpoint for browser agent coordination.
    Handles 'page_context', 'action_result', 'ping', and error protocols.
    """
    temp_session_id = f"conn_{id(websocket)}"
    connected_session_id: Optional[str] = None

    try:
        # Initial accept happens in manager upon receiving first identification or immediately
        await websocket.accept()
        logger.info(f"Incoming WebSocket handshake from {websocket.client}")

        while True:
            raw_text = await websocket.receive_text()
            try:
                data = json.loads(raw_text)
                msg = ExtToBackendMessage.model_validate(data)
            except Exception as e:
                logger.error(f"Malformed message received: {e}")
                err_resp = BackendToExtMessage(
                    session_id=connected_session_id or "unknown",
                    message_type="error",
                    error=f"Invalid message format: {str(e)}",
                    step=1
                )
                await websocket.send_text(json.dumps(err_resp.model_dump(exclude_none=True)))
                continue

            session_id = msg.session_id
            connected_session_id = session_id

            if session_id not in manager.active_connections:
                manager.active_connections[session_id] = websocket
                manager.planners[session_id] = TaskPlanner(llm_client=get_llm_client())
                manager.session_steps[session_id] = msg.step or 1
                manager.last_results[session_id] = None

            current_step = msg.step or manager.session_steps.get(session_id, 1)

            # Handle keepalive ping
            if msg.message_type == "ping":
                pong_msg = BackendToExtMessage(
                    session_id=session_id,
                    message_type="pong",
                    step=current_step
                )
                await websocket.send_text(json.dumps(pong_msg.model_dump(exclude_none=True)))
                continue

            # Handle action result feedback
            if msg.message_type == "action_result":
                manager.last_results[session_id] = msg.action_result
                logger.info(f"Session {session_id} reported action result: {msg.action_result}")
                continue

            # Handle page context analysis and action planning
            if msg.message_type == "page_context":
                if msg.goal:
                    manager.session_goals[session_id] = msg.goal

                goal = manager.session_goals.get(session_id, "Analyze and complete this page")
                upr = msg.upr

                if not upr:
                    err_msg = BackendToExtMessage(
                        session_id=session_id,
                        message_type="error",
                        error="page_context message must contain upr payload",
                        step=current_step
                    )
                    await websocket.send_text(json.dumps(err_msg.model_dump(exclude_none=True)))
                    continue

                planner = manager.planners[session_id]
                prev_res = manager.last_results.get(session_id)

                actions, reasoning, done = await planner.plan_next_step(
                    goal=goal,
                    upr=upr,
                    step=current_step,
                    previous_result=prev_res
                )

                manager.session_steps[session_id] = current_step + 1

                if done or not actions:
                    done_msg = BackendToExtMessage(
                        session_id=session_id,
                        message_type="done",
                        actions=[],
                        reasoning=reasoning or "Task completed successfully",
                        done=True,
                        step=current_step
                    )
                    await websocket.send_text(json.dumps(done_msg.model_dump(exclude_none=True)))
                else:
                    action_msg = BackendToExtMessage(
                        session_id=session_id,
                        message_type="action",
                        actions=actions,
                        reasoning=reasoning,
                        done=False,
                        step=current_step
                    )
                    await websocket.send_text(json.dumps(action_msg.model_dump(exclude_none=True)))

    except WebSocketDisconnect:
        if connected_session_id:
            manager.disconnect(connected_session_id)
        logger.info(f"WebSocket client disconnected: {connected_session_id or temp_session_id}")
    except Exception as e:
        logger.exception(f"Unexpected error in websocket loop: {e}")
        if connected_session_id:
            manager.disconnect(connected_session_id)


@router.post("/api/agent/act", response_model=BackendToExtMessage)
async def rest_agent_act(msg: ExtToBackendMessage):
    """
    REST fallback endpoint for single-turn action planning.
    """
    if msg.message_type != "page_context" or not msg.upr:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="REST /api/agent/act requires message_type='page_context' and upr payload"
        )

    goal = msg.goal or "Complete the page task"
    planner = TaskPlanner(llm_client=get_llm_client())

    actions, reasoning, done = await planner.plan_next_step(
        goal=goal,
        upr=msg.upr,
        step=msg.step,
        previous_result=msg.action_result
    )

    return BackendToExtMessage(
        session_id=msg.session_id,
        message_type="done" if (done or not actions) else "action",
        actions=actions if not done else [],
        reasoning=reasoning,
        done=done,
        step=msg.step
    )
