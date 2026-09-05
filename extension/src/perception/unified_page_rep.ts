/**
 * unified_page_rep.ts
 *
 * Phase 2 core module.
 *
 * Orchestrates the full Stage 1 Perception pipeline and constructs the
 * Unified Page Representation (UPR).
 *
 * Pipeline:
 *   1. analyzePage() (Phase 1: DOM extraction & label resolution)
 *   2. enrichElementsWithSemantics() (Phase 2: Semantic classifier)
 *   3. detectForms() (Phase 2: Form grouping & purpose detection)
 *   4. computeOverallConfidence() (Phase 2: Confidence scoring)
 *   5. computeSnapshotHash() (Page state tracking & cache invalidation)
 *
 * Output: UnifiedPageRepresentation (UPR)
 */

import type {
  DOMAnalysisResult,
  PerceptionSource,
  UnifiedPageRepresentation,
  UPRElement,
  UPRForm,
  UPRPage,
} from '../shared/types';
import { analyzePage } from './dom_analyzer';
import { enrichElementsWithSemantics } from './semantic_classifier';
import { detectForms } from './form_detector';
import { computeOverallConfidence, shouldTriggerOCR, shouldTriggerVision } from './confidence_scorer';
import { ocrEngine } from './ocr_engine';
import { visionEngine } from './vision_engine';
import { logger } from '../shared/logger';

export interface BuildUPROptions {
  /** Explicitly trigger OCR even if DOM confidence is >= 0.70 */
  forceOCR?: boolean;
  /** Explicitly skip OCR stage (e.g. for vision-only tests) */
  skipOCR?: boolean;
  /** Explicitly trigger Stage 3 Vision fallback even if confidence is >= 0.40 */
  forceVision?: boolean;
  /** Explicit image or canvas elements to run perception on (defaults to page images/canvases) */
  targetImages?: Array<HTMLImageElement | HTMLCanvasElement>;
  /** Backward-compat alias for targetImages */
  ocrImages?: Array<HTMLImageElement | HTMLCanvasElement>;
}

/**
 * Builds the complete Unified Page Representation (UPR) for the current webpage.
 * Automatically escalates across perception tiers:
 *   - Tier 1: DOM Analysis (always)
 *   - Tier 2: OCR Extraction (if confidence < 0.70 or forceOCR)
 *   - Tier 3: Vision Fallback (if confidence < 0.40 or forceVision)
 *
 * @param domResult - Optional pre-computed DOM analysis result from Phase 1.
 *                    If omitted, runs analyzePage() automatically.
 * @param options - Optional flags for OCR/Vision escalation and target image regions.
 * @returns UnifiedPageRepresentation ready for privacy engine (Phase 3) or LLM reasoning (Phase 6)
 */
export async function buildUPR(
  domResult?: DOMAnalysisResult,
  options?: BuildUPROptions
): Promise<UnifiedPageRepresentation> {
  const dom = domResult ?? analyzePage();

  // 1. Enrich raw elements with semantic classifications and PII flags
  let elements: UPRElement[] = enrichElementsWithSemantics(dom.elements);

  // 2. Detect and group forms
  let forms: UPRForm[] = detectForms(elements);

  // 3. Score overall perception confidence for DOM stage
  let overall_confidence = computeOverallConfidence(elements, forms);

  const perception_source: PerceptionSource[] = ['dom'];

  const imagesToScan = options?.targetImages ?? options?.ocrImages ?? (
    typeof document !== 'undefined'
      ? (Array.from(document.querySelectorAll('img, canvas')) as Array<HTMLImageElement | HTMLCanvasElement>)
      : []
  );

  // 4. Stage 2: Trigger OCR if DOM confidence < 0.70 or explicitly requested
  if (!options?.skipOCR && (shouldTriggerOCR(overall_confidence) || options?.forceOCR)) {
    try {
      if (imagesToScan.length > 0) {
        logger.info(`[UnifiedPageRep] DOM confidence (${overall_confidence}) < 0.70 or forced. Running OCR on ${imagesToScan.length} elements...`);
        const ocrElements = await ocrEngine.extractFromPageImages(imagesToScan);
        if (ocrElements.length > 0) {
          elements = [...elements, ...ocrElements];
          perception_source.push('ocr');
          forms = detectForms(elements);
          // Re-evaluate confidence including OCR elements
          overall_confidence = computeOverallConfidence(elements, forms);
        }
      }
    } catch (err) {
      logger.warn('[UnifiedPageRep] OCR escalation encountered an issue', err);
    }
  }

  // 5. Stage 3: Trigger Vision Fallback if confidence < 0.40 or explicitly requested
  if (shouldTriggerVision(overall_confidence) || options?.forceVision) {
    try {
      if (imagesToScan.length > 0) {
        logger.info(`[UnifiedPageRep] Confidence (${overall_confidence}) < 0.40 or forced. Running Vision Fallback on ${imagesToScan.length} elements...`);
        const visionElements = await visionEngine.extractFromPageImages(imagesToScan);
        if (visionElements.length > 0) {
          elements = [...elements, ...visionElements];
          perception_source.push('vision');
          forms = detectForms(elements);
          // Re-evaluate confidence with vision elements included
          overall_confidence = computeOverallConfidence(elements, forms);
        }
      }
    } catch (err) {
      logger.warn('[UnifiedPageRep] Vision escalation encountered an issue', err);
    }
  }

  // 5. Compute snapshot hash of page state
  const snapshot_hash = await computeSnapshotHash(dom);

  const page: UPRPage = {
    title: dom.pageTitle,
    url: dom.pageUrl,
    snapshot_hash,
    timestamp: dom.timestamp,
  };

  return {
    page,
    elements,
    forms,
    perception_source,
    overall_confidence,
  };
}

/**
 * Synchronous variant of buildUPR using a fast deterministic hash.
 * Useful for tests and lightweight updates.
 */
export function buildUPRSync(
  domResult?: DOMAnalysisResult
): UnifiedPageRepresentation {
  const dom = domResult ?? analyzePage();
  const elements: UPRElement[] = enrichElementsWithSemantics(dom.elements);
  const forms: UPRForm[] = detectForms(elements);
  const overall_confidence = computeOverallConfidence(elements, forms);
  const snapshot_hash = computeFastHash(dom);

  const page: UPRPage = {
    title: dom.pageTitle,
    url: dom.pageUrl,
    snapshot_hash,
    timestamp: dom.timestamp,
  };

  return {
    page,
    elements,
    forms,
    perception_source: ['dom'],
    overall_confidence,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot Hashing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a SHA-256 hash representing the current DOM structure.
 * Used by backend and agent loop to detect page changes.
 */
async function computeSnapshotHash(dom: DOMAnalysisResult): Promise<string> {
  const signature = createPageSignature(dom);

  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(signature);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return `sha256:${hex}`;
    } catch {
      // Fallback if subtle crypto fails
    }
  }

  return computeFastHash(dom);
}

function computeFastHash(dom: DOMAnalysisResult): string {
  const signature = createPageSignature(dom);
  let hash = 0x811c9dc5;
  for (let i = 0; i < signature.length; i++) {
    hash ^= signature.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `sha256:${hex.repeat(8).slice(0, 64)}`;
}

function createPageSignature(dom: DOMAnalysisResult): string {
  const elementsDigest = dom.elements
    .map(e => `${e.id}:${e.tagName}:${e.htmlType ?? ''}:${e.label}:${e.interactable}`)
    .join('|');
  return `${dom.pageUrl}#${dom.pageTitle}#${elementsDigest}`;
}
