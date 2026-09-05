import { describe, it, expect } from 'vitest';
import {
  redactText,
  redactElement,
  redactUPR,
  verifySanitization,
} from '../src/privacy/redactor';
import type { UnifiedPageRepresentation, UPRElement } from '../src/shared/types';

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

describe('Phase 3: Redactor & Sanitization Auditor', () => {
  describe('Text Redaction', () => {
    it('redacts sensitive values with standard [LABEL] placeholders', () => {
      const input = 'Contact bob@corp.com or call +91 9876543210 regarding PAN ABCDE1234F.';
      const output = redactText(input);

      expect(output).toContain('[EMAIL]');
      expect(output).toContain('[PHONE]');
      expect(output).toContain('[PAN]');
      expect(output).not.toContain('bob@corp.com');
      expect(output).not.toContain('9876543210');
      expect(output).not.toContain('ABCDE1234F');
    });
  });

  describe('Element Redaction', () => {
    it('redacts element values for PII categories and preserves non-PII values', () => {
      const emailEl = makeUPR({ semantic: 'EMAIL', pii: true, value: 'alice@wonderland.com' });
      const phoneEl = makeUPR({ semantic: 'PHONE', pii: true, value: '+91 9123456789' });
      const nameEl = makeUPR({ semantic: 'NAME', pii: true, value: 'Alice Liddell' });
      const cityEl = makeUPR({ semantic: 'CITY', pii: false, value: 'Oxford' });
      const pwdEl = makeUPR({ htmlType: 'password', semantic: 'PASSWORD', value: 'secret123' as any });

      const redactedEmail = redactElement(emailEl);
      const redactedPhone = redactElement(phoneEl);
      const redactedName = redactElement(nameEl);
      const redactedCity = redactElement(cityEl);
      const redactedPwd = redactElement(pwdEl);

      expect(redactedEmail.value).toBe('[EMAIL]');
      expect(redactedPhone.value).toBe('[PHONE]');
      expect(redactedName.value).toBe('[NAME]');
      expect(redactedCity.value).toBe('Oxford'); // Non-PII preserved
      expect(redactedPwd.value).toBeUndefined();  // Password strictly undefined
    });
  });

  describe('Sanitization Audit Validator (Security Gate)', () => {
    it('passes audit (safe: true) when UPR is fully sanitized', () => {
      const sanitizedUPR: UnifiedPageRepresentation = {
        page: { title: 'Test', url: 'https://example.com', snapshot_hash: 'sha256:123', timestamp: 123 },
        elements: [
          makeUPR({ id: 'e1', label: 'Email', semantic: 'EMAIL', pii: true, value: '[EMAIL]' }),
          makeUPR({ id: 'e2', label: 'City', semantic: 'CITY', pii: false, value: 'Pune' }),
          makeUPR({ id: 'e3', label: 'Password', htmlType: 'password', semantic: 'PASSWORD', pii: true, value: undefined }),
        ],
        forms: [],
        perception_source: ['dom'],
        overall_confidence: 0.9,
      };

      const audit = verifySanitization(sanitizedUPR);
      expect(audit.safe).toBe(true);
      expect(audit.violations.length).toBe(0);
    });

    it('fails audit (safe: false) and identifies violations if raw PII leaks through', () => {
      const leakingUPR: UnifiedPageRepresentation = {
        page: { title: 'Leak Page', url: 'https://example.com', snapshot_hash: 'sha256:123', timestamp: 123 },
        elements: [
          makeUPR({ id: 'e1', label: 'Email', value: 'leaked.user@bank.com' }),
          makeUPR({ id: 'e2', label: 'PAN', value: 'ABCDE1234F' }),
          makeUPR({ id: 'e3', htmlType: 'password', value: 'mypassword123' }),
        ],
        forms: [],
        perception_source: ['dom'],
        overall_confidence: 0.9,
      };

      const audit = verifySanitization(leakingUPR);
      expect(audit.safe).toBe(false);
      expect(audit.violations.length).toBe(3);
      expect(audit.violations.some(v => v.includes('password'))).toBe(true);
      expect(audit.violations.some(v => v.includes('email'))).toBe(true);
      expect(audit.violations.some(v => v.includes('PAN'))).toBe(true);
    });

    it('redactUPR transforms an unredacted UPR into an audit-passing sanitized UPR', () => {
      const rawUPR: UnifiedPageRepresentation = {
        page: { title: 'User Form', url: 'https://example.com/reg', snapshot_hash: 'sha256:abc', timestamp: Date.now() },
        elements: [
          makeUPR({ id: 'e1', label: 'First Name', semantic: 'FIRST_NAME', pii: true, value: 'John' }),
          makeUPR({ id: 'e2', label: 'Email', semantic: 'EMAIL', pii: true, value: 'john@example.com' }),
          makeUPR({ id: 'e3', label: 'Phone', semantic: 'PHONE', pii: true, value: '+91 9876543210' }),
          makeUPR({ id: 'e4', label: 'PAN', semantic: 'PAN', pii: true, value: 'ABCDE1234F' }),
          makeUPR({ id: 'e5', label: 'City', semantic: 'CITY', pii: false, value: 'Mumbai' }),
        ],
        forms: [],
        perception_source: ['dom'],
        overall_confidence: 0.88,
      };

      // Before redaction: audit fails
      const preAudit = verifySanitization(rawUPR);
      expect(preAudit.safe).toBe(false);

      // After redaction: audit passes
      const sanitized = redactUPR(rawUPR);
      const postAudit = verifySanitization(sanitized);

      expect(postAudit.safe).toBe(true);
      expect(postAudit.violations.length).toBe(0);

      // Element values are sanitized
      expect(sanitized.elements.find(e => e.id === 'e1')?.value).toBe('[NAME]');
      expect(sanitized.elements.find(e => e.id === 'e2')?.value).toBe('[EMAIL]');
      expect(sanitized.elements.find(e => e.id === 'e3')?.value).toBe('[PHONE]');
      expect(sanitized.elements.find(e => e.id === 'e4')?.value).toBe('[PAN]');
      expect(sanitized.elements.find(e => e.id === 'e5')?.value).toBe('Mumbai');
    });
  });
});
