/**
 * pii_detector.ts
 *
 * Phase 3 core module.
 *
 * Multi-layer PII Detection Engine:
 *   - Layer 1: DOM Signals & Semantic Types (Zero overhead, attribute-based)
 *   - Layer 2: Regex Pattern Matching (Card Luhn, Aadhaar, PAN, Phone, Email, DOB)
 *   - Layer 3: NLP Named Entity Recognition via compromise.js (Person names)
 *
 * Runs locally in the browser content script context.
 * Guarantees zero network calls and sub-5ms latency per element.
 */

import nlp from 'compromise';
import type { PIICategory, PIIField, PIIMatch, SemanticType, UPRElement } from '../shared/types';
import { scanTextForPII } from './pattern_rules';
import { PII_SEMANTIC_TYPES } from '../perception/semantic_classifier';

// ─────────────────────────────────────────────────────────────────────────────
// Mapping from SemanticType to PIICategory
// ─────────────────────────────────────────────────────────────────────────────

const SEMANTIC_TO_PII_CATEGORY: Partial<Record<SemanticType, PIICategory>> = {
  NAME: 'NAME',
  FIRST_NAME: 'NAME',
  LAST_NAME: 'NAME',
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  PASSWORD: 'PASSWORD',
  CONFIRM_PASSWORD: 'PASSWORD',
  DATE_OF_BIRTH: 'DATE_OF_BIRTH',
  ADDRESS: 'ADDRESS',
  AADHAAR: 'AADHAAR',
  PAN: 'PAN',
  CARD_NUMBER: 'CARD',
  CARD_CVV: 'CVV',
  CARD_EXPIRY: 'OTHER_PII',
  OTP: 'OTP',
};

// ─────────────────────────────────────────────────────────────────────────────
// Public Detection API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects whether an individual UPRElement contains or expects PII.
 * Combines Layer 1 (DOM semantics), Layer 2 (Regex pattern scan), and Layer 3 (NLP).
 *
 * @param el - The UPRElement to inspect
 * @returns PIIField metadata if PII detected, or null if element is clean
 */
export function detectPIIInElement(el: UPRElement): PIIField | null {
  const value = el.value ?? '';

  // ── 1. Password Invariant (Hard Security Rule) ──
  if (el.htmlType === 'password' || el.semantic === 'PASSWORD' || el.semantic === 'CONFIRM_PASSWORD') {
    return {
      elementId: el.id,
      category: 'PASSWORD',
      originalValue: value,
      redactedValue: '[PASSWORD]',
    };
  }

  // ── 2. Layer 1: Semantic & Autocomplete PII Classification ──
  const mappedCategory = SEMANTIC_TO_PII_CATEGORY[el.semantic];
  if (mappedCategory && (el.pii || PII_SEMANTIC_TYPES.has(el.semantic))) {
    return {
      elementId: el.id,
      category: mappedCategory,
      originalValue: value,
      redactedValue: value ? `[${mappedCategory}]` : '',
    };
  }

  // ── 3. Layer 2: Regex Scan on Current Value ──
  if (value && value.trim().length > 0) {
    const regexMatches = scanTextForPII(value);
    if (regexMatches.length > 0) {
      const topMatch = regexMatches[0];
      return {
        elementId: el.id,
        category: topMatch.category,
        originalValue: value,
        redactedValue: `[${topMatch.category}]`,
      };
    }

    // ── 4. Layer 3: NLP-based Name Detection (compromise.js) ──
    const nlpCategory = detectNameWithNLP(value);
    if (nlpCategory) {
      return {
        elementId: el.id,
        category: nlpCategory,
        originalValue: value,
        redactedValue: '[NAME]',
      };
    }
  }

  return null;
}

/**
 * Scans a text string across Layer 2 (Regex) and Layer 3 (NLP) to detect PII matches.
 * Useful for scanning page labels, descriptions, or innerText for accidentally leaked personal data.
 *
 * @param text - Arbitrary text string
 * @returns Array of detected PIIMatches
 */
export function detectPIIInText(text: string): PIIMatch[] {
  if (!text || typeof text !== 'string') return [];

  // Layer 2: Regex scan
  const matches = scanTextForPII(text);

  // Layer 3: NLP Person entity extraction
  try {
    const doc = nlp(text);
    const people: string[] = doc.people().out('array');

    for (const person of people) {
      if (!person || person.length < 3) continue;

      const start = text.toLowerCase().indexOf(person.toLowerCase());
      if (start >= 0) {
        const end = start + person.length;
        const overlaps = matches.some(m => Math.max(start, m.start) < Math.min(end, m.end));
        if (!overlaps) {
          matches.push({
            category: 'NAME',
            value: text.slice(start, end),
            start,
            end,
            source: 'nlp',
            confidence: 0.85,
          });
        }
      }
    }
  } catch {
    // NLP failure is non-fatal
  }

  return matches.sort((a, b) => a.start - b.start);
}

/**
 * Scans all elements in a UPR and identifies all PII fields.
 *
 * @param elements - The UPRElements from perception
 * @returns Array of PIIField definitions
 */
export function detectAllPII(elements: UPRElement[]): PIIField[] {
  const piiFields: PIIField[] = [];

  for (const el of elements) {
    const detected = detectPIIInElement(el);
    if (detected) {
      piiFields.push(detected);
    }
  }

  return piiFields;
}

// ─────────────────────────────────────────────────────────────────────────────
// NLP Helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectNameWithNLP(value: string): PIICategory | null {
  const trimmed = value.trim();
  // Don't run NLP on single numbers or non-name tokens
  if (trimmed.length < 3 || /\d/.test(trimmed)) return null;

  try {
    const doc = nlp(trimmed);
    const people = doc.people().out('array');
    if (people.length > 0) {
      return 'NAME';
    }
  } catch {
    // compromise failure fallback
  }

  return null;
}
