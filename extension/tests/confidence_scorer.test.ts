import { describe, it, expect } from 'vitest';
import {
  computeOverallConfidence,
  evaluateConfidenceBreakdown,
  isDOMSufficient,
  shouldTriggerOCR,
  shouldTriggerVision,
} from '../src/perception/confidence_scorer';
import type { UPRElement, UPRForm } from '../src/shared/types';

function makeUPRElement(overrides: Partial<UPRElement>): UPRElement {
  return {
    id: 'e1',
    tagName: 'INPUT',
    type: 'input',
    label: 'First Name',
    semantic: 'FIRST_NAME',
    source: 'dom',
    confidence: 0.9,
    pii: true,
    bbox: [0, 0, 100, 30],
    visible: true,
    interactable: true,
    domPath: 'form > input',
    attributes: {},
    ...overrides,
  };
}

describe('Phase 2: Confidence Scorer', () => {
  it('gives high confidence (>= 0.70) for well-structured form pages', () => {
    const elements: UPRElement[] = [
      makeUPRElement({ id: 'e1', label: 'First Name', semantic: 'FIRST_NAME', confidence: 0.95 }),
      makeUPRElement({ id: 'e2', label: 'Last Name', semantic: 'LAST_NAME', confidence: 0.95 }),
      makeUPRElement({ id: 'e3', label: 'Email Address', semantic: 'EMAIL', confidence: 0.95 }),
      makeUPRElement({ id: 'e4', label: 'Password', semantic: 'PASSWORD', confidence: 0.95 }),
      makeUPRElement({ id: 'e5', label: 'Register', semantic: 'SUBMIT', type: 'button', confidence: 0.90 }),
    ];

    const forms: UPRForm[] = [
      {
        form_id: 'reg-form',
        element_ids: ['e1', 'e2', 'e3', 'e4', 'e5'],
        semantic_purpose: 'REGISTRATION',
      },
    ];

    const breakdown = evaluateConfidenceBreakdown(elements, forms);
    expect(breakdown.overall).toBeGreaterThanOrEqual(0.70);
    expect(breakdown.recommendedNextStage).toBe('DOM_COMPLETE');
    expect(isDOMSufficient(breakdown.overall)).toBe(true);
    expect(shouldTriggerOCR(breakdown.overall)).toBe(false);
  });

  it('recommends OCR when labels/semantics are ambiguous (0.40 - 0.69)', () => {
    const elements: UPRElement[] = [
      makeUPRElement({ id: 'e1', label: '', semantic: 'OTHER', confidence: 0.40 }),
      makeUPRElement({ id: 'e2', label: '', semantic: 'OTHER', confidence: 0.40 }),
      makeUPRElement({ id: 'e3', label: 'e3', semantic: 'OTHER', confidence: 0.40 }),
    ];

    const forms: UPRForm[] = [
      {
        form_id: 'form_1',
        element_ids: ['e1', 'e2', 'e3'],
        semantic_purpose: 'OTHER',
      },
    ];

    const breakdown = evaluateConfidenceBreakdown(elements, forms);
    expect(breakdown.overall).toBeLessThan(0.70);
    expect(shouldTriggerOCR(breakdown.overall)).toBe(true);
  });

  it('recommends Vision model when page has almost no detectable structure (< 0.40)', () => {
    const breakdown = evaluateConfidenceBreakdown([], []);
    expect(breakdown.overall).toBeLessThan(0.40);
    expect(breakdown.recommendedNextStage).toBe('TRIGGER_VISION');
    expect(shouldTriggerVision(breakdown.overall)).toBe(true);
  });
});
