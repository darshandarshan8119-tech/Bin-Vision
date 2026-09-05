"""
planner.py

Orchestrates multi-turn planning: digests sanitized UPR + user goal,
queries the LLM client (with heuristic fallback), validates generated actions,
and tracks task execution progress.
"""
import logging
import json
from typing import List, Tuple, Optional, Dict, Any
from ..models.upr_schema import UnifiedPageRepresentation
from ..models.action_schema import AgentAction, ActionResult
from .prompt_templates import SYSTEM_PROMPT, build_planning_user_prompt
from .llm_client import LLMClient, get_llm_client, HeuristicLLMClient
from .action_generator import ActionGenerator

logger = logging.getLogger("bin_vision.planner")


class TaskPlanner:
    """
    Manages task planning for a single session or across sessions.
    """
    def __init__(self, llm_client: Optional[LLMClient] = None, max_steps: int = 20):
        self.llm_client = llm_client or get_llm_client()
        self.heuristic_fallback = HeuristicLLMClient()
        self.max_steps = max_steps
        self.history: List[Dict[str, Any]] = []

    async def plan_next_step(
        self,
        goal: str,
        upr: UnifiedPageRepresentation,
        step: int = 1,
        previous_result: Optional[ActionResult] = None
    ) -> Tuple[List[AgentAction], str, bool]:
        """
        Plans next action(s) for the current step.
        Returns:
            (actions, reasoning, done)
        """
        if step > self.max_steps:
            reason = f"Exceeded maximum task step budget ({self.max_steps} steps). Terminating task for safety."
            logger.warning(reason)
            return [], reason, True

        # Build prompt context
        history_summary = ""
        if previous_result:
            status = "SUCCESS" if previous_result.success else f"FAILED (Error: {previous_result.error})"
            history_summary = f"Action ID: {previous_result.action_id} -> {status}"

        # Serialize sanitized UPR to JSON string for prompt
        upr_dict = upr.model_dump(exclude_none=True)
        upr_json_str = json.dumps(upr_dict, indent=2)

        user_prompt = build_planning_user_prompt(
            goal=goal,
            upr_json_str=upr_json_str,
            step=step,
            previous_results=history_summary
        )

        # Query LLM
        try:
            raw_response = await self.llm_client.generate_plan(SYSTEM_PROMPT, user_prompt)
            actions, reasoning, done = ActionGenerator.parse_llm_response(raw_response)
        except Exception as e:
            logger.warning(f"Primary LLM planner encountered error: {e}. Attempting heuristic fallback.")
            raw_response = await self.heuristic_fallback.generate_plan(SYSTEM_PROMPT, user_prompt)
            actions, reasoning, done = ActionGenerator.parse_llm_response(raw_response)

        # Cross-verify that targeted elements exist in current UPR
        valid_element_ids = {el.id for el in upr.elements}
        filtered_actions = []
        for act in actions:
            if act.element_id and act.element_id not in valid_element_ids:
                logger.warning(f"Planner filtered out action targeting non-existent element_id: {act.element_id}")
                continue
            filtered_actions.append(act)

        # If no actions remain and not explicitly marked done, check heuristic
        if not filtered_actions and not done:
            heuristic_raw = await self.heuristic_fallback.generate_plan(SYSTEM_PROMPT, user_prompt)
            filtered_actions, reasoning, done = ActionGenerator.parse_llm_response(heuristic_raw)

        # Record step
        self.history.append({
            "step": step,
            "goal": goal,
            "actions_count": len(filtered_actions),
            "reasoning": reasoning,
            "done": done
        })

        return filtered_actions, reasoning, done
