/**
 * confidence_scorer.ts
 *
 * Phase 2 core module.
 *
 * Evaluates the overall perception confidence of the page (0.0 to 1.0).
 * Implements the Two-Stage Perception Strategy thresholds from SIH26171:
 *   - Confidence >= 0.70: Stage 1 DOM perception is sufficient. Proceed directly.
 *   - Confidence 0.40 - 0.69: DOM is ambiguous. Trigger Stage 2 OCR (Tesseract.js).
 *   - Confidence < 0.40: Low confidence. Trigger Stage 3 Vision fallback (ONNX).
 */

import type { UPRElement, UPRForm } from '../shared/types';
import { CONFIDENCE_THRESHOLDS } from '../shared/constants';

export interface ConfidenceBreakdown {
  labelQualityScore: number;
  semanticClarityScore: number;
  formCoherenceScore: number;
  interactivityScore: number;
  overall: number;
  recommendedNextStage: 'DOM_COMPLETE' | 'TRIGGER_OCR' | 'TRIGGER_VISION';
}

/**
 * Computes the overall perception confidence score for a page based on
 * its extracted elements and detected forms.
 *
 * @param elements - The semantically enriched UPRElements
 * @param forms - The detected forms on the page
 * @returns Overall confidence score between 0.00 and 1.00
 */
export function computeOverallConfidence(
  elements: UPRElement[],
  forms: UPRForm[]
): number {
  const breakdown = evaluateConfidenceBreakdown(elements, forms);
  return breakdown.overall;
}

/**
 * Provides a detailed breakdown of how the perception confidence was scored.
 */
export function evaluateConfidenceBreakdown(
  elements: UPRElement[],
  forms: UPRForm[]
): ConfidenceBreakdown {
  if (elements.length === 0) {
    return {
      labelQualityScore: 0,
      semanticClarityScore: 0,
      formCoherenceScore: 0,
      interactivityScore: 0,
      overall: 0.1,
      recommendedNextStage: 'TRIGGER_VISION',
    };
  }

  // ── Factor 1: Label Quality (35% weight) ──
  // Check if labels are real human-readable descriptions, not fallback id/name/tag
  let highQualityLabels = 0;
  for (const el of elements) {
    const label = el.label?.trim() ?? '';
    const isTagOrEmpty = !label || label.toUpperCase() === el.tagName || label === el.htmlId;
    if (!isTagOrEmpty && label.length >= 2) {
      highQualityLabels++;
    }
  }
  const labelQualityScore = highQualityLabels / elements.length;

  // ── Factor 2: Semantic Clarity (35% weight) ──
  // Average confidence of semantic classification across all inputs and buttons
  const inputElements = elements.filter(
    e => e.type === 'input' || e.type === 'select' || e.type === 'textarea' || e.type === 'button'
  );
  const targetElements = inputElements.length > 0 ? inputElements : elements;
  const avgSemanticConfidence =
    targetElements.reduce((sum, el) => sum + (el.confidence ?? 0.5), 0) / targetElements.length;

  // ── Factor 3: Form Coherence (20% weight) ──
  // Pages with coherent identified forms (REGISTRATION, LOGIN, etc.) score higher
  let formCoherenceScore = 0.5; // default neutral
  if (forms.length > 0) {
    const hasRecognizedPurpose = forms.some(f => f.semantic_purpose && f.semantic_purpose !== 'OTHER');
    formCoherenceScore = hasRecognizedPurpose ? 0.95 : 0.65;
  }

  // ── Factor 4: Interactivity & Visibility (10% weight) ──
  const visibleAndInteractable = elements.filter(e => e.visible && e.interactable).length;
  const interactivityScore = visibleAndInteractable / elements.length;

  // ── Composite Score ──
  const rawOverall =
    labelQualityScore * 0.35 +
    avgSemanticConfidence * 0.35 +
    formCoherenceScore * 0.20 +
    interactivityScore * 0.10;

  const overall = Number(Math.min(1.0, Math.max(0.05, rawOverall)).toFixed(2));

  let recommendedNextStage: 'DOM_COMPLETE' | 'TRIGGER_OCR' | 'TRIGGER_VISION';
  if (overall >= CONFIDENCE_THRESHOLDS.DOM_SUFFICIENT) {
    recommendedNextStage = 'DOM_COMPLETE';
  } else if (overall >= CONFIDENCE_THRESHOLDS.OCR_SUFFICIENT) {
    recommendedNextStage = 'TRIGGER_OCR';
  } else {
    recommendedNextStage = 'TRIGGER_VISION';
  }

  return {
    labelQualityScore: Number(labelQualityScore.toFixed(2)),
    semanticClarityScore: Number(avgSemanticConfidence.toFixed(2)),
    formCoherenceScore: Number(formCoherenceScore.toFixed(2)),
    interactivityScore: Number(interactivityScore.toFixed(2)),
    overall,
    recommendedNextStage,
  };
}

/**
 * Checks if Stage 1 DOM perception meets the sufficiency threshold (>= 0.70).
 */
export function isDOMSufficient(confidence: number): boolean {
  return confidence >= CONFIDENCE_THRESHOLDS.DOM_SUFFICIENT;
}

/**
 * Checks if Stage 2 OCR should be triggered (confidence < 0.70).
 */
export function shouldTriggerOCR(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.DOM_SUFFICIENT;
}

/**
 * Checks if Stage 3 Vision fallback should be triggered (confidence < 0.40).
 */
export function shouldTriggerVision(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.OCR_SUFFICIENT;
}
