/**
 * ocr_engine.ts
 *
 * Phase 7 core module.
 *
 * Provides optical character recognition (OCR) via Tesseract.js to extract
 * text, labels, and interactive affordances from canvas elements, images,
 * and visually rendered buttons/forms when DOM confidence is low (< 0.70).
 *
 * Key Responsibilities:
 *   - Lazy initialization and worker lifecycle management
 *   - Image/region text extraction with bounding box tracking
 *   - Conversion of OCR results into valid UPRElement objects (source: "ocr")
 *   - Semantic classification of recognized text
 *   - Pluggable worker adapter for testability and headless environments
 */

import { createWorker, type Worker } from 'tesseract.js';
import { logger } from '../shared/logger';
import type {
  BBox,
  SemanticType,
  UPRElement,
} from '../shared/types';
import { classifyElement } from './semantic_classifier';

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: BBox;
}

export interface OCRLine {
  text: string;
  confidence: number;
  bbox: BBox;
  words: OCRWord[];
}

export interface OCRResult {
  text: string;
  confidence: number;
  lines: OCRLine[];
  elements: UPRElement[];
  processingTimeMs: number;
}

export interface TesseractWorkerAdapter {
  recognize(
    image: any,
    options?: any
  ): Promise<{
    data: {
      text: string;
      confidence: number;
      words?: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
      }>;
      lines?: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
        words?: Array<{
          text: string;
          confidence: number;
          bbox: { x0: number; y0: number; x1: number; y1: number };
        }>;
      }>;
    };
  }>;
  terminate?(): Promise<any>;
}

export class OCREngine {
  private static instance: OCREngine | null = null;
  private worker: Worker | null = null;
  private customAdapter: TesseractWorkerAdapter | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private elementCounter = 1;

  public static getInstance(): OCREngine {
    if (!OCREngine.instance) {
      OCREngine.instance = new OCREngine();
    }
    return OCREngine.instance;
  }

  /**
   * Allows injecting a custom/mock worker adapter for deterministic unit testing.
   */
  public setAdapter(adapter: TesseractWorkerAdapter | null): void {
    this.customAdapter = adapter;
  }

