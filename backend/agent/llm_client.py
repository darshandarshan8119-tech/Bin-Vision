"""
llm_client.py

Abstraction layer for LLM providers (OpenAI, Ollama, and Heuristic/Mock).
Provides a unified async interface for generating plan responses.
"""
import os
import json
import re
import logging
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
import httpx

logger = logging.getLogger("bin_vision.llm_client")


class LLMClient(ABC):
    @abstractmethod
    async def generate_plan(self, system_prompt: str, user_prompt: str) -> str:
        """
        Takes system prompt and user prompt, returns raw JSON string containing actions and reasoning.
        """
        pass


class HeuristicLLMClient(LLMClient):
    """
    Deterministic rule-based planner.
    Analyzes the UPR elements directly from the user prompt or context,
    providing instant, offline, deterministic planning for testing, CI,
    and fast local development without requiring external API keys.
    """
    async def generate_plan(self, system_prompt: str, user_prompt: str) -> str:
        # Extract UPR JSON from the prompt if present
        upr_data = {}
        match = re.search(r"### SANITIZED UNIFIED PAGE REPRESENTATION \(UPR\):\s*(\{.*?\})\s*(?:Analyze|$)", user_prompt, re.DOTALL)
        if match:
            try:
                upr_data = json.loads(match.group(1))
            except Exception as e:
                logger.warning(f"Failed to parse UPR in Heuristic client: {e}")

        elements = upr_data.get("elements", [])
        actions = []
        act_counter = 1

        # Check for unfilled inputs
        unfilled_inputs = [
            e for e in elements
            if e.get("visible", True)
            and e.get("interactable", True)
            and e.get("type") in ("input", "textarea", "select")
            and not e.get("value")
            and e.get("semantic") != "SUBMIT"
        ]

        if unfilled_inputs:
            for elem in unfilled_inputs:
                elem_id = elem.get("id", f"e{act_counter}")
                token = elem.get("tokenized") or f"SECRET_{elem_id.upper()}"
                semantic = elem.get("semantic", "FIELD")
                label = elem.get("label", semantic)

                if elem.get("type") == "select":
                    actions.append({
                        "action_id": f"act_{act_counter}",
                        "type": "select",
                        "element_id": elem_id,
                        "value": token,
                        "reason": f"Selecting option for {label} ({semantic})"
                    })
                else:
                    actions.append({
                        "action_id": f"act_{act_counter}",
                        "type": "fill",
                        "element_id": elem_id,
                        "value": token,
                        "reason": f"Filling {label} ({semantic}) with token {token}"
                    })
                act_counter += 1

            return json.dumps({
                "actions": actions,
                "reasoning": f"Identified {len(actions)} unfilled form fields to populate with tokenized user profile values.",
                "done": False
            })

        # If inputs are filled, look for a submit/action button
        submit_buttons = [
            e for e in elements
            if e.get("visible", True)
            and e.get("interactable", True)
            and (
                e.get("semantic") == "SUBMIT"
                or e.get("type") == "button"
                or (e.get("tagName") == "BUTTON" and "submit" in (e.get("innerText") or "").lower())
            )
        ]

        if submit_buttons:
            btn = submit_buttons[0]
            btn_id = btn.get("id", "btn_submit")
            actions.append({
                "action_id": f"act_{act_counter}",
                "type": "click",
                "element_id": btn_id,
                "reason": f"Submitting form via {btn.get('label') or btn.get('innerText') or 'Submit button'}"
            })
            return json.dumps({
                "actions": actions,
                "reasoning": "All required form fields populated; triggering submission.",
                "done": False
            })

        # Otherwise, task is done
        return json.dumps({
            "actions": [],
            "reasoning": "All fields filled and no further actionable elements detected. Task complete.",
            "done": True
        })


class MockLLMClient(LLMClient):
    """
    Configurable mock client for unit testing specific edge cases.
    """
    def __init__(self, canned_response: Optional[str] = None):
        self.canned_response = canned_response or json.dumps({
            "actions": [
                {
                    "action_id": "act_mock_1",
                    "type": "fill",
                    "element_id": "e1",
                    "value": "SECRET_MOCK_1",
                    "reason": "Mock action for test"
                }
            ],
            "reasoning": "Mock reasoning for test",
            "done": False
        })

    def set_response(self, response_json_str: str):
        self.canned_response = response_json_str

    async def generate_plan(self, system_prompt: str, user_prompt: str) -> str:
        return self.canned_response


class OpenAIClient(LLMClient):
    """
    OpenAI Chat Completion client with JSON mode.
    """
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.model = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.endpoint = "https://api.openai.com/v1/chat/completions"

    async def generate_plan(self, system_prompt: str, user_prompt: str) -> str:
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is not set in environment or constructor")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(self.endpoint, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]


class OllamaClient(LLMClient):
    """
    Local Ollama client with structured JSON output.
    """
    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None):
        self.base_url = (base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")).rstrip("/")
        self.model = model or os.getenv("OLLAMA_MODEL", "llama3:8b")
        self.endpoint = f"{self.base_url}/api/chat"

    async def generate_plan(self, system_prompt: str, user_prompt: str) -> str:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.1}
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(self.endpoint, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["message"]["content"]


def get_llm_client(provider: Optional[str] = None) -> LLMClient:
    """
    Factory function returning the configured LLMClient.
    Defaults to 'heuristic' if no provider is configured or if keys are missing.
    """
    prov = (provider or os.getenv("LLM_PROVIDER", "heuristic")).lower().strip()

    if prov == "openai":
        key = os.getenv("OPENAI_API_KEY", "")
        if key and key != "your-openai-api-key-here":
            return OpenAIClient()
        logger.warning("OPENAI_API_KEY not configured. Falling back to HeuristicLLMClient.")
        return HeuristicLLMClient()

    if prov == "ollama":
        return OllamaClient()

    if prov == "mock":
        return MockLLMClient()

    return HeuristicLLMClient()
