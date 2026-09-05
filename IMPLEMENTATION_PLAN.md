# BIN-Vision — SIH26171 Implementation Plan

> **Local Perception + Local Privacy + Server Reasoning + Local Execution**
>
> Privacy-preserving, lightweight browser agent extension for automated form understanding and filling.

---

## Table of Contents

1. [Final Architecture Diagram](#1-final-architecture-diagram)
2. [Technology Stack Decisions](#2-technology-stack-decisions)
3. [Open Source Dependencies (What You Need to Gather)](#3-open-source-dependencies-what-you-need-to-gather)
4. [Project Folder Structure](#4-project-folder-structure)
5. [Module Responsibilities](#5-module-responsibilities)
6. [Data Flow Between Modules](#6-data-flow-between-modules)
7. [Extension ↔ Backend API Design](#7-extension--backend-api-design)
8. [Unified Page Representation Schema](#8-unified-page-representation-schema)
9. [PII Detection and Redaction Strategy](#9-pii-detection-and-redaction-strategy)
10. [Secret Token Architecture](#10-secret-token-architecture)
11. [Two-Stage Perception Strategy (with Confidence Thresholds)](#11-two-stage-perception-strategy-with-confidence-thresholds)
12. [Agent Action Schema](#12-agent-action-schema)
13. [Security Risks and Mitigations](#13-security-risks-and-mitigations)
14. [Development Phases and Testing Strategy](#14-development-phases-and-testing-strategy)

---

## 1. Final Architecture Diagram

```
                         USER
                           |
              +------------v-------------+
              |      BROWSER EXTENSION    |
              |  (Chrome MV3 Extension)   |
              +------------+-------------+
                           |
              +------------v-------------+
              |   STAGE 1: DOM/A11Y       |
              |   PERCEPTION ENGINE       |
              |   (content script)        |
              +------------+-------------+
                           |
                    Confidence Score
                    +------+------+
                 >= 0.7         < 0.7
                    |              |
                    |   +----------v----------+
                    |   |  STAGE 2: OCR        |
                    |   |  (Tesseract.js WASM) |
                    |   +----------+----------+
                    |              |
                    |        < 0.4 confidence
                    |              |
                    |   +----------v----------+
                    |   |  STAGE 3: VISION     |
                    |   |  (ONNX Runtime Web)  |
                    |   +----------+----------+
                    |              |
                    +------+-------+
                           |
              +------------v-------------+
              |  UNIFIED PAGE             |
              |  REPRESENTATION (UPR)     |
              |  (JSON object)            |
              +------------+-------------+
                           |
              +------------v-------------+
              |  LOCAL PRIVACY ENGINE     |
              |  PII Detector +           |
              |  Redactor + Tokenizer     |
              +------------+-------------+
                           |
                    SANITIZED UPR
                    (no raw PII)
                           |
              +------------v-------------+
              |  BACKGROUND SERVICE       |
              |  WORKER (MV3)             |
              |  WebSocket client         |
              +------------+-------------+
                           |  (WebSocket)
              +------------v-------------+
              |  FASTAPI BACKEND          |
              |  + LLM/VLM               |
              |  (OpenAI / local Ollama)  |
              +------------+-------------+
                           |
                  STRUCTURED ACTION JSON
                           |
              +------------v-------------+
              |  LOCAL ACTION VALIDATOR   |
              +------------+-------------+
                           |
              +------------v-------------+
              |  BROWSER ACTION EXECUTOR  |
              |  (click/fill/select/etc.) |
              +------------+-------------+
                           |
                       NEW STATE
                           |
                     OBSERVE AGAIN
                     (MutationObserver)
```

---

## 2. Technology Stack Decisions

### Browser Extension
| Component | Technology | Reason |
|-----------|-----------|--------|
| Extension type | Chrome Manifest V3 | Current standard, required for MV3 service workers |
| Language | TypeScript | Type safety, better tooling, catches bugs early |
| Bundler | Vite + CRXJS plugin | Fast HMR, MV3-compatible, easy TS config |
| Messaging | Chrome Messaging API (not WebSocket from content script) | Secure; content script to background worker to server |

### Local ML / Perception
| Component | Technology | Model Size | Reason |
|-----------|-----------|-----------|--------|
| OCR | Tesseract.js (WASM) | ~4 MB | Runs fully in-browser, no server call |
| Vision fallback | ONNX Runtime Web | ~5-15 MB | WebGPU support, quantized models, cross-platform |
| Semantic field classifier | Rule-based engine + small ONNX text classifier | <2 MB | Rules cover 90% of forms; ML for ambiguous cases |
| Face / ID detection | face-api.js or tiny YOLOv8n ONNX | ~6 MB | Lightweight, WASM-compatible |

### Backend
| Component | Technology | Reason |
|-----------|-----------|--------|
| Framework | FastAPI (Python 3.11+) | Async, WebSocket support, auto OpenAPI docs |
| LLM integration | LangChain / direct OpenAI SDK | Provider-agnostic, easy swapping |
| LLM (cloud option) | OpenAI GPT-4o-mini | Cost-efficient reasoning |
| LLM (local option) | Ollama + llama3.2 / mistral-7b | Fully local option for max privacy |
| Communication | WebSocket (primary) + REST (fallback) | Lower latency for multi-step agentic loops |
| Session store | In-memory (Redis optional for scale) | Fast, no sensitive data persisted to disk |

### Dev / Build Tools
| Tool | Use |
|------|-----|
| pnpm | Package management (faster than npm) |
| ESLint + Prettier | Code quality |
| Vitest | Unit testing for extension modules |
| Pytest | Backend testing |
| Playwright | End-to-end testing of browser actions |

---

## 3. Open Source Dependencies (What You Need to Gather)

> **Action Required:** Download / install these before development begins.
> Each item includes the source URL and what it is used for.

### 3.1 Extension / Frontend Dependencies

| # | Package | Source | Use | Install Command |
|---|---------|--------|-----|----------------|
| 1 | `tesseract.js` | https://github.com/naptha/tesseract.js | OCR for visual PII detection | `pnpm add tesseract.js` |
| 2 | `onnxruntime-web` | https://github.com/microsoft/onnxruntime | Run ONNX vision models in browser | `pnpm add onnxruntime-web` |
| 3 | `face-api.js` | https://github.com/justadudewhohacks/face-api.js | Face detection in screenshots | `pnpm add face-api.js` |
| 4 | `@crxjs/vite-plugin` | https://github.com/crxjs/chrome-extension-tools | Build Chrome MV3 extension with Vite | `pnpm add -D @crxjs/vite-plugin` |
| 5 | `vite` | https://github.com/vitejs/vite | Bundler | `pnpm add -D vite` |
| 6 | `typescript` | https://github.com/microsoft/TypeScript | TypeScript support | `pnpm add -D typescript` |
| 7 | `compromise` | https://github.com/spencermountain/compromise | Lightweight NLP for name/entity detection | `pnpm add compromise` |
| 8 | `dompurify` | https://github.com/cure53/DOMPurify | Sanitize HTML before processing | `pnpm add dompurify` |
| 9 | `idb` | https://github.com/jakearchibald/idb | Typed IndexedDB wrapper (for user profile store) | `pnpm add idb` |
| 10 | `zod` | https://github.com/colinhacks/zod | Runtime schema validation for action JSON | `pnpm add zod` |

### 3.2 Pre-trained ONNX Models to Download

> Download these model files separately and place them in `extension/public/models/`

| # | Model | Source | Size | Use |
|---|-------|--------|------|-----|
| 1 | `mobilenetv2-7.onnx` | https://github.com/onnx/models | ~14 MB | Image scene classification (vision fallback) |
| 2 | YOLOv8n (ONNX export) | https://github.com/ultralytics/ultralytics | ~6 MB | Object/region detection |
| 3 | face detection (tiny) | https://github.com/justadudewhohacks/face-api.js/tree/master/weights | ~190 KB | Face region detection |
| 4 | Tesseract `eng.traineddata` | https://github.com/tesseract-ocr/tessdata_fast | ~4 MB | English OCR |
| 5 | Text classifier ONNX | (Train or use HuggingFace ONNX export) | <2 MB | Semantic form field classification |

> **Note on the text classifier:** You can export a small DistilBERT or a tiny custom model from HuggingFace to ONNX format using the `optimum` library. Alternatively, start with the pure rule-based classifier (Phase 2) and add ML later.

### 3.3 Backend / Python Dependencies

```
# requirements.txt (to be created in backend/)

fastapi>=0.111.0
uvicorn[standard]>=0.29.0
websockets>=12.0
langchain>=0.2.0
langchain-openai>=0.1.0
openai>=1.30.0
python-dotenv>=1.0.0
pydantic>=2.7.0
pytest>=8.2.0
httpx>=0.27.0        # for async HTTP in tests
redis>=5.0.0         # optional, for session store
```

> Install with: `pip install -r requirements.txt`

### 3.4 Optional: Local LLM Setup (for fully offline mode)

| Tool | Source | Use |
|------|--------|-----|
| Ollama | https://ollama.com | Run LLMs locally |
| llama3.2:3b model | `ollama pull llama3.2:3b` | Lightweight local reasoning |
| mistral:7b model | `ollama pull mistral:7b` | Better reasoning, heavier |

> For the SIH demo, **cloud LLM (GPT-4o-mini) is recommended** for reliability. Local LLM is a bonus feature.

### 3.5 Dev / Test Tools

| Tool | Source | Install |
|------|--------|---------|
| pnpm | https://pnpm.io | `npm install -g pnpm` |
| Playwright | https://playwright.dev | `pnpm add -D playwright` |
| Vitest | https://vitest.dev | `pnpm add -D vitest` |

---

## 4. Project Folder Structure

```
BIN-vision/
+-- extension/                          # Chrome MV3 extension
|   +-- manifest.json                   # MV3 manifest
|   +-- vite.config.ts                  # Vite + CRXJS config
|   +-- tsconfig.json
|   +-- package.json
|   |
|   +-- public/
|   |   +-- models/                     # ONNX models + Tesseract data
|   |   |   +-- eng.traineddata
|   |   |   +-- mobilenetv2.onnx
|   |   |   +-- yolov8n.onnx
|   |   |   +-- face_detection_tiny.onnx
|   |   +-- icons/
|   |
|   +-- src/
|       +-- background/
|       |   +-- service_worker.ts       # MV3 background service worker
|       |                               # Manages WebSocket to backend
|       |                               # Routes messages between content + server
|       |
|       +-- content/
|       |   +-- index.ts                # Content script entry point
|       |                               # Injected into every webpage
|       |
|       +-- perception/
|       |   +-- dom_analyzer.ts         # DOM/A11Y extraction
|       |   +-- form_detector.ts        # Form and field identification
|       |   +-- semantic_classifier.ts  # Field semantic labeling (NAME/EMAIL/etc.)
|       |   +-- confidence_scorer.ts    # DOM confidence score calculator
|       |   +-- ocr_engine.ts           # Tesseract.js OCR wrapper
|       |   +-- vision_engine.ts        # ONNX vision model runner
|       |   +-- page_state_cache.ts     # Hash-based state diff cache
|       |   +-- mutation_observer.ts    # DOM change detection (SPA support)
|       |
|       +-- privacy/
|       |   +-- pii_detector.ts         # PII detection: DOM + regex + OCR
|       |   +-- redactor.ts             # Mask/replace PII in UPR
|       |   +-- token_store.ts          # In-memory SECRET_xxx token map
|       |   +-- pattern_rules.ts        # Regex patterns for email/phone/card etc.
|       |
|       +-- representation/
|       |   +-- unified_page_rep.ts     # Build and export UPR JSON
|       |
|       +-- agent/
|       |   +-- action_validator.ts     # Validate LLM-returned action JSON
|       |   +-- action_executor.ts      # Execute validated actions in DOM
|       |   +-- agent_loop.ts           # Full Observe->Perceive->Sanitize->Act loop
|       |
|       +-- profile/
|       |   +-- user_profile_store.ts   # Encrypted local user data (IndexedDB)
|       |
|       +-- ui/
|       |   +-- popup/
|       |   |   +-- popup.html          # Extension popup
|       |   |   +-- popup.ts
|       |   +-- panel/
|       |       +-- panel.html          # Transparency panel (side panel)
|       |       +-- panel.ts
|       |
|       +-- shared/
|           +-- types.ts                # All shared TypeScript types/interfaces
|           +-- schemas.ts              # Zod schemas for runtime validation
|           +-- constants.ts            # Thresholds, patterns, config
|           +-- logger.ts              # Safe logger (never logs sensitive values)
|
+-- backend/                            # FastAPI server
|   +-- main.py                         # FastAPI app entry point
|   +-- requirements.txt
|   +-- .env.example                    # API key template
|   |
|   +-- routers/
|   |   +-- agent.py                    # WebSocket agent endpoint
|   |   +-- health.py                   # Health check REST endpoint
|   |
|   +-- agent/
|   |   +-- llm_client.py               # LLM/VLM abstraction (OpenAI / Ollama)
|   |   +-- planner.py                  # Task planning from UPR + user goal
|   |   +-- action_generator.py         # Generate structured action JSON
|   |   +-- prompt_templates.py         # System/user prompt templates
|   |
|   +-- models/
|   |   +-- upr_schema.py               # UPR Pydantic model
|   |   +-- action_schema.py            # Action Pydantic model
|   |
|   +-- tests/
|       +-- test_agent.py
|       +-- test_actions.py
|
+-- tests/                              # E2E tests
|   +-- e2e/
|   |   +-- test_form_filling.spec.ts   # Playwright tests
|   |   +-- test_pii_redaction.spec.ts
|   +-- fixtures/
|       +-- sample_forms/               # Test HTML pages
|
+-- docs/
|   +-- architecture.md
|   +-- api_reference.md
|   +-- privacy_model.md
|
+-- AI_GUIDELINES.md
+-- SIH26171 Browser Agent Development Prompt.md
+-- IMPLEMENTATION_PLAN.md              # This file
```

---

## 5. Module Responsibilities

### Extension Side

| Module | File | Responsibility |
|--------|------|----------------|
| DOM Analyzer | `dom_analyzer.ts` | Traverse DOM, extract all interactive elements (inputs, buttons, links, forms), bounding boxes, ARIA attributes, labels |
| Form Detector | `form_detector.ts` | Group elements into logical forms; detect multi-step forms |
| Semantic Classifier | `semantic_classifier.ts` | Classify each field as NAME / EMAIL / PHONE / PASSWORD / DATE / ADDRESS / etc. using rules + signals |
| Confidence Scorer | `confidence_scorer.ts` | Calculate a 0-1 confidence score for how well DOM analysis understood the page |
| OCR Engine | `ocr_engine.ts` | Run Tesseract.js on screenshots or specific image regions; extract text |
| Vision Engine | `vision_engine.ts` | Run ONNX models for object/face detection when DOM is insufficient |
| Page State Cache | `page_state_cache.ts` | Hash current DOM state; skip re-analysis if unchanged |
| Mutation Observer | `mutation_observer.ts` | Watch for DOM changes (SPA navigation, dynamic content); trigger re-analysis on change |
| PII Detector | `pii_detector.ts` | Apply pattern rules + NLP to find PII in text content and field values |
| Redactor | `redactor.ts` | Replace PII in UPR with [LABEL] placeholders before sending to server |
| Token Store | `token_store.ts` | In-memory only. Map SECRET_xxx to actual value; scoped to tab session; auto-clear on unload |
| Unified Page Rep | `unified_page_rep.ts` | Merge outputs of perception stages into a single canonical JSON object |
| Action Validator | `action_validator.ts` | Validate LLM action: element exists, is visible, is interactable, action type is in allowlist |
| Action Executor | `action_executor.ts` | Safely execute validated actions in the DOM |
| Agent Loop | `agent_loop.ts` | Orchestrate the full Observe -> Perceive -> Sanitize -> Reason -> Validate -> Execute -> Observe cycle |
| User Profile Store | `user_profile_store.ts` | Store user own data (name, email, etc.) in encrypted IndexedDB. Source for fill values |
| Service Worker | `service_worker.ts` | Manage WebSocket connection to backend; route messages between content script and server |

### Backend Side

| Module | File | Responsibility |
|--------|------|----------------|
| WebSocket Handler | `routers/agent.py` | Receive sanitized UPR; return structured action JSON; manage session state |
| LLM Client | `agent/llm_client.py` | Abstraction over OpenAI / Ollama; swap providers without changing planner logic |
| Planner | `agent/planner.py` | Understand user goal + UPR; decide next action(s) |
| Action Generator | `agent/action_generator.py` | Produce structured action JSON conforming to action schema |
| Prompt Templates | `agent/prompt_templates.py` | System prompts that constrain LLM to produce valid structured output only |

---

## 6. Data Flow Between Modules

```
User triggers task ("Fill this form")
         |
         v
agent_loop.ts
         |
         v calls
dom_analyzer.ts --> extracts raw element list
         |
         v
form_detector.ts --> groups into forms
         |
         v
semantic_classifier.ts --> labels each field
         |
         v
confidence_scorer.ts --> calculates score (0.0 to 1.0)
         |
    +----+----+
  >=0.7     <0.7
    |          |
    |     ocr_engine.ts (Tesseract.js)
    |          |
    |     confidence >= 0.4?
    |       +--+--+
    |      YES    NO
    |       |      |
    |       |  vision_engine.ts (ONNX)
    |       |      |
    |       +--+---+
    +----+-----+
         |
         v
unified_page_rep.ts --> builds UPR JSON
         |
         v
pii_detector.ts --> finds PII in UPR
         |
         v
redactor.ts --> replaces PII with [LABEL]
         |
         v
token_store.ts --> maps SECRET_xxx <-> real value for form fields
         |
         v
SANITIZED UPR (no raw PII)
         |
         v
service_worker.ts --> sends over WebSocket
         |
         v
backend planner.py + action_generator.py
         |
         v
STRUCTURED ACTION JSON
         |
         v
service_worker.ts --> forwards to content script
         |
         v
action_validator.ts --> validates action
         |
         v
action_executor.ts --> executes in DOM
         |
         v
mutation_observer.ts --> detects new state
         |
         v
agent_loop.ts --> observe again (next cycle)
```

---

## 7. Extension to Backend API Design

### Transport
- **Primary:** WebSocket (`ws://localhost:8000/ws/agent`)
- **Fallback:** REST POST `/api/agent/act`

### Message Format (Extension to Backend)

```json
{
  "session_id": "tab_1234_abc",
  "message_type": "page_context",
  "goal": "Fill this registration form with my details",
  "upr": {
    "page": { "title": "...", "url": "...", "snapshot_hash": "sha256:..." },
    "elements": []
  },
  "step": 1
}
```

### Message Format (Backend to Extension)

```json
{
  "session_id": "tab_1234_abc",
  "message_type": "action",
  "step": 1,
  "actions": [
    {
      "action_id": "act_001",
      "type": "fill",
      "element_id": "e3",
      "value": "SECRET_001"
    }
  ],
  "reasoning": "Filling name field with stored user token",
  "done": false
}
```

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `page_context` | Ext to Backend | Send sanitized UPR + user goal |
| `action` | Backend to Ext | Receive structured action(s) to execute |
| `action_result` | Ext to Backend | Report success/failure of executed action |
| `done` | Backend to Ext | Task complete signal |
| `error` | Both | Error reporting |
| `ping` / `pong` | Both | Connection keepalive |

---

## 8. Unified Page Representation Schema

```typescript
// src/shared/types.ts

interface UPRElement {
  id: string;                    // e.g., "e1", "e2"
  type: "input" | "button" | "link" | "select" | "textarea" | "image" | "text";
  semantic: string;              // NAME | EMAIL | PHONE | PASSWORD | DATE | ADDRESS | CITY | STATE | COUNTRY | PINCODE | SUBMIT | NAV | OTHER
  label: string;                 // Resolved label text
  placeholder?: string;
  value?: string;                // Current field value (will be tokenized if PII)
  bbox: [number, number, number, number]; // [x, y, width, height]
  source: "dom" | "ocr" | "vision";
  confidence: number;            // 0.0 to 1.0
  interactable: boolean;
  visible: boolean;
  ariaLabel?: string;
  htmlId?: string;
  htmlName?: string;
  htmlType?: string;             // input type attribute
  autocomplete?: string;
  pii: boolean;                  // true if this field contains or expects PII
  tokenized?: string;            // "SECRET_001" if pii=true
}

interface UPRPage {
  title: string;
  url: string;
  snapshot_hash: string;         // SHA-256 of DOM snapshot for caching
  timestamp: number;
}

interface UnifiedPageRepresentation {
  page: UPRPage;
  elements: UPRElement[];
  forms: UPRForm[];
  perception_source: ("dom" | "ocr" | "vision")[];
  overall_confidence: number;
}

interface UPRForm {
  form_id: string;
  element_ids: string[];         // References to UPRElement.id
  action?: string;               // HTML form action attribute
  method?: string;
  semantic_purpose?: string;     // e.g., "REGISTRATION" | "LOGIN" | "PAYMENT"
}
```

---

## 9. PII Detection and Redaction Strategy

### Layer 1: DOM Signal Detection (always runs)
- `type="password"` -> PII: PASSWORD
- `type="email"` -> PII: EMAIL
- `autocomplete="cc-number"` -> PII: CARD
- `name` / `id` attribute matching known patterns -> PII flag
- **Cost:** Near zero (pure attribute reading)

### Layer 2: Regex Pattern Detection (always runs)
```
EMAIL:   /[\w.+-]+@[\w-]+\.[a-z]{2,}/i
PHONE:   /(\+91)?[6-9]\d{9}/   (India); generalize for international
CARD:    /\b(?:\d[ -]?){13,16}\b/
AADHAAR: /\b\d{4}\s\d{4}\s\d{4}\b/
PAN:     /[A-Z]{5}[0-9]{4}[A-Z]/
PINCODE: /\b[1-9][0-9]{5}\b/
DATE:    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/
```
- **Cost:** Negligible

### Layer 3: NLP-based Name Detection
- Use `compromise.js` to detect PERSON names in text content
- **Cost:** Low (~1-5ms per field)

### Layer 4: OCR-based PII (runs only if OCR triggered)
- OCR output text -> apply Layer 2 + Layer 3 patterns on extracted text
- **Cost:** Medium (Tesseract.js: ~200-500ms first call, faster after)

### Redaction
```
Before: { "label": "Full Name", "value": "John Doe" }
After:  { "label": "Full Name", "value": "[PERSON]", "pii": true }
```

### What Gets Sent to Server
```
The server NEVER sees:
  - Actual field values that are PII
  - Raw screenshots with faces or PII
  - Password values (ever)

The server DOES see:
  - Field types and semantic labels
  - SECRET_xxx tokens for fields that need to be filled
  - Redacted text: "[EMAIL]", "[PERSON]", "[PHONE]"
  - Non-PII text content
```

---

## 10. Secret Token Architecture

### Token Generation
```typescript
// token_store.ts (in-memory only, never persisted)

class TokenStore {
  private store: Map<string, string> = new Map(); // SECRET_xxx -> actual value
  private tabId: number;

  generate(value: string): string {
    const token = `SECRET_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    this.store.set(token, value);
    return token;
  }

  resolve(token: string): string | null {
    return this.store.get(token) ?? null;
  }

  clearAll(): void {
    this.store.clear();
  }
}
```

### Token Lifecycle
```
Tab opened -> TokenStore created (empty)
User triggers task ->
  PII fields -> generate SECRET_xxx tokens
  Tokens sent to server (NOT the actual values)
Agent returns action: { "value": "SECRET_001" }
action_executor.ts resolves SECRET_001 -> actual value -> fills DOM
Tab closed / navigation -> TokenStore.clearAll() called
```

### Security Properties
- Tokens are random and non-guessable
- Tokens stored in JavaScript memory only (not localStorage, not cookies)
- Server has no way to reverse a token
- Tokens expire with the tab session
- Passwords never get tokens -- they are filled directly from the encrypted user profile, never sent to server

---

## 11. Two-Stage Perception Strategy (with Confidence Thresholds)

### Confidence Score Formula
```
dom_confidence = (
    0.40 * label_coverage_score +    // fraction of fields with resolved labels
    0.30 * semantic_score +           // fraction of fields with known semantics
    0.20 * structural_score +         // form structure is clear
    0.10 * aria_score                 // ARIA attributes present and valid
)
```

### Escalation Thresholds
```
dom_confidence >= 0.70  ->  Use DOM only (no OCR, no vision)
dom_confidence < 0.70   ->  Trigger OCR on relevant regions
ocr_confidence >= 0.40  ->  Use DOM + OCR result
ocr_confidence < 0.40   ->  Trigger vision model (ONNX)
```

### Performance Budget (target)
| Stage | Max Latency | Trigger Condition |
|-------|------------|-------------------|
| DOM analysis | < 50ms | Always |
| OCR (Tesseract.js) | < 500ms | dom_confidence < 0.70 |
| Vision (ONNX) | < 1000ms | ocr_confidence < 0.40 |

### Caching Strategy
```typescript
// page_state_cache.ts
const hash = await sha256(document.documentElement.outerHTML);
if (hash === lastHash) {
  return cachedUPR; // Skip all perception stages
}
lastHash = hash;
// run perception pipeline...
```

### MutationObserver (SPA support)
```typescript
// mutation_observer.ts
const observer = new MutationObserver(debounce(() => {
  // Recalculate hash and re-run perception if changed
  agentLoop.onPageChange();
}, 300)); // 300ms debounce to avoid rapid-fire re-analysis

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'style', 'hidden', 'disabled']
});
```

---

## 12. Agent Action Schema

### Supported Actions
```typescript
// shared/types.ts

type ActionType = "fill" | "click" | "select" | "scroll" | "navigate" | "wait" | "submit" | "back";

interface AgentAction {
  action_id: string;             // Unique ID for this action
  type: ActionType;
  element_id?: string;           // Reference to UPRElement.id (required for DOM actions)
  value?: string;                // For fill/select (may be SECRET_xxx)
  url?: string;                  // For navigate only
  direction?: "up" | "down";    // For scroll
  duration_ms?: number;          // For wait
  reason?: string;               // LLM explanation (for transparency panel)
}
```

### Allowlist / Security Policy
```typescript
// constants.ts
const ALLOWED_ACTIONS: ActionType[] = ["fill", "click", "select", "scroll", "wait"];

// navigate is allowed ONLY to these URL patterns:
const NAVIGATE_ALLOWLIST = [
  /^https:\/\/same-domain\.com\//,
  // User can configure additional patterns
];

// These action types ALWAYS require user confirmation:
const REQUIRE_CONFIRMATION: ActionType[] = ["submit", "navigate", "back"];
```

### Validator Checklist (action_validator.ts)
```
1. action.type is in ALLOWED_ACTIONS
2. element_id exists in current UPR
3. UPR element.visible === true
4. UPR element.interactable === true
5. If value is SECRET_xxx -> token exists in TokenStore
6. If type === "navigate" -> URL matches NAVIGATE_ALLOWLIST
7. If type === "submit" -> user has confirmed
8. Element ID matches current page (no stale references)
```

---

## 13. Security Risks and Mitigations

| Risk | Severity | Mitigation |
|------|---------|-----------|
| LLM prompt injection via webpage content | High | Sanitize all webpage text before including in LLM prompt; use structured input format |
| Token store accessible by malicious webpage JS | High | Token store lives in content script scope, isolated from page JS |
| Stale token used on wrong page | Medium | Tokens cleared on tab navigation; action validator checks element is on current page |
| CSP conflicts blocking extension scripts | Medium | Use `world: "MAIN"` carefully; test against strict CSP sites in Phase 1 |
| Runaway agent loop (infinite actions) | Medium | Max actions per task = 20 (configurable); circuit breaker on repeated failures |
| Sensitive data in service worker logs | Medium | Logger wrapper that strips SECRET_xxx values; no logging of field values |
| User profile store accessible if device compromised | Low | Profile encrypted with a key derived from a user-set PIN (Web Crypto API) |
| Network interception of sanitized UPR | Low | Use WSS (TLS) in production; locally use ws:// only |
| LLM returns malicious JS instead of structured action | High | Only accept JSON conforming to action schema (Zod validation); reject everything else |

---

## 14. Development Phases and Testing Strategy

### Phase 1 — Extension Foundation
**Build:** Chrome MV3 extension skeleton + DOM analyzer
**Files:** `manifest.json`, `service_worker.ts`, `content/index.ts`, `dom_analyzer.ts`
**Test:** Load extension; verify it can list all inputs, buttons, links, labels on a test page
**Exit Criterion:** Extension prints a structured element list to console for any webpage

---

### Phase 2 — Form Perception + Semantic Classifier
**Build:** `form_detector.ts`, `semantic_classifier.ts`, `confidence_scorer.ts`
**Test:** Open 10 different registration/login forms; verify semantic labels are correct >=90% of the time
**Exit Criterion:** UPR JSON generated with correct semantic labels and confidence score

---

### Phase 3 — Privacy Engine (DOM + Regex PII)
**Build:** `pii_detector.ts`, `redactor.ts`, `pattern_rules.ts`
**Test:** Verify that no PII field values appear in the sanitized UPR output
**Exit Criterion:** Sanitized UPR contains only [LABEL] placeholders for PII fields

---

### Phase 4 — Secret Token System + User Profile Store
**Build:** `token_store.ts`, `user_profile_store.ts`
**Test:** Generate tokens, verify resolution, verify auto-clear on navigation
**Exit Criterion:** Token round-trip works; tokens cleared on tab close; passwords never tokenized (direct fill only)

---

### Phase 5 — Form Filling + Action Validator
**Build:** `action_validator.ts`, `action_executor.ts`
**Test:** Hardcode action JSON; verify fill/click work correctly with validation
**Exit Criterion:** fill/click/select actions work; invalid actions are rejected with error

---

### Phase 6 — Backend Agent (FastAPI + LLM)
**Build:** `backend/` full setup; WebSocket handler; LLM planner; action generator
**Test:** Send a sample UPR; verify backend returns valid action JSON
**Exit Criterion:** End-to-end: extension sends UPR, backend returns action, extension executes it

---

### Phase 7 — OCR Integration
**Build:** `ocr_engine.ts` (Tesseract.js); integrate into perception pipeline
**Test:** Navigate to a page with image-based text; verify OCR extracts text and appends to UPR
**Exit Criterion:** OCR-sourced elements appear in UPR with `source: "ocr"`

---

### Phase 8 — Vision Fallback (ONNX)
**Build:** `vision_engine.ts` (ONNX Runtime Web); face/region detection
**Test:** Navigate to a page with an embedded ID card or face image; verify bounding boxes detected
**Exit Criterion:** Vision-sourced elements appear in UPR; sensitive regions masked before server send

---

### Phase 9 — Full Agent Loop + SPA Support
**Build:** `agent_loop.ts`, `mutation_observer.ts`, `page_state_cache.ts`
**Test:** Multi-step task on a single-page app; verify loop handles DOM changes correctly
**Exit Criterion:** Agent completes a 5-step task (navigate -> fill -> verify -> submit) on an SPA

---

### Phase 10 — UI: Transparency Panel + User Consent
**Build:** `ui/panel/`, `ui/popup/`; confirmation dialogs for submit/navigate
**Test:** Verify user sees a review panel before form submission; user can cancel
**Exit Criterion:** No form is submitted without explicit user confirmation

---

### End-to-End Demonstration Scenarios

| Scenario | What to Demonstrate |
|----------|-------------------|
| Normal form fill | Agent fills a registration form using profile data; no PII sent to server |
| Sensitive form | Password/card form: tokens used; server sees only SECRET_xxx; values filled locally |
| Visually complex page | DOM confidence low; OCR triggered; form understood and filled correctly |
| User cancels | Agent proposes submit; user clicks Cancel; no action taken |
| Malicious action rejection | Backend returns invalid action JSON; validator rejects; error shown in panel |

---

## Pre-Development Checklist

Before writing any code, ensure you have:

- [ ] Node.js >= 20 installed
- [ ] pnpm installed globally (`npm i -g pnpm`)
- [ ] Python 3.11+ installed
- [ ] Chrome / Chromium browser installed
- [ ] OpenAI API key (or Ollama set up locally)
- [ ] ONNX model files downloaded to `extension/public/models/`
- [ ] Tesseract `eng.traineddata` downloaded to `extension/public/models/`
- [ ] All npm packages listed in Section 3.1 installed
- [ ] All Python packages in `requirements.txt` installed
- [ ] A test webpage with a registration form prepared for Phase 1 testing

---

*Document version: 1.0 — Created: 2026-09-05*
*Approved changes incorporated from initial architecture review.*
