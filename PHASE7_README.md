# Phase 7: OCR Integration (Tesseract.js & Two-Stage Perception)

## 1. Overview & Architecture

Phase 7 implements Stage 2 of the **Two-Stage Perception Strategy** for BIN-Vision. When initial DOM analysis yields low confidence (< 0.70) or when image-based text/buttons are present, the system escalates to optical character recognition (OCR) using **Tesseract.js** to extract visual text affordances directly into the Unified Page Representation (UPR).

```
   Stage 1: DOM Analysis
            │
            ▼
   computeOverallConfidence()
            │
     ┌──────┴──────┐
 >= 0.70        < 0.70 (or forceOCR)
     │             │
     │      Stage 2: OCR Engine (Tesseract.js)
     │             │
     │      Extract text lines + bboxes from images/canvases
     │             │
     │      Convert to UPRElement (source: "ocr")
     │             │
     │      Infer semantics (SUBMIT, EMAIL, PHONE, etc.)
     │             │
     └──────┬──────┘
            ▼
   Unified Page Representation (UPR)
   perception_source: ["dom"] or ["dom", "ocr"]
```

---

## 2. Key Modules & Implementations

### 2.1. OCR Engine (`extension/src/perception/ocr_engine.ts`)
- **Lazy Initialization**: Spawns and configures the Tesseract worker only on demand to maintain low resource overhead.
- **Bounding Box Normalization**: Normalizes line and word bounding boxes relative to document-absolute coordinates.
- **UPRElement Conversion**:
  - Sets `source: "ocr"`.
  - Generates stable IDs (`ocr_e1`, `ocr_e2`, etc.).
  - Marks actionable texts (e.g. "Submit", "Sign In", "Apply") as `type: "button"`, `interactable: true`, and `semantic: "SUBMIT"`.
  - Classifies recognized contact info into `EMAIL`, `PHONE`, etc.
- **Pluggable Test Adapter**: `setAdapter(mockAdapter)` allows headless, instantaneous unit testing without downloading multi-megabyte language models during CI.

### 2.2. Pipeline Escalation (`extension/src/perception/unified_page_rep.ts`)
- `buildUPR(domResult?, options?)`:
  - Evaluates `overall_confidence`.
  - If `shouldTriggerOCR(confidence)` (confidence < 0.70) or `options.forceOCR`, automatically identifies image/canvas elements and runs OCR.
  - Appends OCR elements into `elements`.
  - Updates `perception_source` to include `'ocr'`.
  - Re-evaluates form groupings and confidence scores.

---

## 3. Test Coverage

Comprehensive unit tests implemented in `extension/tests/ocr_engine.test.ts`:
- **Core Extraction**: Line/word extraction and document-absolute bounding box coordinate offset application.
- **Semantic Classification**: Text parsing and classification into `SUBMIT`, `EMAIL`, and other categories.
- **DOM Node Scanning**: Extracting text from `<img>` and `<canvas>` elements.
- **Automatic Escalation**: Low-confidence DOM results (< 0.70) automatically escalate to OCR, producing `perception_source: ['dom', 'ocr']`.
- **Sufficiency Gate**: High-confidence DOM results (>= 0.70) skip OCR to conserve compute.
- **Forced Override**: `forceOCR: true` runs OCR regardless of DOM confidence.

---

## 4. Running Tests & Building

### 4.1. Run All Extension Tests
```bash
pnpm --dir extension test
```
Result:
```
Test Files  13 passed (13)
     Tests  97 passed (97)
```

### 4.2. TypeScript Type-Checking & Build
```bash
pnpm --dir extension type-check
pnpm --dir extension build
```
Result:
```
tsc: 0 errors
Vite build: dist/ bundle built in ~1.2s
```

---

## 5. Verification Checklist

- [x] Tesseract.js integration with lifecycle management (`init`, `terminate`).
- [x] Document-absolute bounding box calculation for OCR elements.
- [x] Semantic classification and interactability detection for recognized text.
- [x] OCR-sourced elements added to UPR with `source: "ocr"`.
- [x] `perception_source` updated to include `"ocr"`.
- [x] Threshold-based escalation (< 0.70) tested and validated.
- [x] 100% tests passing across all 13 extension suites (97 tests) and Python backend (16 tests).
