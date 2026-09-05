/**
 * pattern_rules.ts
 *
 * Phase 3 core module.
 *
 * Layer 2 Privacy Engine: Regular expression patterns and validation algorithms
 * for high-confidence PII detection and format verification.
 *
 * Supported PII Categories:
 *   - EMAIL: Standard RFC-compliant emails
 *   - PHONE: Indian (+91 9876543210) & E.164 international phone formats
 *   - AADHAAR: 12-digit Indian Unique Identification number (grouped 4-4-4)
 *   - PAN: Indian Permanent Account Number (5 letters + 4 digits + 1 letter)
 *   - CARD: 13-16 digit payment card numbers (with Luhn checksum validation)
 *   - CVV: 3-4 digit card verification code
 *   - OTP: 4-8 digit one-time passwords
 *   - PINCODE: Indian 6-digit postal code
 *   - DATE: Common date formats (DD/MM/YYYY, YYYY-MM-DD, etc.)
 */

import type { PIICategory, PIIMatch } from '../shared/types';

// ─────────────────────────────────────────────────────────────────────────────
// Regex Pattern Definitions (Safe Non-global Copies for Regex.test)
// ─────────────────────────────────────────────────────────────────────────────

export const STRICT_PATTERNS = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PHONE_IN: /^(?:\+91[\s-]?)?[6-9]\d{9}$/,
  PHONE_INTL: /^\+?[1-9]\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}$/,
  AADHAAR: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}$/,
  PAN: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  PINCODE: /^[1-9][0-9]{5}$/,
  CVV: /^\d{3,4}$/,
  OTP: /^\d{4,8}$/,
  DATE: /^\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}$/,
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation Algorithms
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates a credit/debit card number using the Luhn checksum algorithm (Mod 10).
 * Prevents false positives on arbitrary sequences of 16 numbers.
 */
export function validateLuhn(cardNumber: string): boolean {
  const sanitized = cardNumber.replace(/[\s-]/g, '');
  if (!/^\d{11,19}$/.test(sanitized)) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = sanitized.length - 1; i >= 0; i--) {
    let digit = parseInt(sanitized.charAt(i), 10);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

/**
 * Validates whether a string matches Indian Aadhaar structure.
 * Aadhaar is a 12-digit number, never starting with 0 or 1.
 */
export function isAadhaar(val: string): boolean {
  const clean = val.replace(/[\s-]/g, '');
  if (clean.length !== 12) return false;
  if (!/^[2-9]\d{11}$/.test(clean)) return false;
  return true;
}

/**
 * Validates whether a string matches Indian PAN card structure.
 * Format: 5 uppercase letters + 4 digits + 1 uppercase letter.
 */
export function isPAN(val: string): boolean {
  const clean = val.trim().toUpperCase();
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(clean);
}

/**
 * Validates standard email address.
 */
export function isEmail(val: string): boolean {
  return STRICT_PATTERNS.EMAIL.test(val.trim());
}

/**
 * Validates phone numbers (Indian mobile or international E.164).
 */
export function isPhone(val: string): boolean {
  const clean = val.trim();
  if (STRICT_PATTERNS.PHONE_IN.test(clean)) return true;
  const digitsOnly = clean.replace(/\D/g, '');
  if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
    return /^\+?[\d\s().-]{7,25}$/.test(clean);
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Regex Text Scanner
// ─────────────────────────────────────────────────────────────────────────────

interface PatternRuleDef {
  category: PIICategory;
  regex: RegExp;
  confidence: number;
  validator?: (match: string) => boolean;
}

const SCAN_RULES: PatternRuleDef[] = [
  {
    category: 'EMAIL',
    regex: /[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}/gi,
    confidence: 0.98,
    validator: isEmail,
  },
  {
    category: 'PAN',
    regex: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
    confidence: 0.98,
    validator: isPAN,
  },
  {
    category: 'AADHAAR',
    regex: /\b[2-9]\d{3}\s\d{4}\s\d{4}\b/g,
    confidence: 0.95,
    validator: isAadhaar,
  },
  {
    category: 'CARD',
    regex: /\b(?:\d[ \-]?){13,16}\b/g,
    confidence: 0.95,
    validator: validateLuhn,
  },
  {
    category: 'PHONE',
    regex: /(?:\+91[\s\-]?)?[6-9]\d{9}\b/g,
    confidence: 0.90,
    validator: (m) => m.replace(/\D/g, '').length >= 10,
  },
  {
    category: 'PHONE',
    regex: /\+?[1-9]\d{0,2}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g,
    confidence: 0.85,
    validator: (m) => m.replace(/\D/g, '').length >= 10,
  },
  {
    category: 'DATE_OF_BIRTH',
    regex: /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g,
    confidence: 0.75,
  },
];

/**
 * Scans a text string against all regex pattern rules and returns
 * all verified PII matches with their character offsets.
 *
 * @param text - The text to scan for PII
 * @returns Array of PIIMatch objects sorted by appearance in text
 */
export function scanTextForPII(text: string): PIIMatch[] {
  if (!text || typeof text !== 'string') return [];

  const matches: PIIMatch[] = [];

  for (const rule of SCAN_RULES) {
    // Clone regex with sticky/global index reset
    const regex = new RegExp(rule.regex.source, rule.regex.flags);
    let result: RegExpExecArray | null;

    while ((result = regex.exec(text)) !== null) {
      const matchValue = result[0];
      const start = result.index;
      const end = start + matchValue.length;

      // Run optional checksum / structural validation
      if (rule.validator && !rule.validator(matchValue)) {
        continue;
      }

      // Check for overlap with already found matches
      const overlaps = matches.some(
        existing => Math.max(start, existing.start) < Math.min(end, existing.end)
      );

      if (!overlaps) {
        matches.push({
          category: rule.category,
          value: matchValue,
          start,
          end,
          source: 'regex',
          confidence: rule.confidence,
        });
      }
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}
