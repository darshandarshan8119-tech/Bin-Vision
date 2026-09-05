# BIN-Vision — Phase 3: Local Privacy Engine & PII Redaction

> **Goal:** Ensure **zero raw PII** (Personally Identifiable Information) ever leaves the user's browser. Transform the perceived Unified Page Representation into a **Sanitized UPR** using a 3-layer detection engine (DOM Semantics + Regex Checksums + NLP with Compromise.js) and verify 100% compliance through a cryptographic sanitization audit gate.

---

## What Phase 3 Builds

| File | Purpose |
|------|---------|
| `src/privacy/pattern_rules.ts` | Regex patterns and checksum validation algorithms (Luhn Mod-10 for cards, Aadhaar, PAN) |
| `src/privacy/pii_detector.ts` | 3-Layer PII detection engine (DOM semantics, regex value scanning, NLP name extraction) |
| `src/privacy/redactor.ts` | Redaction engine replacing PII with `[LABEL]` placeholders & `verifySanitization` audit validator |
| `src/content/index.ts` | Injects Privacy Engine into content script pipeline before service worker/server dispatch |
| `tests/pattern_rules.test.ts` | Unit tests for Luhn checksum, Aadhaar, PAN, email, phone, and regex text scanning |
| `tests/pii_detector.test.ts` | Unit tests for multi-layer PII detection across elements and free text |
| `tests/redactor.test.ts` | Unit tests for text redaction, element sanitization, and security audit validation |

---

## The 3-Layer Privacy Engine Architecture

```
Raw Unified Page Representation (UPR)
                 │
                 ▼
 ┌──────────────────────────────────────────────┐
 │  LAYER 1: DOM & Semantic Attributes          │
 │  - type="password" → [PASSWORD]              │
 │  - type="email" → [EMAIL]                    │
 │  - autocomplete="cc-number" → [CARD]         │
 │  - Semantic types in PII_SEMANTIC_TYPES      │
 └──────────────────────┬───────────────────────┘
                        │
                        ▼
 ┌──────────────────────────────────────────────┐
 │  LAYER 2: Regex & Structural Validators      │
 │  - Credit/Debit Cards (Luhn Mod-10 Checksum) │
 │  - Indian Aadhaar (12-digit structural check)│
 │  - Indian PAN Card (5-letter 4-digit format) │
 │  - E.164 & Indian Phone (+91 98765 43210)    │
 │  - Email standard RFC regex                  │
 └──────────────────────┬───────────────────────┘
                        │
                        ▼
 ┌──────────────────────────────────────────────┐
 │  LAYER 3: NLP Person Entity Extraction       │
 │  - compromise.js local NER in content script │
 │  - Detects person names in free-form text    │
 └──────────────────────┬───────────────────────┘
                        │
                        ▼
 ┌──────────────────────────────────────────────┐
 │  REDACTION & SANITIZATION GATE               │
 │  - Values replaced: [EMAIL], [PHONE], etc.   │
 │  - Passwords strictly undefined              │
 │  - verifySanitization() audit validator      │
 └──────────────────────┬───────────────────────┘
                        │
                        ▼
              SANITIZED UPR JSON
          (Safe for Server Dispatch)
```

---

## PII Categories & Redaction Mapping

| Category | Example Original Value | Redacted Output | Verification Algorithm |
|---|---|---|---|
| **PASSWORD** | `SecretP@ssw0rd!` | `undefined` / `[PASSWORD]` | Hard invariant (value never captured) |
| **EMAIL** | `john.doe@example.com` | `[EMAIL]` | RFC regex validator |
| **PHONE** | `+91 98765 43210` | `[PHONE]` | Indian (+91) & International E.164 |
| **CARD** | `4992 7398 716` | `[CARD]` | **Luhn Checksum (Mod-10)** |
| **AADHAAR** | `2345 6789 0123` | `[AADHAAR]` | 12-digit Indian UID check |
| **PAN** | `ABCDE1234F` | `[PAN]` | 5-letter + 4-digit + 1-letter format |
| **NAME** | `Alice Liddell` | `[NAME]` | compromise.js local NLP entity extractor |
| **DOB** | `15/08/1995` | `[DATE_OF_BIRTH]` | Date format validator |
| **NON-PII** | `City: "Mumbai"`, `Search: "shoes"` | Preserved as-is | Verified non-sensitive |

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
- **Total: 58 passing tests across 8 test suites (0 failures)**

---

## How to Test in Browser

1. Rebuild extension:
   ```powershell
   pnpm build
   ```
2. Open Chrome at `chrome://extensions` and click **Reload (↻)** on the **BIN-Vision** card.
3. Open `tests\fixtures\test_form.html` in Chrome.
4. Press `F12` to open Developer Tools and select the **Console** tab.
5. In the console output, verify:
   - `Privacy Status: 🛡️ ZERO RAW PII LEAKED (Passed Audit)`
   - Form fields show sanitized values: `[NAME]`, `[EMAIL]`, `[PHONE]`, `[AADHAAR]`, `[PAN]`
   - Non-sensitive fields (City, State, Search) keep their natural values.

---

## Phase 3 Exit Criteria Checklist

- [x] Multi-layer PII detection engine implemented (DOM, Regex, NLP)
- [x] Luhn algorithm verifies genuine payment cards and rejects false positives
- [x] Indian Aadhaar & PAN card structural validators working
- [x] compromise.js integrates locally without network calls for NLP person detection
- [x] Redaction engine replaces sensitive values with standard `[LABEL]` placeholders
- [x] Password values remain strictly `undefined`
- [x] Sanitization audit validator (`verifySanitization`) acts as a security gate
- [x] Content script executes privacy engine before message dispatch
- [x] All 58 automated tests passing
- [x] Zero TypeScript errors (`pnpm type-check`)
- [x] Extension builds cleanly in ~1.1s (`pnpm build`)

---

## What's Next — Phase 4

Phase 4 introduces the **Secret Token Architecture & User Profile Store**:
```
User Profile Store (Encrypted IndexedDB)
                 │
                 ▼
TokenStore (In-memory, per-tab session)
                 │
                 ▼
Maps: SECRET_001 ↔ "Darsh Shah"
      SECRET_002 ↔ "darsh@example.com"
                 │
                 ▼
Backend LLM Planner sees only SECRET_xxx tokens
Actual PII values filled strictly inside browser content script
```

When you are ready, say **"build phase 4"**.
