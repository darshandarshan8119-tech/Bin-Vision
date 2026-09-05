import { describe, it, expect } from 'vitest';
import {
  detectPIIInElement,
  detectPIIInText,
  detectAllPII,
} from '../src/privacy/pii_detector';
import type { UPRElement } from '../src/shared/types';

function makeUPR(overrides: Partial<UPRElement>): UPRElement {
  return {
    id: 'e1',
    tagName: 'INPUT',
    type: 'input',
    label: '',
    semantic: 'OTHER',
    source: 'dom',
    confidence: 0.9,
    pii: false,
    bbox: [0, 0, 100, 30],
    visible: true,
    interactable: true,
    domPath: 'form > input',
    attributes: {},
    ...overrides,
  };
}

describe('Phase 3: Multi-Layer PII Detector', () => {
  describe('Layer 1: DOM Semantics Detection', () => {
    it('detects password fields as high priority PII', () => {
      const pwd = makeUPR({ htmlType: 'password', semantic: 'PASSWORD' });
      const pii = detectPIIInElement(pwd);

      expect(pii).toBeDefined();
      expect(pii?.category).toBe('PASSWORD');
      expect(pii?.redactedValue).toBe('[PASSWORD]');
    });

    it('detects email and phone based on semantic tagging', () => {
      const email = makeUPR({ semantic: 'EMAIL', pii: true, value: 'user@example.com' });
      const phone = makeUPR({ semantic: 'PHONE', pii: true, value: '+91 9876543210' });

      const piiEmail = detectPIIInElement(email);
      const piiPhone = detectPIIInElement(phone);

      expect(piiEmail?.category).toBe('EMAIL');
      expect(piiPhone?.category).toBe('PHONE');
    });
  });

  describe('Layer 2: Regex Value Inspection', () => {
    it('identifies unclassified element containing an email value', () => {
      const genericField = makeUPR({ semantic: 'OTHER', pii: false, value: 'secret.user@bank.co.in' });
      const pii = detectPIIInElement(genericField);

      expect(pii).toBeDefined();
      expect(pii?.category).toBe('EMAIL');
    });

    it('identifies unclassified element containing a PAN card', () => {
      const genericField = makeUPR({ semantic: 'OTHER', pii: false, value: 'ABCDE1234F' });
      const pii = detectPIIInElement(genericField);

      expect(pii).toBeDefined();
      expect(pii?.category).toBe('PAN');
    });
  });

  describe('Layer 3: NLP Person Entity Extraction (compromise.js)', () => {
    it('detects person names in free-form text using NLP', () => {
      const text = 'This account belongs to Johnathan Doe who lives in Bangalore.';
      const matches = detectPIIInText(text);

      const nameMatch = matches.find(m => m.category === 'NAME');
      expect(nameMatch).toBeDefined();
      expect(nameMatch?.source).toBe('nlp');
    });
  });

  describe('Bulk Scanning', () => {
    it('detectAllPII correctly identifies all PII fields in a form list', () => {
      const elements: UPRElement[] = [
        makeUPR({ id: 'e1', semantic: 'FIRST_NAME', pii: true, value: 'Darsh' }),
        makeUPR({ id: 'e2', semantic: 'EMAIL', pii: true, value: 'darsh@example.com' }),
        makeUPR({ id: 'e3', semantic: 'CITY', pii: false, value: 'Mumbai' }),
        makeUPR({ id: 'e4', htmlType: 'password', semantic: 'PASSWORD' }),
      ];

      const piiList = detectAllPII(elements);
      const categories = piiList.map(p => p.category);

      expect(categories).toContain('NAME');
      expect(categories).toContain('EMAIL');
      expect(categories).toContain('PASSWORD');
      expect(categories).not.toContain('CITY');
    });
  });
});
