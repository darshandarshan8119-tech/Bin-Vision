# Phase 9: Full Agent Loop + SPA Support

## 1. Overview & Architecture

Phase 9 completes the **core autonomy loop** of BIN-Vision. The three-tier perception pipeline (Phases 1–8) is now unified into a closed-loop, multi-step autonomous agent that:

1. **Observes** the page state — checking a DOM hash cache to avoid redundant perception.
2. **Perceives** — runs DOM analysis, and escalates to OCR/Vision as needed.
3. **Sanitizes & Tokenizes** — auto-populates `SECRET_xxx` tokens from the user profile; runs the privacy gate before sending UPR to backend.
4. **Reasons** — sends the sanitized UPR to the backend planner over WebSocket.
5. **Validates** — runs every action through `action_validator.ts` (8-point security checklist).
6. **Executes** — calls `action_executor.ts` to fill/click/select/navigate in the DOM.
7. **Waits for DOM Settling** — `DOMMutationWatcher` debounces SPA re-renders.
8. **Repeats** — back to step 1, up to a configurable maximum step budget.

```
                ┌─────────────────────────────────┐
                │           AGENT LOOP             │
                │                                 │
   ┌────────────▼──────────────┐                 │
   │  1. OBSERVE               │                 │
   │   PageStateCache.hash()   │                 │
   │   Cache hit? → skip       │                 │
   └────────────┬──────────────┘                 │
                │ miss                            │
   ┌────────────▼──────────────┐                 │
   │  2. PERCEIVE              │                 │
   │   buildUPR()              │                 │
   │   (DOM → OCR → Vision)    │                 │
   └────────────┬──────────────┘                 │
                │                                 │
   ┌────────────▼──────────────┐                 │
   │  3. SANITIZE & TOKENIZE   │                 │
   │   prepareTokens()         │                 │
   │   redactUPR()             │                 │
   │   verifySanitization() ✓  │◄── SECURITY     │
   └────────────┬──────────────┘    GATE         │
                │                                 │
   ┌────────────▼──────────────┐                 │
   │  4. REASON                │                 │
   │   planProvider(UPR, step) │                 │
   │   → BackendToExtMessage   │                 │
   └────────────┬──────────────┘                 │
                │                                 │
   ┌────────────▼──────────────┐                 │
   │  5. VALIDATE              │                 │
   │   validateAction(…)       │                 │
   │   (8-pt security check)   │                 │
   └────────────┬──────────────┘                 │
                │                                 │
   ┌────────────▼──────────────┐                 │
   │  6. EXECUTE               │                 │
   │   executeAction(…)        │                 │
   └────────────┬──────────────┘                 │
                │                                 │
   ┌────────────▼──────────────┐                 │
   │  7. WAIT FOR DOM          │                 │
   │   DOMMutationWatcher      │                 │
   │   waitForNextChange(350)  │                 │
   └────────────┬──────────────┘                 │
                │                                 │
                └────────────────────────────────►┘
                        next cycle
```

---

## 2. Key Modules Implemented

### 2.1. Agent Loop (`extension/src/agent/agent_loop.ts`)

The central orchestrator. Key design decisions:

| Feature | Implementation |
|---------|---------------|
| **Circuit Breaker** | `maxSteps` (default 20). Loop stops and returns `success: false` when budget exceeded. |
| **Zero-PII Gate** | `verifySanitization()` halts the loop with an error if any raw PII leaks through redaction. |
| **Token Auto-Population** | `prepareTokensForFormFields()` matches each UPR element to user profile data and generates `SECRET_xxx` tokens in-memory. Password fields are always skipped (direct fill). |
| **User Confirmation Hook** | `confirmationProvider` callback lets the UI panel intercept `submit`/`navigate`/`back` actions. |
| **State Callbacks** | `onStateChange` streams every transition (`OBSERVING`, `PERCEIVING`, `SANITIZING`, `REASONING`, `VALIDATING`, `EXECUTING`, `WAITING_FOR_DOM`, `DONE`, `ERROR`, `ABORTED`) to the transparency panel. |
| **Clean Abort** | `abort()` sets a flag checked between every step — no action mid-flight is interrupted. |

### 2.2. DOM Mutation Watcher (`extension/src/perception/mutation_observer.ts`)

SPA-aware DOM change detection with debouncing:

- **MutationObserver** watches `document.body` for `childList`, `attributes`, `subtree` changes.
- **300ms debounce** (configurable) prevents rapid re-analysis during CSS animations or React reconciliation.
- **`waitForNextChange(timeoutMs)`** returns a `Promise<boolean>` the agent loop awaits each cycle — resolves `true` on change, `false` on timeout. This makes the loop responsive to SPA route transitions.
- **`triggerChange()`** synthetic trigger for testing without real DOM mutations.

