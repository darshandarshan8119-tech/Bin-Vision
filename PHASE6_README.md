# Phase 6: Backend Agent (FastAPI, WebSockets, & LLM Planner)

## 1. Overview & Architecture

Phase 6 introduces the Python backend agent for **BIN-Vision**. The backend serves as the reasoning brain of the browser automation system while strictly preserving the privacy guarantees established in Phases 1–5.

```
       Chrome MV3 Extension                        FastAPI Backend (/ws/agent)
 ┌───────────────────────────────┐               ┌───────────────────────────────┐
 │ 1. DOM Perception & UPR       │               │                               │
 │ 2. Local PII Redaction        │  WebSocket    │ 4. Task Planner               │
 │ 3. TokenStore (SECRET_xxx)    │──────────────>│    - LLM / Heuristic Engine   │
 │                               │ page_context  │    - Form Flow Understanding  │
 │                               │               │                               │
 │                               │<──────────────│ 5. Action Generator           │
 │ 6. Action Validator           │    action     │    - Structured AgentAction   │
 │ 7. Action Executor            │               │    - Zero-PII Leakage         │
 └───────────────────────────────┘               └───────────────────────────────┘
```

---

## 2. Privacy & Security Invariants Enforced

1. **Zero Raw PII on Server**:
   - The backend server only ever receives sanitized `UnifiedPageRepresentation` JSON.
   - PII field values are substituted with `SECRET_xxx` tokens (generated in client-side memory) or redacted category placeholders (`[EMAIL]`, `[PERSON]`).
   - Passwords are never sent to or requested by the backend; they are managed exclusively by the client's encrypted `user_profile_store`.
2. **Action Validation Gate**:
   - LLM-generated actions are strictly validated against allowlisted action types (`fill`, `click`, `select`, `scroll`, `navigate`, `wait`, `submit`, `back`).
   - Actions targeting non-existent elements or disallowed types are discarded.
3. **Runaway Loop Protection**:
   - Built-in `max_steps` threshold (default: 20 actions per task) prevents infinite loops.

---

## 3. Directory Structure

```
backend/
├── main.py                     # FastAPI application entry point with CORS & lifecycle
├── requirements.txt            # Python dependencies (fastapi, uvicorn, pydantic, pytest)
├── .env.example                # Configuration template
├── routers/
│   ├── health.py               # REST health check & status endpoints
│   └── agent.py                # WebSocket endpoint (/ws/agent) & REST fallback (/api/agent/act)
├── agent/
│   ├── llm_client.py           # Multi-provider LLM abstraction (Heuristic, Mock, OpenAI, Ollama)
│   ├── prompt_templates.py     # System & user prompts enforcing zero-PII and JSON output
│   ├── action_generator.py     # Parses, cleans, and validates LLM JSON into AgentAction models
│   └── planner.py              # TaskPlanner orchestrator with fallback strategies
├── models/
│   ├── upr_schema.py           # Pydantic models matching TypeScript UPR types
│   └── action_schema.py        # Pydantic models matching AgentAction & WebSocket messages
└── tests/
    ├── test_models.py          # UPR & Action model serialization/deserialization tests
    ├── test_planner.py         # Heuristic planner, action generator, and step budget tests
    ├── test_health.py          # REST endpoints (/health, /api/agent/act) tests
    └── test_websocket.py       # Full bidirectional WebSocket integration tests
```

---

## 4. WebSocket Wire Protocol Specification

Endpoint: `ws://localhost:8000/ws/agent`

### 4.1. Extension → Backend Messages

#### `page_context`
Transmits the user goal and sanitized UPR to initiate or continue planning:
```json
{
  "session_id": "tab_101",
  "message_type": "page_context",
  "goal": "Fill the registration form",
  "upr": {
    "page": { "title": "Sign Up", "url": "https://example.com/signup", "snapshot_hash": "sha256:abc", "timestamp": 1725516000 },
    "elements": [
      {
        "id": "e1",
        "tagName": "INPUT",
        "type": "input",
        "label": "Email Address",
        "semantic": "EMAIL",
        "tokenized": "SECRET_001_8FB8695B",
        "visible": true,
        "interactable": true
      }
    ],
    "forms": [],
    "perception_source": ["dom"],
    "overall_confidence": 0.95
  },
  "step": 1
}
```

#### `action_result`
Reports the execution outcome of the previously dispatched action:
```json
{
  "session_id": "tab_101",
  "message_type": "action_result",
  "action_result": {
    "action_id": "act_001",
    "success": true
  },
  "step": 1
}
```

#### `ping`
Heartbeat keepalive:
```json
{
  "session_id": "tab_101",
  "message_type": "ping",
  "step": 1
}
```

### 4.2. Backend → Extension Messages

#### `action`
Returns planned actions for the client to validate and execute:
```json
{
  "session_id": "tab_101",
  "message_type": "action",
  "actions": [
    {
      "action_id": "act_001",
      "type": "fill",
      "element_id": "e1",
      "value": "SECRET_001_8FB8695B",
      "reason": "Filling Email Address (EMAIL) with token SECRET_001_8FB8695B"
    }
  ],
  "reasoning": "Identified 1 unfilled form field to populate.",
  "done": false,
  "step": 1
}
```

#### `done`
Notifies that the task has been completed:
```json
{
  "session_id": "tab_101",
  "message_type": "done",
  "actions": [],
  "reasoning": "All fields filled and no further actionable elements detected. Task complete.",
  "done": true,
  "step": 2
}
```

#### `pong`
Heartbeat response:
```json
{
  "session_id": "tab_101",
  "message_type": "pong",
  "step": 1
}
```

---

## 5. Running the Backend & Tests

### 5.1. Install Dependencies
```bash
pip install -r backend/requirements.txt
```

### 5.2. Run Backend Tests
```bash
python -m pytest backend/tests -v
```
Output:
```
======================== 16 passed in 0.46s ========================
```

### 5.3. Start Development Server
```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
Interactive Swagger Documentation available at:
`http://localhost:8000/docs`

---

## 6. Verification Checklist

- [x] Pydantic models for UPR, Actions, and wire messages matching TypeScript schemas.
- [x] Multi-provider LLM abstraction (Heuristic, Mock, OpenAI, Ollama).
- [x] Action generator with robust markdown and JSON sanitization.
- [x] Task planner with element verification and runaway loop safety limit.
- [x] WebSocket handler supporting `page_context`, `action_result`, `ping/pong`, and errors.
- [x] REST fallback endpoint `POST /api/agent/act`.
- [x] Extension-side `AgentWebSocketClient` in `extension/src/background/agent_ws_client.ts`.
- [x] 100% test pass rate across backend pytest suite (16 tests) and extension vitest suite (90 tests).
