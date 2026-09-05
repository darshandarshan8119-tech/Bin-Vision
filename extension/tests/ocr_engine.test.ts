/**
 * ocr_engine.test.ts
 *
 * Phase 7: OCR Integration Tests.
 *
 * Verifies:
 *   1. OCREngine lifecycle and custom adapter support.
 *   2. Image / region text extraction and bounding box normalization.
 *   3. Conversion of OCR text into valid UPRElements with source: "ocr".
 *   4. Semantic categorization of recognized text (SUBMIT, EMAIL, PHONE, etc.).
 *   5. Automatic two-stage perception escalation in buildUPR when DOM confidence < 0.70.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OCREngine, type TesseractWorkerAdapter, ocrEngine } from '../src/perception/ocr_engine';
import { buildUPR } from '../src/perception/unified_page_rep';
import type { DOMAnalysisResult, RawElement } from '../src/shared/types';

describe('Phase 7: OCR Engine & Perception Pipeline Integration', () => {
  let mockAdapter: TesseractWorkerAdapter;

  beforeEach(() => {
    ocrEngine.reset();

    mockAdapter = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          text: 'Submit Application\nContact: support@example.com',
          confidence: 92,
          lines: [
            {
              text: 'Submit Application',
              confidence: 95,
              bbox: { x0: 10, y0: 50, x1: 150, y1: 90 },
              words: [
                { text: 'Submit', confidence: 96, bbox: { x0: 10, y0: 50, x1: 70, y1: 90 } },
                { text: 'Application', confidence: 94, bbox: { x0: 75, y0: 50, x1: 150, y1: 90 } },
              ],
            },
            {
              text: 'Contact: support@example.com',
              confidence: 90,
              bbox: { x0: 10, y0: 100, x1: 220, y1: 125 },
              words: [
                { text: 'Contact:', confidence: 89, bbox: { x0: 10, y0: 100, x1: 65, y1: 125 } },
                { text: 'support@example.com', confidence: 91, bbox: { x0: 70, y0: 100, x1: 220, y1: 125 } },
              ],
            },
          ],
        },
      }),
      terminate: vi.fn().mockResolvedValue(true),
    };

    ocrEngine.setAdapter(mockAdapter);
  });

  afterEach(async () => {
    await ocrEngine.terminate();
    ocrEngine.setAdapter(null);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Core Extraction & Bounding Box Mapping
  // ───────────────────────────────────────────────────────────────────────────

  describe('Core OCR Extraction & Bounding Box Mapping', () => {
    it('extracts lines, words, and converts into UPRElements', async () => {
      const result = await ocrEngine.recognize('mock-image-src', [100, 200]);

      expect(mockAdapter.recognize).toHaveBeenCalled();
      expect(result.text).toContain('Submit Application');
      expect(result.lines).toHaveLength(2);

      // Line 1 check
      const line1 = result.lines[0];
      expect(line1.text).toBe('Submit Application');
      expect(line1.confidence).toBe(0.95);
      // Origin offset applied: x0 + 100, y0 + 200 -> [110, 250, 140, 40]
      expect(line1.bbox).toEqual([110, 250, 140, 40]);
      expect(line1.words).toHaveLength(2);

      // Elements conversion check
      expect(result.elements).toHaveLength(2);
      const submitEl = result.elements[0];
      expect(submitEl.source).toBe('ocr');
      expect(submitEl.id).toBe('ocr_e1');
      expect(submitEl.label).toBe('Submit Application');
      expect(submitEl.bbox).toEqual([110, 250, 140, 40]);
      expect(submitEl.visible).toBe(true);
    });

    it('infers SUBMIT semantics and button type for actionable button text', async () => {
      const result = await ocrEngine.recognize('mock-image-src');
      const submitEl = result.elements[0];

      expect(submitEl.semantic).toBe('SUBMIT');
      expect(submitEl.type).toBe('button');
      expect(submitEl.interactable).toBe(true);
    });

    it('infers EMAIL semantics for text containing email address', async () => {
      const result = await ocrEngine.recognize('mock-image-src');
      const emailEl = result.elements[1];

      expect(emailEl.semantic).toBe('EMAIL');
      expect(emailEl.source).toBe('ocr');
      expect(emailEl.label).toBe('Contact: support@example.com');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Element Extraction from Image/Canvas DOM Nodes
  // ───────────────────────────────────────────────────────────────────────────

  describe('DOM Image Extraction', () => {
    it('extracts elements from image nodes with bounding client rect offset', async () => {
      const img = document.createElement('img');
      img.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 50,
        top: 80,
        width: 300,
        height: 150,
      });

      const elements = await ocrEngine.extractFromPageImages([img]);

      expect(elements).toHaveLength(2);
      expect(elements[0].source).toBe('ocr');
      // Bounding box left should be 10 + 50 = 60, top = 50 + 80 = 130
      expect(elements[0].bbox[0]).toBe(60);
      expect(elements[0].bbox[1]).toBe(130);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Two-Stage Perception Pipeline Integration
  // ───────────────────────────────────────────────────────────────────────────

  describe('buildUPR() Perception Escalation', () => {
    it('automatically triggers Stage 2 OCR when DOM confidence is low (< 0.70)', async () => {
      // Mock low-confidence DOM result: single element with empty/unresolved label
      const lowConfidenceDOM: DOMAnalysisResult = {
        elements: [
          {
            id: 'e1',
            tagName: 'INPUT',
            type: 'input',
            label: '',
            bbox: [0, 0, 100, 30],
            visible: true,
            interactable: true,
            domPath: 'input',
            attributes: {},
          },
        ],
        analysisTime: 12,
        pageTitle: 'Ambiguous Form',
        pageUrl: 'https://example.com/ambiguous',
        timestamp: Date.now(),
      };

      const mockImg = document.createElement('img');
      mockImg.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 100,
      });

      const upr = await buildUPR(lowConfidenceDOM, {
        ocrImages: [mockImg],
      });

      // Verification of Stage 2 escalation
      expect(upr.perception_source).toContain('dom');
      expect(upr.perception_source).toContain('ocr');

      // OCR elements appended
      const ocrElements = upr.elements.filter(e => e.source === 'ocr');
      expect(ocrElements.length).toBeGreaterThan(0);
      expect(ocrElements[0].source).toBe('ocr');
      expect(ocrElements[0].label).toBe('Submit Application');
    });

    it('skips OCR when DOM confidence is sufficient (>= 0.70) and forceOCR is false', async () => {
      // Create high-confidence DOM result
      const highConfidenceElements: RawElement[] = [
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
        {
          id: 'e2',
          tagName: 'INPUT',
          type: 'input',
          htmlType: 'email',
          label: 'Email Address',
          bbox: [10, 60, 200, 30],
          visible: true,
          interactable: true,
          domPath: 'input#email',
          attributes: { name: 'email' },
        },
        {
          id: 'e3',
          tagName: 'BUTTON',
          type: 'button',
          label: 'Register Now',
          innerText: 'Register Now',
          bbox: [10, 100, 150, 40],
          visible: true,
          interactable: true,
          domPath: 'button#submit',
          attributes: { type: 'submit' },
        },
      ];

      const highConfidenceDOM: DOMAnalysisResult = {
        elements: highConfidenceElements,
        analysisTime: 15,
        pageTitle: 'Registration',
        pageUrl: 'https://example.com/register',
        timestamp: Date.now(),
      };

      const mockImg = document.createElement('img');
      const upr = await buildUPR(highConfidenceDOM, {
        ocrImages: [mockImg],
      });

      // OCR should NOT be called because DOM confidence >= 0.70
      expect(mockAdapter.recognize).not.toHaveBeenCalled();
      expect(upr.perception_source).toEqual(['dom']);
      expect(upr.elements.some(e => e.source === 'ocr')).toBe(false);
    });

    it('forces OCR execution when forceOCR flag is set to true', async () => {
      const normalDOM: DOMAnalysisResult = {
        elements: [
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
        ],
        analysisTime: 10,
        pageTitle: 'Forced Test',
        pageUrl: 'https://example.com/forced',
        timestamp: Date.now(),
      };

      const mockImg = document.createElement('img');
      const upr = await buildUPR(normalDOM, {
        forceOCR: true,
        ocrImages: [mockImg],
      });

      expect(mockAdapter.recognize).toHaveBeenCalled();
      expect(upr.perception_source).toContain('ocr');
      expect(upr.elements.some(e => e.source === 'ocr')).toBe(true);
    });
  });
});