  /**
   * Initializes the Tesseract worker lazily.
   */
  public async init(lang: string = 'eng'): Promise<void> {
    if (this.customAdapter) {
      return;
    }
    if (this.worker) {
      return;
    }
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = (async () => {
      try {
        logger.info(`[OCREngine] Initializing Tesseract worker (lang: ${lang})...`);
        const worker = await createWorker(lang);
        this.worker = worker;
        logger.info('[OCREngine] Tesseract worker ready.');
      } catch (err) {
        logger.error('[OCREngine] Failed to initialize Tesseract worker', err);
        throw err;
      } finally {
        this.isInitializing = false;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Performs OCR on an image source (canvas, image element, base64 data URL, or Blob)
   * and produces structured lines, words, and UPRElement objects.
   *
   * @param image - Image input source
   * @param originOffset - [x, y] document-absolute coordinate offset for bounding boxes
   */
  public async recognize(
    image: any,
    originOffset: [number, number] = [0, 0]
  ): Promise<OCRResult> {
    const startTime = performance.now();

    let rawData: any;
    if (this.customAdapter) {
      const res = await this.customAdapter.recognize(image);
      rawData = res.data;
    } else {
      await this.init();
      if (!this.worker) {
        throw new Error('Tesseract worker is not initialized');
      }
      const res = await this.worker.recognize(image);
      rawData = res.data;
    }

    const processingTimeMs = performance.now() - startTime;
    const overallConfidence = (rawData.confidence ?? 80) / 100;
    const lines: OCRLine[] = [];
    const elements: UPRElement[] = [];

    const rawLines = rawData.lines || [];
    if (rawLines.length > 0) {
      for (const line of rawLines) {
        const lineText = (line.text || '').trim();
        if (!lineText) continue;

        const lineConfidence = (line.confidence ?? rawData.confidence ?? 80) / 100;
        const lineBBox: BBox = [
          (line.bbox?.x0 ?? 0) + originOffset[0],
          (line.bbox?.y0 ?? 0) + originOffset[1],
          Math.max(1, (line.bbox?.x1 ?? 0) - (line.bbox?.x0 ?? 0)),
          Math.max(1, (line.bbox?.y1 ?? 0) - (line.bbox?.y0 ?? 0)),
        ];

        const words: OCRWord[] = (line.words || []).map((w: any) => ({
          text: (w.text || '').trim(),
          confidence: (w.confidence ?? 80) / 100,
          bbox: [
            (w.bbox?.x0 ?? 0) + originOffset[0],
            (w.bbox?.y0 ?? 0) + originOffset[1],
            Math.max(1, (w.bbox?.x1 ?? 0) - (w.bbox?.x0 ?? 0)),
            Math.max(1, (w.bbox?.y1 ?? 0) - (w.bbox?.y0 ?? 0)),
          ],
        }));

        lines.push({
          text: lineText,
          confidence: lineConfidence,
          bbox: lineBBox,
          words,
        });

        // Convert actionable/meaningful line into a UPRElement
        const ocrElement = this.createUPRElementFromOCR(
          lineText,
          lineBBox,
          lineConfidence
        );
        elements.push(ocrElement);
      }
    } else if (rawData.text && rawData.text.trim()) {
      // Fallback if line data is not broken down
      const text = rawData.text.trim();
      const defaultBBox: BBox = [originOffset[0], originOffset[1], 100, 30];
      elements.push(this.createUPRElementFromOCR(text, defaultBBox, overallConfidence));
    }

    return {
      text: rawData.text || '',
      confidence: overallConfidence,
      lines,
      elements,
      processingTimeMs,
    };
  }

  /**
   * Inspects an HTML image or canvas element, runs OCR on it,
   * and maps bounding boxes relative to document coordinates.
   */
  public async recognizeElement(
    element: HTMLImageElement | HTMLCanvasElement
  ): Promise<OCRResult> {
    const rect = element.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    };
    const scrollX = typeof window !== 'undefined' ? window.scrollX : 0;
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    const originOffset: [number, number] = [rect.left + scrollX, rect.top + scrollY];

    return this.recognize(element, originOffset);
  }

  /**
   * Scans a list of DOM image/canvas elements and returns an aggregated list of OCR UPRElements.
   */
  public async extractFromPageImages(
    images: Array<HTMLImageElement | HTMLCanvasElement>
  ): Promise<UPRElement[]> {
    const allElements: UPRElement[] = [];

    for (const img of images) {
      try {
        const result = await this.recognizeElement(img);
        if (result.elements.length > 0) {
          allElements.push(...result.elements);
        }
      } catch (err) {
        logger.warn('[OCREngine] Failed to OCR image element', err);
      }
    }

    return allElements;
  }

  /**
   * Converts recognized text with bounding box into a compliant UPRElement.
   */
  private createUPRElementFromOCR(
    text: string,
    bbox: BBox,
    confidence: number
  ): UPRElement {
    const id = `ocr_e${this.elementCounter++}`;
    const cleanText = text.trim();

    // Determine semantic classification from text
    const semantic = this.inferSemanticFromText(cleanText);

    // Determine if text represents an interactive button/link vs static text
    const isInteractive = this.isActionableText(cleanText, semantic);
    const elementType = isInteractive ? 'button' : 'text';

    return {
      id,
      tagName: isInteractive ? 'BUTTON' : 'SPAN',
      type: elementType,
      label: cleanText,
      value: undefined,
      bbox,
      visible: true,
      interactable: isInteractive,
      innerText: cleanText,
      domPath: `body >> ocr(${id})`,
      attributes: {
        'data-source': 'ocr',
        'data-text': cleanText,
      },
      semantic,
      source: 'ocr',
      confidence,
      pii: false,
    };
  }

  /**
   * Infers semantic category from OCR text.
   */
  private inferSemanticFromText(text: string): SemanticType {
    const lower = text.toLowerCase();

    if (/submit|sign in|log in|register|continue|proceed|checkout|apply/i.test(lower)) {
      return 'SUBMIT';
    }
    if (/@|email|e-mail/i.test(lower)) {
      return 'EMAIL';
    }
    if (/phone|mobile|cell|tel/i.test(lower)) {
      return 'PHONE';
    }
    if (/name|full name|first name/i.test(lower)) {
      return 'NAME';
    }
    if (/password|passcode/i.test(lower)) {
      return 'PASSWORD';
    }
    if (/address|street|city|state|zip|pincode/i.test(lower)) {
      return 'ADDRESS';
    }
    if (/search|find/i.test(lower)) {
      return 'SEARCH';
    }
    if (/otp|verification code/i.test(lower)) {
      return 'OTP';
    }

    // Delegate to semantic_classifier helper if possible
    const classified = classifyElement({
      id: 'ocr_tmp',
      tagName: 'SPAN',
      type: 'text',
      label: text,
      bbox: [0, 0, 0, 0],
      visible: true,
      interactable: false,
      domPath: '',
      attributes: {},
    });

    return classified.semantic ?? 'OTHER';
  }

  /**
   * Identifies whether recognized text represents an interactive target (e.g. "Submit", "Next").
   */
  private isActionableText(text: string, semantic: SemanticType): boolean {
    if (semantic === 'SUBMIT' || semantic === 'SEARCH') {
      return true;
    }
    const lower = text.toLowerCase();
    const actionKeywords = [
      'click', 'submit', 'login', 'sign in', 'sign up', 'register',
      'next', 'prev', 'previous', 'continue', 'save', 'ok', 'cancel'
    ];
    return actionKeywords.some(kw => lower === kw || lower.startsWith(kw + ' '));
  }

  /**
   * Resets internal element counters (useful between test runs).
   */
  public reset(): void {
    this.elementCounter = 1;
  }

  /**
   * Shuts down the Tesseract worker.
   */
  public async terminate(): Promise<void> {
    if (this.customAdapter?.terminate) {
      await this.customAdapter.terminate();
    }
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
    this.isInitializing = false;
    this.initPromise = null;
    logger.info('[OCREngine] Tesseract worker terminated.');
  }
}

export const ocrEngine = OCREngine.getInstance();
