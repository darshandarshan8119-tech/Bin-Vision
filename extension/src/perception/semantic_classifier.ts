/**
 * semantic_classifier.ts
 *
 * Phase 2 core module.
 *
 * Classifies raw DOM elements into semantic form field types:
 *   - NAME, FIRST_NAME, LAST_NAME
 *   - EMAIL, PHONE, PASSWORD, CONFIRM_PASSWORD
 *   - DATE, DATE_OF_BIRTH
 *   - ADDRESS, CITY, STATE, COUNTRY, PINCODE
 *   - USERNAME, SEARCH, SUBMIT, NAV, OTP, CAPTCHA
 *   - AADHAAR, PAN, CARD_NUMBER, CARD_EXPIRY, CARD_CVV, OTHER
 *
 * Multi-signal scoring engine:
 *   1. W3C Autocomplete attribute (highest authority standard)
 *   2. HTML type attribute (e.g. email, password, tel, date)
 *   3. Resolved label text matched against keyword signals
 *   4. HTML name and id attributes
 *   5. Placeholder attribute
 *   6. Pattern / inputmode / maxlength heuristics
 *   7. Element tag and ARIA roles (button, link, combobox)
 *
 * Output: { semantic: SemanticType, confidence: number, pii: boolean }
 */

import type { RawElement, SemanticType, UPRElement } from '../shared/types';
import { SEMANTIC_SIGNALS } from '../shared/constants';

// ─────────────────────────────────────────────────────────────────────────────
// PII Classification Map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Semantic types that are considered PII (Personally Identifiable Information).
 * Fields classified as PII will be sanitized and tokenized in Phases 3-4.
 */
