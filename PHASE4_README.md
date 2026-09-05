# BIN-Vision — Phase 4: Secret Token System & User Profile Store

> **Goal:** Establish the zero-knowledge secret token system (`TokenStore`) and the encrypted client-side `UserProfileStore`. Form fields requiring PII receive ephemeral, session-bound `SECRET_xxx` tokens that are sent to the server planner instead of raw values, while the actual sensitive data remains stored locally on-device and encrypted at rest with Web Crypto PBKDF2 + AES-GCM (256-bit).

---

## What Phase 4 Builds

| File | Purpose |
|------|---------|
| `src/profile/token_store.ts` | In-memory token store mapping ephemeral `SECRET_xxx` tokens to raw PII values |
| `src/profile/user_profile_store.ts` | On-device encrypted profile store using Web Crypto API (PBKDF2 + AES-GCM) with IndexedDB |
| `src/shared/types.ts` | Added `UserProfile` interface with comprehensive identity, contact, address, and password fields |
| `tests/token_store.test.ts` | Unit tests for token generation, resolution, deduplication, and password security invariant |
| `tests/user_profile_store.test.ts` | Unit tests for semantic field mapping, locking/purging, and AES-GCM encryption round-trip |

---

## Secret Token Architecture & Security Lifecycle

```
        USER PROFILE STORE (Encrypted at rest: PBKDF2 + AES-GCM 256)
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────┐
        │  TOKEN STORE (In-Memory Heap Only)                     │
        │  - Never written to disk, localStorage, or cookies    │
        │  - Maps: "SECRET_001_A1B2" ↔ "Darsh Shah"              │
        │  - HARD RULE: Passwords NEVER tokenized                │
        │  - Automatically cleared on tab close / navigation     │
        └────────────────────────────┬───────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
       [Sent to LLM Server]                   [Local Browser Content]
       { "value": "SECRET_001_A1B2" }         Token resolved right before
       Server NEVER sees raw PII!             DOM fill in Phase 5
```

---

## UserProfileStore Security Properties

1. **At-Rest Encryption**:
   - Master key derived via **PBKDF2** (100,000 iterations, SHA-256) from user PIN + random 16-byte salt.
   - Profile payload encrypted with **AES-GCM (256-bit)** with a unique 12-byte initialization vector (IV) per save.
   - Encrypted records stored in **IndexedDB** via `idb`.

2. **Semantic Field Resolution**:
   - Maps `SemanticType` to corresponding profile attribute:
     - `NAME`, `FIRST_NAME`, `LAST_NAME` $\rightarrow$ User's name
     - `EMAIL`, `PHONE`, `DATE_OF_BIRTH` $\rightarrow$ Contact details
     - `ADDRESS`, `CITY`, `STATE`, `COUNTRY`, `PINCODE` $\rightarrow$ Location details
     - `AADHAAR`, `PAN` $\rightarrow$ Government identification
     - `PASSWORD` $\rightarrow$ Domain-specific credential lookup (or default fallback)

3. **In-Memory Lock & Purge**:
   - `store.lock()` instantly purges the decrypted in-memory profile and sets `unlocked: false`.

---

## Automated Test Verification

Run all test suites:

```powershell
cd c:\Users\darsh\OneDrive\Desktop\AI-project\BIN-vision\extension
pnpm test
```

### Complete Test Results:
- **`tests/dom_analyzer.test.ts`**: 14 tests passed (Phase 1)
- **`tests/semantic_classifier.test.ts`**: 12 tests passed (Phase 2)
- **`tests/form_detector.test.ts`**: 7 tests passed (Phase 2)
- **`tests/confidence_scorer.test.ts`**: 3 tests passed (Phase 2)
- **`tests/unified_page_rep.test.ts`**: 2 tests passed (Phase 2)
- **`tests/pattern_rules.test.ts`**: 9 tests passed (Phase 3)
- **`tests/pii_detector.test.ts`**: 6 tests passed (Phase 3)
- **`tests/redactor.test.ts`**: 5 tests passed (Phase 3)
- **`tests/token_store.test.ts`**: 9 tests passed (Phase 4)
- **`tests/user_profile_store.test.ts`**: 8 tests passed (Phase 4)
- **Total: 75 passing tests across 10 test suites (0 failures)**

---

## Phase 4 Exit Criteria Checklist

- [x] `TokenStore` creates unique, unpredictable `SECRET_xxx` tokens
- [x] Token round-trip (`generate` $\leftrightarrow$ `resolve`) works accurately
- [x] Deduplication prevents redundant tokens for identical values in same session
- [x] Hard security invariant: attempting to tokenize password throws an error
- [x] Token store auto-clears on tab close and navigation
- [x] `UserProfileStore` encrypts with PBKDF2 + AES-GCM (256-bit)
- [x] Incorrect PIN fails decryption and returns null
- [x] Semantic field resolution maps all 15+ field types to profile values
- [x] All 75 automated unit & integration tests passing
- [x] Zero TypeScript compilation errors (`pnpm type-check`)
- [x] Production build clean in ~1.1s (`pnpm build`)

---

## What's Next — Phase 5

Phase 5 implements **Form Filling & Action Validation**:
```
Incoming Action JSON: { "type": "fill", "element_id": "e1", "value": "SECRET_001" }
                 │
                 ▼
action_validator.ts (Validates element visibility, interactability, allowlists)
                 │
                 ▼
token_store.resolve("SECRET_001") → "Darsh Shah"
                 │
                 ▼
action_executor.ts (Fires real InputEvent, ChangeEvent, KeyboardEvents in DOM)
```

When ready, say **"build phase 5"**.
