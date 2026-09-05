# Phase 8: Vision Fallback (ONNX & Sensitive Visual Region Detection)

## 1. Overview & Architecture

Phase 8 completes Stage 3 of the **Three-Tier Perception Strategy** for BIN-Vision. When DOM and OCR confidence are insufficient (< 0.40), or when visually complex pages contain embedded sensitive documents or user photos, the **Vision Engine** activates to detect regions, protect biometric PII, and enrich the Unified Page Representation (UPR).

```
   Tier 1: DOM Perception
             │
             ▼
   computeOverallConfidence()
             │
     ┌───────┴────────┐
  >= 0.70          < 0.70
     │                │
  [Pass]       Tier 2: OCR Engine (Tesseract.js)
                      │
              ┌───────┴────────┐
           >= 0.40          < 0.40 (or forceVision)
              │                │
           [Pass]       Tier 3: Vision Fallback (ONNX / VisionEngine)
                               │
                        Detect Faces, ID Cards, Cards
                               │
                        Visual Privacy Masking / Redaction
                               │
                        Convert to UPRElement (source: "vision", pii: true)
                               ▼
                    Unified Page Representation (UPR)
                    perception_source: ["dom", "ocr", "vision"]
```

---

## 2. Privacy & Security Invariants Enforced

1. **Biometric & Document PII Protection**:
   - Detected faces and identity cards are automatically flagged with `pii: true` and semantic labels (`FACE`, `DOCUMENT`, `CARD_NUMBER`).
   - `maskSensitiveCanvas()` applies solid dark privacy overlays with `[REDACTED FACE]` and `[REDACTED DOCUMENT]` banners.
   - Raw face and identity card pixel data is **never** transmitted to the remote backend or LLM.
2. **Deterministic & Headless Testing**:
   - `setAdapter(mockAdapter)` enables headless, instant execution without requiring 30MB+ `.onnx` models to be downloaded during CI runs.

---

## 3. Key Modules & Implementations

### 3.1. Vision Engine (`extension/src/perception/vision_engine.ts`)
- **Lifecycle & Adapter Management**:
  - Manages ONNX Runtime Web / vision model initialization lazily.
  - Pluggable `VisionInferenceAdapter` interface for dependency injection.
- **Bounding Box Mapping**:
  - Maps detected visual regions relative to document-absolute coordinates.
- **UPRElement Generation**:
  - Tags elements with `source: "vision"` and `pii: true`.
  - Maps categories (`FACE` -> `FACE`, `DOCUMENT` -> `DOCUMENT`, `CARD` -> `CARD_NUMBER`).
- **Privacy Masking**:
  - `maskSensitiveCanvas()` masks detected regions directly on canvas before snapshotting.

### 3.2. Three-Tier Pipeline Escalation (`extension/src/perception/unified_page_rep.ts`)
- Enhanced `buildUPR()`:
  - **Tier 1 (DOM)**: Extracts all interactive DOM elements.
  - **Tier 2 (OCR)**: Escalates if confidence < 0.70 or `forceOCR: true`.
  - **Tier 3 (Vision)**: Escalates if confidence < 0.40 or `forceVision: true`.
  - Appends vision elements and adds `'vision'` to `perception_source`.

### 3.3. Extended Privacy Redaction (`extension/src/privacy/redactor.ts`)
- Added `FACE: '[FACE]'` and `DOCUMENT: '[DOCUMENT]'` to `REDACTION_PLACEHOLDERS`.

---

## 4. Test Coverage

Unit tests in `extension/tests/vision_engine.test.ts`:
- **Sensitive Region Detection**: Verification of face and document detection with document-absolute bounding boxes.
- **Privacy Masking**: Verification of canvas redaction overlays and styling.
- **Stage 3 Perception Escalation**: Low confidence (< 0.40) triggers vision fallback, resulting in `source: "vision"` elements and `perception_source: ['dom', 'vision']`.
- **Forced Override**: `forceVision: true` forces vision execution even on standard DOM forms.

---

## 5. Verification Results

### 5.1. Run Extension Tests
```bash
pnpm --dir extension test
```
```
Test Files  14 passed (14)
     Tests  102 passed (102)
```

### 5.2. Run TypeScript Typecheck & Build
```bash
pnpm --dir extension type-check  # 0 errors
pnpm --dir extension build       # Production bundle built in ~1.8s
```

### 5.3. Run Python Backend Tests
```bash
python -m pytest backend/tests -v
# 16 passed in 0.35s
```

---

## 6. Verification Checklist

- [x] VisionEngine module created with lazy loading and ONNX Runtime Web integration.
- [x] Sensitive visual region categories (FACE, DOCUMENT, CARD) detected and tagged.
- [x] Visual privacy masking on canvas to prevent raw face/card pixel leakage.
- [x] UPRElements generated with `source: "vision"` and `pii: true`.
- [x] Three-tier perception pipeline escalation in `buildUPR()` (< 0.40 threshold and `forceVision`).
- [x] Redaction dictionary updated with `[FACE]` and `[DOCUMENT]` placeholders.
- [x] 100% tests passing across all 14 extension test suites (102 tests) and backend (16 tests).