export const PII_SEMANTIC_TYPES: ReadonlySet<SemanticType> = new Set([
  'NAME',
  'FIRST_NAME',
  'LAST_NAME',
  'EMAIL',
  'PHONE',
  'PASSWORD',
  'CONFIRM_PASSWORD',
  'DATE_OF_BIRTH',
  'ADDRESS',
  'AADHAAR',
  'PAN',
  'CARD_NUMBER',
  'CARD_EXPIRY',
  'CARD_CVV',
  'OTP',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Autocomplete Attribute Mappings (W3C standard)
// ─────────────────────────────────────────────────────────────────────────────

const AUTOCOMPLETE_MAP: Record<string, SemanticType> = {
  'name': 'NAME',
  'given-name': 'FIRST_NAME',
  'additional-name': 'FIRST_NAME',
  'family-name': 'LAST_NAME',
  'email': 'EMAIL',
  'tel': 'PHONE',
  'tel-national': 'PHONE',
  'tel-country-code': 'PHONE',
  'username': 'USERNAME',
  'new-password': 'PASSWORD',
  'current-password': 'PASSWORD',
  'bday': 'DATE_OF_BIRTH',
  'bday-day': 'DATE_OF_BIRTH',
  'bday-month': 'DATE_OF_BIRTH',
  'bday-year': 'DATE_OF_BIRTH',
  'street-address': 'ADDRESS',
  'address-line1': 'ADDRESS',
  'address-line2': 'ADDRESS',
  'address-level2': 'CITY',
  'address-level1': 'STATE',
  'country': 'COUNTRY',
  'country-name': 'COUNTRY',
  'postal-code': 'PINCODE',
  'cc-number': 'CARD_NUMBER',
  'cc-exp': 'CARD_EXPIRY',
  'cc-exp-month': 'CARD_EXPIRY',
  'cc-exp-year': 'CARD_EXPIRY',
  'cc-csc': 'CARD_CVV',
  'one-time-code': 'OTP',
};

// ─────────────────────────────────────────────────────────────────────────────
// Public Classification API
// ─────────────────────────────────────────────────────────────────────────────

export interface ClassificationResult {
  semantic: SemanticType;
  confidence: number;
  pii: boolean;
}

/**
 * Classifies a single RawElement and returns its semantic type, confidence, and PII flag.
 *
 * @param el - Raw element extracted by dom_analyzer
 * @returns ClassificationResult
 */
export function classifyElement(el: RawElement): ClassificationResult {
  // ── Non-input elements: buttons, links, images ──
  if (el.type === 'link') {
    return { semantic: 'NAV', confidence: 0.90, pii: false };
  }

  if (el.type === 'button' || el.htmlType === 'submit') {
    const btnText = (el.innerText || el.label || el.value || '').toLowerCase();
    if (btnText.includes('search')) {
      return { semantic: 'SEARCH', confidence: 0.85, pii: false };
    }
    return { semantic: 'SUBMIT', confidence: 0.90, pii: false };
  }

  // ── CAPTCHA Detection ──
  if (isCaptcha(el)) {
    return { semantic: 'CAPTCHA', confidence: 0.95, pii: false };
  }

  // ── Password & Confirm Password (High Priority Security Field) ──
  if (el.htmlType === 'password') {
    const textContext = `${el.label} ${el.htmlName ?? ''} ${el.htmlId ?? ''} ${el.placeholder ?? ''}`.toLowerCase();
    if (
      textContext.includes('confirm') ||
      textContext.includes('repeat') ||
      textContext.includes('re-enter') ||
      textContext.includes('verify') ||
      textContext.includes('retype') ||
      textContext.includes('again')
    ) {
      return { semantic: 'CONFIRM_PASSWORD', confidence: 0.95, pii: true };
    }
    return { semantic: 'PASSWORD', confidence: 0.95, pii: true };
  }

  // ── Strategy 1: W3C Autocomplete Attribute (Authoritative) ──
  if (el.autocomplete) {
    const autoClean = el.autocomplete.toLowerCase().trim();
    // autocomplete can contain multi-token values like "section-blue shipping given-name"
    for (const token of autoClean.split(/\s+/)) {
      const match = AUTOCOMPLETE_MAP[token];
      if (match) {
        // Special case: if autocomplete is new-password but label says confirm
        if (match === 'PASSWORD') {
          const textContext = `${el.label} ${el.htmlName ?? ''}`.toLowerCase();
          if (textContext.includes('confirm') || textContext.includes('repeat')) {
            return { semantic: 'CONFIRM_PASSWORD', confidence: 0.95, pii: true };
          }
        }
        return { semantic: match, confidence: 0.95, pii: PII_SEMANTIC_TYPES.has(match) };
      }
    }
  }

  // ── Strategy 2: HTML Type Attribute ──
  if (el.htmlType === 'email') {
    return { semantic: 'EMAIL', confidence: 0.95, pii: true };
  }
  if (el.htmlType === 'tel') {
    return { semantic: 'PHONE', confidence: 0.90, pii: true };
  }
  if (el.htmlType === 'search') {
    return { semantic: 'SEARCH', confidence: 0.90, pii: false };
  }
  if (el.htmlType === 'date') {
    const textContext = `${el.label} ${el.htmlName ?? ''} ${el.htmlId ?? ''}`.toLowerCase();
    if (
      textContext.includes('birth') ||
      textContext.includes('dob') ||
      textContext.includes('bday')
    ) {
      return { semantic: 'DATE_OF_BIRTH', confidence: 0.95, pii: true };
    }
    return { semantic: 'DATE', confidence: 0.85, pii: false };
  }

  // ── Strategy 3: Multi-signal Keyword Scoring Engine ──
  const candidates = scoreSemanticCandidates(el);

  if (candidates.length > 0 && candidates[0].score > 0) {
    const best = candidates[0];
    const confidence = Math.min(0.95, Math.max(0.40, Number((best.score / 100).toFixed(2))));
    return {
      semantic: best.type,
      confidence,
      pii: PII_SEMANTIC_TYPES.has(best.type),
    };
  }

  // ── Fallback ──
  return {
    semantic: 'OTHER',
    confidence: 0.30,
    pii: false,
  };
}

/**
 * Enriches an array of RawElements into UPRElements with semantic classification.
 */
export function enrichElementsWithSemantics(elements: RawElement[]): UPRElement[] {
  return elements.map(el => {
    const classification = classifyElement(el);
    return {
      ...el,
      semantic: classification.semantic,
      source: 'dom',
      confidence: classification.confidence,
      pii: classification.pii,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Signal Scoring Implementation
// ─────────────────────────────────────────────────────────────────────────────

interface CandidateScore {
  type: SemanticType;
  score: number;
}

/**
 * Evaluates all semantic candidate types against element label, name, id, and placeholder.
 */
function scoreSemanticCandidates(el: RawElement): CandidateScore[] {
  const labelNorm = normalizeText(el.label);
  const nameNorm = normalizeText(el.htmlName);
  const idNorm = normalizeText(el.htmlId);
  const placeholderNorm = normalizeText(el.placeholder);
  const ariaNorm = normalizeText(el.ariaLabel);

  const scores: Map<SemanticType, number> = new Map();

  function addScore(type: SemanticType, points: number): void {
    scores.set(type, (scores.get(type) ?? 0) + points);
  }

  // ── Check specific high-priority Indian & global ID patterns first ──
  if (matchesKeyword(['aadhaar', 'aadhar', 'uid'], [labelNorm, nameNorm, idNorm, placeholderNorm])) {
    addScore('AADHAAR', 90);
  }

  if (matchesKeyword(['pan', 'pancard', 'pan_number', 'pan-number'], [labelNorm, nameNorm, idNorm, placeholderNorm])) {
    addScore('PAN', 90);
  }

  if (matchesKeyword(['pincode', 'pin', 'zip', 'zipcode', 'postal', 'postcode'], [labelNorm, nameNorm, idNorm, placeholderNorm])) {
    addScore('PINCODE', 95);
  }

  // ── Check Username vs First vs Last vs Full Name ──
  if (matchesKeyword(SEMANTIC_SIGNALS.USERNAME, [labelNorm, nameNorm, idNorm, placeholderNorm, ariaNorm])) {
    addScore('USERNAME', 95);
  } else if (matchesKeyword(SEMANTIC_SIGNALS.FIRST_NAME, [labelNorm, nameNorm, idNorm, placeholderNorm, ariaNorm])) {
    addScore('FIRST_NAME', 85);
  } else if (matchesKeyword(SEMANTIC_SIGNALS.LAST_NAME, [labelNorm, nameNorm, idNorm, placeholderNorm, ariaNorm])) {
    addScore('LAST_NAME', 85);
  } else if (matchesKeyword(SEMANTIC_SIGNALS.NAME, [labelNorm, nameNorm, idNorm, placeholderNorm, ariaNorm])) {
    addScore('NAME', 75);
  }

  // ── Check Confirm Password vs Password ──
  if (matchesKeyword(SEMANTIC_SIGNALS.CONFIRM_PASSWORD, [labelNorm, nameNorm, idNorm, placeholderNorm])) {
    addScore('CONFIRM_PASSWORD', 90);
  } else if (matchesKeyword(SEMANTIC_SIGNALS.PASSWORD, [labelNorm, nameNorm, idNorm, placeholderNorm])) {
    addScore('PASSWORD', 85);
  }

  // ── Check Date of Birth vs Date ──
  if (matchesKeyword(SEMANTIC_SIGNALS.DATE_OF_BIRTH, [labelNorm, nameNorm, idNorm, placeholderNorm, ariaNorm])) {
    addScore('DATE_OF_BIRTH', 85);
  } else if (matchesKeyword(SEMANTIC_SIGNALS.DATE, [labelNorm, nameNorm, idNorm, placeholderNorm])) {
    addScore('DATE', 70);
  }

  // ── Check Remaining Types ──
  const generalTypes: SemanticType[] = [
    'EMAIL',
    'PHONE',
    'CITY',
    'STATE',
    'COUNTRY',
    'ADDRESS',
    'OTP',
    'CARD_NUMBER',
    'CARD_EXPIRY',
    'CARD_CVV',
    'SEARCH',
  ];

  for (const type of generalTypes) {
    const signals = SEMANTIC_SIGNALS[type];
    if (!signals) continue;

    let total = 0;
    if (matchesKeyword(signals, [labelNorm])) total += 50;
    if (matchesKeyword(signals, [ariaNorm])) total += 45;
    if (matchesKeyword(signals, [nameNorm])) total += 35;
    if (matchesKeyword(signals, [idNorm])) total += 30;
    if (matchesKeyword(signals, [placeholderNorm])) total += 25;

    if (total > 0) {
      addScore(type, total);
    }
  }

  // Convert to sorted list
  const results: CandidateScore[] = [];
  for (const [type, score] of scores.entries()) {
    results.push({ type, score });
  }

  return results.sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .trim();
}

/**
 * Checks if any keyword is matched as a whole word or significant sub-token
 * in any of the target string contexts.
 */
function matchesKeyword(keywords: string[], targets: string[]): boolean {
  for (const target of targets) {
    if (!target) continue;
    const tokens = target.split(/\s+/);
    for (const kw of keywords) {
      const kwClean = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!kwClean) continue;
      for (const token of tokens) {
        if (!token) continue;
        if (token === kwClean) return true;

        // Prevent "username" or "domainname" from matching generic "name"
        if (kwClean === 'name' && (token.includes('user') || token.includes('domain') || token.includes('host'))) {
          continue;
        }

        // Substring / compound word matching (e.g. "pincode" / "pin", "firstname" / "first")
        if (
          (token.length >= 3 && kwClean.length >= 3) &&
          (token.startsWith(kwClean) || token.endsWith(kwClean) || kwClean.startsWith(token) || kwClean.endsWith(token))
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function isCaptcha(el: RawElement): boolean {
  const text = `${el.htmlId ?? ''} ${el.htmlName ?? ''} ${el.domPath} ${el.label}`.toLowerCase();
  return (
    text.includes('captcha') ||
    text.includes('recaptcha') ||
    text.includes('hcaptcha') ||
    text.includes('cf-turnstile') ||
    text.includes('g-recaptcha')
  );
}
