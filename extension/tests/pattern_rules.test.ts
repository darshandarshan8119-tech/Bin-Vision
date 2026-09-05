import { describe, it, expect } from 'vitest';
import {
  validateLuhn,
  isAadhaar,
  isPAN,
  isEmail,
  isPhone,
  scanTextForPII,
} from '../src/privacy/pattern_rules';

describe('Phase 3: Pattern Rules & PII Validators', () => {
  describe('Luhn Checksum Algorithm for Payment Cards', () => {
    it('validates genuine credit card number sequences', () => {
      // Standard valid test card numbers (Luhn compliant)
      expect(validateLuhn('49927398716')).toBe(true);
      expect(validateLuhn('4992-7398-716')).toBe(true);
      expect(validateLuhn('79927398713')).toBe(true);
    });

    it('rejects invalid card sequences that fail Luhn checksum', () => {
      expect(validateLuhn('49927398717')).toBe(false);
      expect(validateLuhn('1234567812345678')).toBe(false);
      expect(validateLuhn('12345')).toBe(false); // Too short
    });
  });

  describe('Indian National Identity Validators', () => {
    it('validates 12-digit Indian Aadhaar numbers', () => {
      expect(isAadhaar('2345 6789 0123')).toBe(true);
      expect(isAadhaar('234567890123')).toBe(true);
      expect(isAadhaar('2345-6789-0123')).toBe(true);
    });

    it('rejects invalid Aadhaar numbers (starts with 0 or 1, or wrong length)', () => {
      expect(isAadhaar('0123 4567 8901')).toBe(false); // Cannot start with 0
      expect(isAadhaar('1234 5678 9012')).toBe(false); // Cannot start with 1
      expect(isAadhaar('2345 6789')).toBe(false);      // Too short
    });

    it('validates Indian PAN card format (5 letters + 4 digits + 1 letter)', () => {
      expect(isPAN('ABCDE1234F')).toBe(true);
      expect(isPAN('BKRPD5432K')).toBe(true); // P for Person
    });

    it('rejects invalid PAN card strings', () => {
      expect(isPAN('ABCD12345F')).toBe(false); // Wrong letter/digit split
      expect(isPAN('ABCDE12345')).toBe(false);  // Missing final letter
      expect(isPAN('12345ABCDE')).toBe(false);
    });
  });

  describe('Contact Validators', () => {
    it('validates standard email formats', () => {
      expect(isEmail('user@example.com')).toBe(true);
      expect(isEmail('first.last+tag@sub.domain.org')).toBe(true);
      expect(isEmail('not-an-email')).toBe(false);
      expect(isEmail('missing@domain')).toBe(false);
    });

    it('validates Indian and international phone numbers', () => {
      expect(isPhone('+91 98765 43210')).toBe(true);
      expect(isPhone('9876543210')).toBe(true);
      expect(isPhone('+1 (555) 234-5678')).toBe(true);
      expect(isPhone('123')).toBe(false); // Too short
    });
  });

  describe('Regex Text Scanning', () => {
    it('detects multiple PII types embedded in a single sentence', () => {
      const text = 'Customer email is alice@corp.com and phone is +91 9876543210. PAN: ABCDE1234F.';
      const matches = scanTextForPII(text);

      expect(matches.length).toBe(3);
      expect(matches.some(m => m.category === 'EMAIL' && m.value === 'alice@corp.com')).toBe(true);
      expect(matches.some(m => m.category === 'PHONE' && m.value.includes('9876543210'))).toBe(true);
      expect(matches.some(m => m.category === 'PAN' && m.value === 'ABCDE1234F')).toBe(true);
    });
  });
});
