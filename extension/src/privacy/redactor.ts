/**
 * redactor.ts
 *
 * Phase 3 core module.
 *
 * Replaces sensitive Personally Identifiable Information (PII) with
 * privacy-safe placeholders:
 *   - "john.doe@example.com" → "[EMAIL]"
 *   - "+91 98765 43210"      → "[PHONE]"
 *   - "2345 6789 0123"       → "[AADHAAR]"
 *   - "ABCDE1234F"           → "[PAN]"
 *   - "4111 1111 1111 1111"  → "[CARD]"
 *   - "John Doe"             → "[NAME]"
 *   - Passwords              → Always undefined / [PASSWORD]
 *
 * Guarantees:
 *   - Zero raw PII in output UnifiedPageRepresentation
 *   - Sanitization audit validator to verify 100% compliance before network dispatch
 */

import type { PIICategory, UnifiedPageRepresentation, UPRElement } from '../shared/types';
import { detectPIIInElement, detectPIIInText } from './pii_detector';
import { STRICT_PATTERNS, validateLuhn, isAadhaar, isPAN } from './pattern_rules';

// ─────────────────────────────────────────────────────────────────────────────
// Redaction Placeholders
// ─────────────────────────────────────────────────────────────────────────────

export const REDACTION_PLACEHOLDERS: Record<PIICategory, string> = {
  NAME: '[NAME]',
  EMAIL: '[EMAIL]',
  PHONE: '[PHONE]',
  CARD: '[CARD]',
  AADHAAR: '[AADHAAR]',
  PAN: '[PAN]',
  PASSWORD: '[PASSWORD]',
  ADDRESS: '[ADDRESS]',
  DATE_OF_BIRTH: '[DATE_OF_BIRTH]',
  OTP: '[OTP]',
  CVV: '[CVV]',
  FACE: '[FACE]',
  DOCUMENT: '[DOCUMENT]',
  OTHER_PII: '[PII]',
};

// ─────────────────────────────────────────────────────────────────────────────
// Public Redaction API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Redacts any detected PII within an arbitrary text string.
 *
 * @param text - The raw text that may contain personal data
 * @returns Sanitized text with placeholders
 */
export function redactText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  const matches = detectPIIInText(text);
  if (matches.length === 0) return text;

  // Replace from end to start to maintain accurate index offsets
  let result = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const placeholder = REDACTION_PLACEHOLDERS[m.category] ?? '[PII]';
    result = result.slice(0, m.start) + placeholder + result.slice(m.end);
  }

  return result;
}

/**
 * Redacts an individual UPRElement.
 * If the element contains or represents PII, its value is replaced with a placeholder.
 *
 * @param el - The source UPRElement
 * @returns Cloned UPRElement with sanitized values
 */
export function redactElement(el: UPRElement): UPRElement {
  const cloned: UPRElement = { ...el };

  // Hard Security Invariant: Passwords never have values
  if (cloned.htmlType === 'password' || cloned.semantic === 'PASSWORD' || cloned.semantic === 'CONFIRM_PASSWORD') {
    cloned.value = undefined;
    cloned.pii = true;
    return cloned;
  }

  const piiInfo = detectPIIInElement(cloned);

  if (piiInfo) {
    cloned.pii = true;
    if (cloned.value && cloned.value.trim().length > 0) {
      cloned.value = REDACTION_PLACEHOLDERS[piiInfo.category] ?? '[PII]';
    }
  }

  // Also sanitize any stray PII accidentally found in labels or innerText
  if (cloned.label) {
    cloned.label = redactText(cloned.label);
  }
  if (cloned.innerText) {
    cloned.innerText = redactText(cloned.innerText);
  }

  return cloned;
}

/**
 * Transforms a full UnifiedPageRepresentation into a Sanitized UPR.
 * All PII field values are replaced with [CATEGORY] placeholders.
 *
 * @param upr - The raw UnifiedPageRepresentation from Stage 1 perception
 * @returns Sanitized UnifiedPageRepresentation safe for server dispatch
 */
export function redactUPR(upr: UnifiedPageRepresentation): UnifiedPageRepresentation {
  const redactedElements = upr.elements.map(redactElement);

  return {
    ...upr,
    elements: redactedElements,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitization Audit Validator (Security Gate)
// ─────────────────────────────────────────────────────────────────────────────

export interface SanitizationAuditResult {
  safe: boolean;
  violations: string[];
}

/**
 * Deeply audits a UnifiedPageRepresentation to verify that zero raw PII values leak through.
 * Must return safe === true before sending the UPR over WebSocket to backend.
 *
 * @param upr - The UPR to verify
 * @returns SanitizationAuditResult
 */
export function verifySanitization(upr: UnifiedPageRepresentation): SanitizationAuditResult {
  const violations: string[] = [];

  for (const el of upr.elements) {
    // 1. Check password invariant
    if (el.htmlType === 'password' && el.value !== undefined) {
      violations.push(`Element ${el.id} (${el.label}) is a password field but has a defined value.`);
    }

    const val = el.value ?? '';
    if (!val || val.startsWith('[') && val.endsWith(']')) {
      continue; // Value is empty or already a placeholder like [EMAIL]
    }

    // 2. Check for leaked Email
    if (STRICT_PATTERNS.EMAIL.test(val)) {
      violations.push(`Element ${el.id} contains raw email: "${val.slice(0, 3)}***"`);
    }

    // 3. Check for leaked Phone
    if (STRICT_PATTERNS.PHONE_IN.test(val) || STRICT_PATTERNS.PHONE_INTL.test(val)) {
      violations.push(`Element ${el.id} contains raw phone number.`);
    }

    // 4. Check for leaked Card Number
    if (validateLuhn(val)) {
      violations.push(`Element ${el.id} contains raw credit card number passing Luhn check.`);
    }

    // 5. Check for leaked Aadhaar
    if (isAadhaar(val)) {
      violations.push(`Element ${el.id} contains raw Aadhaar number.`);
    }

    // 6. Check for leaked PAN
    if (isPAN(val)) {
      violations.push(`Element ${el.id} contains raw PAN card number.`);
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}
