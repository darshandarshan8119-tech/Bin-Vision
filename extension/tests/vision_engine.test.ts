/**
 * vision_engine.test.ts
 *
 * Phase 8: Vision Fallback (ONNX & Sensitive Visual Region Detection) Tests.
 *
 * Verifies:
 *   1. VisionEngine initialization, adapter injection, and lifecycle.
 *   2. Detection of sensitive visual regions (Faces, Identity Documents, Payment Cards).
 *   3. Conversion into UPRElements with source: "vision" and pii: true.
 *   4. Visual canvas masking / privacy overlay for detected sensitive regions.
 *   5. Stage 3 perception escalation in buildUPR when confidence < 0.40 or forceVision is set.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VisionEngine, type VisionInferenceAdapter, visionEngine } from '../src/perception/vision_engine';
import { buildUPR } from '../src/perception/unified_page_rep';
import type { DOMAnalysisResult, RawElement } from '../src/shared/types';

describe('Phase 8: Vision Engine & Stage 3 Perception Escalation', () => {
  let mockVisionAdapter: VisionInferenceAdapter;

  beforeEach(() => {
    visionEngine.reset();

    mockVisionAdapter = {
      detect: vi.fn().mockResolvedValue([
        {
          category: 'FACE',
          confidence: 0.94,
          bbox: [20, 30, 80, 80],
          label: 'User Face Photo',
        },
        {
          category: 'DOCUMENT',
          confidence: 0.91,
          bbox: [120, 30, 200, 120],
          label: 'Aadhaar Identity Card',
        },
      ]),
      terminate: vi.fn().mockResolvedValue(undefined),
    };

    visionEngine.setAdapter(mockVisionAdapter);
  });

  afterEach(async () => {
    await visionEngine.terminate();
    visionEngine.setAdapter(null);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Detection & UPRElement Conversion
  // ───────────────────────────────────────────────────────────────────────────

  describe('Sensitive Visual Region Detection', () => {
    it('detects faces and documents, mapping to UPRElements with source: "vision"', async () => {
      const result = await visionEngine.detect('mock-canvas', [50, 100]);

      expect(mockVisionAdapter.detect).toHaveBeenCalled();
      expect(result.detections).toHaveLength(2);
      expect(result.elements).toHaveLength(2);

      // Verify Face Detection
      const faceEl = result.elements[0];
      expect(faceEl.source).toBe('vision');
      expect(faceEl.id).toBe('vis_e1');
      expect(faceEl.semantic).toBe('FACE');
      expect(faceEl.pii).toBe(true); // Security invariant: faces are always PII
      // Bounding box offset: [20+50, 30+100, 80, 80] = [70, 130, 80, 80]
      expect(faceEl.bbox).toEqual([70, 130, 80, 80]);

      // Verify Document Detection
      const docEl = result.elements[1];
      expect(docEl.source).toBe('vision');
      expect(docEl.id).toBe('vis_e2');
      expect(docEl.semantic).toBe('DOCUMENT');
      expect(docEl.pii).toBe(true);
      expect(docEl.bbox).toEqual([170, 130, 200, 120]);
    });

    it('scans DOM image elements with getBoundingClientRect offset', async () => {
      const img = document.createElement('img');
      img.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 40,
        top: 60,
        width: 300,
        height: 200,
      });

      const elements = await visionEngine.extractFromPageImages([img]);

      expect(elements).toHaveLength(2);
      expect(elements[0].source).toBe('vision');
      expect(elements[0].bbox[0]).toBe(60); // 20 + 40
      expect(elements[0].bbox[1]).toBe(90); // 30 + 60
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Privacy Masking / Redaction
  // ───────────────────────────────────────────────────────────────────────────

  describe('Visual Privacy Masking', () => {
    it('masks sensitive detected regions with canvas overlay', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;

      const fillRectSpy = vi.fn();
      const strokeRectSpy = vi.fn();
      const fillTextSpy = vi.fn();

      canvas.getContext = vi.fn().mockReturnValue({
        save: vi.fn(),
        restore: vi.fn(),
        fillRect: fillRectSpy,
        strokeRect: strokeRectSpy,
        fillText: fillTextSpy,
      });

      const detections = [
        {
          category: 'FACE' as const,
          confidence: 0.95,
          bbox: [10, 10, 50, 50] as [number, number, number, number],
          label: 'Face',
        },
      ];

      const maskedCanvas = visionEngine.maskSensitiveCanvas(canvas, detections);
      expect(maskedCanvas).toBe(canvas);
      expect(fillRectSpy).toHaveBeenCalledWith(10, 10, 50, 50);
      expect(strokeRectSpy).toHaveBeenCalledWith(10, 10, 50, 50);
      expect(fillTextSpy).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Stage 3 Perception Escalation in buildUPR
  // ───────────────────────────────────────────────────────────────────────────

  describe('buildUPR() Stage 3 Vision Escalation', () => {
    it('triggers vision fallback when perception confidence < 0.40', async () => {
      // Very low confidence DOM result (no labels, no form)
      const lowConfidenceDOM: DOMAnalysisResult = {
        elements: [
          {
            id: 'e1',
            tagName: 'DIV',
            type: 'text',
            label: '',
            bbox: [0, 0, 100, 30],
            visible: true,
            interactable: false,
            domPath: 'div',
            attributes: {},
          },
        ],
        analysisTime: 5,
        pageTitle: 'Visually Complex Page',
        pageUrl: 'https://example.com/visual-id',
        timestamp: Date.now(),
      };

      const mockImg = document.createElement('img');
      const upr = await buildUPR(lowConfidenceDOM, {
        skipOCR: true,
        targetImages: [mockImg],
      });

      // Verification of Stage 3 escalation
      expect(upr.perception_source).toContain('vision');
      const visionElements = upr.elements.filter(e => e.source === 'vision');
      expect(visionElements.length).toBeGreaterThan(0);
      expect(visionElements[0].semantic).toBe('FACE');
      expect(visionElements[0].pii).toBe(true);
    });

    it('forces vision execution when forceVision flag is set to true', async () => {
      const normalElements: RawElement[] = [
        {
          id: 'e1',
          tagName: 'INPUT',
          type: 'input',
          htmlType: 'text',
          label: 'Full Name',
          bbox: [10, 20, 200, 30],
          visible: true,
          interactable: true,
          domPath: 'input#name',
          attributes: { name: 'fullname' },
        },
      ];

      const normalDOM: DOMAnalysisResult = {
        elements: normalElements,
        analysisTime: 10,
        pageTitle: 'Forced Vision Test',
        pageUrl: 'https://example.com/forced-vision',
        timestamp: Date.now(),
      };

      const mockImg = document.createElement('img');
      const upr = await buildUPR(normalDOM, {
        forceVision: true,
        targetImages: [mockImg],
      });

      expect(mockVisionAdapter.detect).toHaveBeenCalled();
      expect(upr.perception_source).toContain('vision');
      expect(upr.elements.some(e => e.source === 'vision')).toBe(true);
    });
  });
});
