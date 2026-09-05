"""
action_generator.py

Validates and generates strictly typed AgentAction instances from raw LLM output or intermediate plans.
Guarantees schema compliance and security constraints before dispatch to browser client.
"""
import json
import logging
import uuid
from typing import List, Dict, Any, Optional, Tuple
from ..models.action_schema import AgentAction, ActionType

logger = logging.getLogger("bin_vision.action_generator")

ALLOWED_ACTION_TYPES = {
    "fill", "click", "select", "scroll", "navigate", "wait", "submit", "back"
}


class ActionGenerator:
    """
    Parses and sanitizes LLM output into validated AgentAction instances.
    """

    @staticmethod
    def parse_llm_response(raw_response: str) -> Tuple[List[AgentAction], str, bool]:
        """
        Parses LLM JSON string and returns (actions, reasoning, done).
        Handles common LLM JSON quirks (such as markdown code blocks).
        """
        cleaned = raw_response.strip()

        # Handle ```json ... ``` or ``` ... ``` anywhere in response
        import re
        md_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
        if md_match:
            cleaned = md_match.group(1).strip()
        elif cleaned.startswith("```"):
            lines = [l.strip() for l in cleaned.splitlines()]
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.error(f"ActionGenerator failed to parse LLM JSON: {e}\nRaw content: {raw_response[:300]}")
            return [], f"Failed to parse LLM response: {str(e)}", False

        raw_actions = data.get("actions", [])
        reasoning = data.get("reasoning", "Autonomous plan generated")
        done = bool(data.get("done", False))

        validated_actions = []
        for i, item in enumerate(raw_actions):
            if not isinstance(item, dict):
                continue

            act_type = item.get("type", "").lower().strip()
            if act_type not in ALLOWED_ACTION_TYPES:
                logger.warning(f"Discarding action with disallowed type: '{act_type}'")
                continue

            action_id = item.get("action_id") or f"act_{uuid.uuid4().hex[:8]}"

            action = AgentAction(
                action_id=action_id,
                type=act_type,  # type: ignore
                element_id=item.get("element_id"),
                value=item.get("value"),
                url=item.get("url"),
                direction=item.get("direction"),
                duration_ms=item.get("duration_ms"),
                reason=item.get("reason") or f"Execute {act_type}"
            )
            validated_actions.append(action)

        return validated_actions, reasoning, done

    @staticmethod
    def create_action(
        action_type: ActionType,
        element_id: Optional[str] = None,
        value: Optional[str] = None,
        reason: Optional[str] = None,
        **kwargs
    ) -> AgentAction:
        """
        Helper method to construct an AgentAction programmatically.
        """
        return AgentAction(
            action_id=f"act_{uuid.uuid4().hex[:8]}",
            type=action_type,
            element_id=element_id,
            value=value,
            reason=reason or f"Perform {action_type}",
            **kwargs
        )
