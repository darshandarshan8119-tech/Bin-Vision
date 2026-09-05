# BIN-Vision — Phase 2: Form Perception & Semantic Classification

> **Goal:** Transform raw DOM elements into a semantically enriched **Unified Page Representation (UPR)**, detect and cluster forms with semantic purposes, and evaluate perception confidence to determine whether Stage 1 DOM perception is sufficient (>= 0.70) or requires OCR/Vision fallbacks.

---

## What Phase 2 Builds

| File | Purpose |
|------|---------|
| `src/perception/semantic_classifier.ts` | Multi-signal semantic field classifier (Autocomplete, HTML type, Keywords, PII flag) |
| `src/perception/form_detector.ts` | Form clusterer & purpose detector (`REGISTRATION`, `LOGIN`, `PAYMENT`, `SEARCH`, `CONTACT`, `OTHER`) |
| `src/perception/confidence_scorer.ts` | Confidence evaluator with SIH26171 two-stage perception threshold checks |
| `src/perception/unified_page_rep.ts` | UPR orchestrator & SHA-256 snapshot state hasher |
| `src/content/index.ts` | Content script updated to build and display UPR in DevTools console |
| `src/background/service_worker.ts` | Service worker updated to handle `UPR_GENERATED` message |
| `tests/semantic_classifier.test.ts` | Unit tests for semantic classification & PII identification |
| `tests/form_detector.test.ts` | Unit tests for form clustering & purpose detection |
| `tests/confidence_scorer.test.ts` | Unit tests for confidence scoring breakdown |
| `tests/unified_page_rep.test.ts` | End-to-end integration test validating UPR output against test form |

---

## Architecture & Data Flow

```
Live Webpage DOM
      ↓
dom_analyzer.ts (Phase 1)
      ↓
RawElement[]  (IDs: e1, e2, ..., labels resolved)
      ↓
semantic_classifier.ts (Phase 2)
  ├── 1. W3C Autocomplete attribute standard
  ├── 2. HTML type attribute (email, password, tel, date)
  ├── 3. Keyword dictionary scoring against label, name, id, placeholder
  └── 4. PII sensitivity tagging (PII_SEMANTIC_TYPES)
      ↓
form_detector.ts (Phase 2)
  ├── Groups elements by <form> or virtual SPA containers
  └── Identifies purpose: REGISTRATION | LOGIN | PAYMENT | SEARCH | CONTACT | OTHER
      ↓
confidence_scorer.ts (Phase 2)
  ├── Label quality (35%)
  ├── Semantic clarity (35%)
  ├── Form coherence (20%)
  └── Interactivity & visibility (10%)
      ↓
unified_page_rep.ts (Phase 2)
      ↓
UnifiedPageRepresentation (UPR)
  ├── page: { title, url, snapshot_hash, timestamp }
  ├── elements: UPRElement[] (with semantic, confidence, pii)
  ├── forms: UPRForm[] (with semantic_purpose)
  ├── perception_source: ["dom"]
  └── overall_confidence: number (e.g. 0.88)
```

---

## Two-Stage Perception Thresholds

| Confidence Score | Decision | Next Step |
|---|---|---|
| **>= 0.70** | High confidence | Stage 1 DOM perception sufficient; proceed directly to Phase 3/6 |
| **0.40 - 0.69** | Medium confidence | Ambiguous DOM; trigger Stage 2 OCR (Tesseract.js) in Phase 7 |
| **< 0.40** | Low confidence | DOM failure; trigger Stage 3 Vision fallback (ONNX) in Phase 8 |

---

## Automated Test Verification

Run all test suites:

```powershell
cd c:\Users\darsh\OneDrive\Desktop\AI-project\BIN-vision\extension
pnpm test
```

### Test Results:
- **`tests/dom_analyzer.test.ts`**: 14 tests passed (Phase 1 DOM extraction & label resolution)
- **`tests/semantic_classifier.test.ts`**: 12 tests passed (names, email, phone, passwords, dob, aadhaar, pan, pincode, cards, otp)
- **`tests/form_detector.test.ts`**: 7 tests passed (form clustering, SPA virtual forms, purpose detection)
- **`tests/confidence_scorer.test.ts`**: 3 tests passed (thresholds, breakdown, stage recommendations)
- **`tests/unified_page_rep.test.ts`**: 2 tests passed (end-to-end UPR generation and snapshot hashing)
- **Total: 38 passing tests (0 failures)**

---

## How to Test in Browser

1. Rebuild the extension (or leave `pnpm dev` running):
   ```powershell
   pnpm build
   ```
2. Go to `chrome://extensions` in Google Chrome and click the **Reload** icon on the **BIN-Vision** card.
3. Open `tests\fixtures\test_form.html` in Chrome.
4. Press `F12` to open Developer Tools and select the **Console** tab.
5. You will see the purple group:
   `🧠 BIN-Vision — Unified Page Representation (UPR)`
   - Form Purpose: `REGISTRATION`
   - Confidence: `88%`
   - Interactive table showing:
     - `FIRST_NAME` (`pii: 🔒 YES`)
     - `LAST_NAME` (`pii: 🔒 YES`)
     - `EMAIL` (`pii: 🔒 YES`)
     - `PHONE` (`pii: 🔒 YES`)
     - `USERNAME` (`pii: NO`)
     - `DATE_OF_BIRTH` (`pii: 🔒 YES`)
     - `CITY`, `STATE`, `PINCODE`
     - `AADHAAR` (`pii: 🔒 YES`)
     - `PAN` (`pii: 🔒 YES`)
     - `PASSWORD`, `CONFIRM_PASSWORD` (`pii: 🔒 YES`)
     - `SUBMIT`, `NAV`, `SEARCH`

---

## Phase 2 Exit Criteria Checklist

- [x] Multi-signal semantic field classifier accurately detects 20+ field types
- [x] PII sensitivity flags correctly set on personal data fields
- [x] Form purpose detection correctly categorizes REGISTRATION, LOGIN, PAYMENT, SEARCH, CONTACT
- [x] SPA virtual form detection handles non-`<form>` element clusters
- [x] Overall perception confidence computed with weighted factors
- [x] Threshold logic correctly determines DOM sufficiency vs OCR/Vision trigger
- [x] UPR snapshot hash generated for page state change detection
- [x] All 38 automated unit & integration tests passing
- [x] TypeScript type checking passes with 0 errors (`pnpm type-check`)
- [x] Extension builds cleanly in < 200ms (`pnpm build`)

---

## What's Next — Phase 3

Phase 3 builds the **Local Privacy Engine**:
```
UnifiedPageRepresentation
          ↓
   pii_detector.ts (DOM + Regex)
          ↓
     redactor.ts (Replaces PII values with [NAME], [EMAIL], etc.)
          ↓
  Sanitized UPR (Zero raw user PII leaves browser content script)
```

When ready, say **"build phase 3"**.