### 2.3. Page State Cache (`extension/src/perception/page_state_cache.ts`)

Avoids re-running the full perception pipeline if the DOM hasn't changed:

- **SHA-256 hash** of a structural digest (tag names, element IDs, input names, values, disabled states) of the first 100 interactive elements.
- **Fast FNV-1a fallback** when `crypto.subtle` is unavailable.
- **LRU eviction** — max 10 cached UPRs (configurable), oldest evicted first.
- **`hasChanged(newHash)`** — compares against last known hash for quick state diff.

---

## 3. Security & Privacy Invariants

| Invariant | Enforcement Point |
|-----------|------------------|
| Zero raw PII to backend | `verifySanitization()` security gate — loop halts if violated |
| Passwords never tokenized | `prepareTokensForFormFields()` — PASSWORD/CONFIRM_PASSWORD skipped always |
| Actions validated before execution | `validateAction()` 8-point checklist per action |
| Submit/navigate require user confirmation | `CONFIRM_REQUIRED_ACTIONS` checked; `confirmationProvider` callback invoked |
| Runaway loop protection | `maxSteps` circuit breaker (default: 20) |
| Token auto-expiry | `tokenStore.clear()` on tab close / navigation |

---

## 4. SPA Support

The agent loop is designed for **Single Page Applications** (React, Vue, Next.js, Angular) where DOM changes happen asynchronously without full page reloads:

```typescript
// Step 7 in every loop cycle:
await domMutationWatcher.waitForNextChange(350);
// • If the SPA updates the DOM within 350ms → re-hashes page and continues
// • If nothing changes → timeout returns false → loop continues immediately
// • DOMMutationWatcher debounces rapid micro-mutations (React renders, etc.)
```

The `PageStateCache` ensures that if the DOM hash is identical to the previous step, the agent skips the expensive perception pipeline and reuses the cached UPR — making the loop fast even on pages that don't change between steps.

---

## 5. Test Coverage

Unit + integration tests in `extension/tests/agent_loop.test.ts`:

| Test | What it verifies |
|------|-----------------|
| `computes consistent hashes and detects state changes` | SHA-256 hash stability; hash changes when DOM values change |
| `caches and returns UnifiedPageRepresentation objects` | Cache hit/miss, LRU eviction |
| `starts, triggers changes, and resolves waitForNextChange` | MutationObserver lifecycle; `triggerChange()` → `waitForNextChange()` resolves |
| **`completes a 5-step form filling task on SPA page`** | Full 5-step cycle: fill name → fill email → select country → click submit → done. Verifies DOM values updated correctly. |
| `trips circuit breaker when task exceeds max steps budget` | Infinite planner → 3-step budget → `error` contains `"circuit breaker"` |
| `aborts task cleanly on abort() call` | `abort()` inside planProvider → state = `ABORTED` |

---

## 6. Verification Results

### 6.1. Extension Tests
```bash
pnpm --dir extension test
```
```
Test Files  15 passed (15)
     Tests  108 passed (108)
  Duration  5.45s
```

### 6.2. TypeScript Typecheck
```bash
pnpm --dir extension type-check
# 0 errors
```

### 6.3. Production Build
```bash
pnpm --dir extension build
# ✓ built in 1.69s
```

---

## 7. Verification Checklist

- [x] `AgentLoop` class with full Observe→Perceive→Sanitize→Reason→Validate→Execute→Observe cycle.
- [x] `DOMMutationWatcher` with 300ms debounce and `waitForNextChange()` Promise API.
- [x] `PageStateCache` with SHA-256 + fast fallback hashing and LRU eviction.
- [x] Zero-PII `verifySanitization()` security gate integrated into loop.
- [x] Auto-population of `SECRET_xxx` tokens from `UserProfileStore` (passwords excluded).
- [x] Circuit breaker (`maxSteps`) prevents runaway loops.
- [x] Clean `abort()` method for user-triggered loop termination.
- [x] `onStateChange` and `onActionComplete` callbacks for transparency panel integration.
- [x] jsdom-aware `isVisible()` fix in DOM analyzer for headless test compatibility.
- [x] Fixed `validateAction()` call signature in agent loop (was passing wrong args).
- [x] Fixed `executeAction()` call (was referencing non-existent `actionExecutor.execute()`).
- [x] **108 tests passing** across all 15 extension test suites.
- [x] 0 TypeScript errors.
- [x] Production bundle built successfully.
