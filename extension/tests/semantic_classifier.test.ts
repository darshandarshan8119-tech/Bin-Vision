import { describe, it, expect } from 'vitest';
import { classifyElement, PII_SEMANTIC_TYPES } from '../src/perception/semantic_classifier';
import type { RawElement } from '../src/shared/types';

function makeRaw(overrides: Partial<RawElement>): RawElement {
  return {
    id: 'e1',
    tagName: 'INPUT',
    type: 'input',
    label: '',
    bbox: [0, 0, 100, 30],
    visible: true,
    interactable: true,
    domPath: 'html > body > form > input',
    attributes: {},
    ...overrides,
  };
}

describe('Phase 2: Semantic Classifier', () => {
  describe('Standard Form Field Classification', () => {
    it('classifies email via htmlType="email"', () => {
      const el = makeRaw({ htmlType: 'email', label: 'Email' });
      const res = classifyElement(el);
      expect(res.semantic).toBe('EMAIL');
      expect(res.confidence).toBeGreaterThanOrEqual(0.9);
      expect(res.pii).toBe(true);
    });

    it('classifies phone via htmlType="tel" and label', () => {
      const el = makeRaw({ htmlType: 'tel', label: 'Phone Number' });
      const res = classifyElement(el);
      expect(res.semantic).toBe('PHONE');
      expect(res.confidence).toBeGreaterThanOrEqual(0.85);
      expect(res.pii).toBe(true);
    });

    it('classifies first name and last name separately', () => {
      const first = makeRaw({ htmlType: 'text', label: 'First Name', autocomplete: 'given-name' });
      const last = makeRaw({ htmlType: 'text', label: 'Last Name', autocomplete: 'family-name' });

      expect(classifyElement(first).semantic).toBe('FIRST_NAME');
      expect(classifyElement(first).pii).toBe(true);
      expect(classifyElement(last).semantic).toBe('LAST_NAME');
      expect(classifyElement(last).pii).toBe(true);
    });

    it('distinguishes password from confirm password', () => {
      const pwd = makeRaw({ htmlType: 'password', label: 'Password' });
      const confirmPwd = makeRaw({ htmlType: 'password', label: 'Confirm Password' });
      const repeatPwd = makeRaw({ htmlType: 'password', label: 'Repeat Password', htmlName: 'repassword' });

      expect(classifyElement(pwd).semantic).toBe('PASSWORD');
      expect(classifyElement(confirmPwd).semantic).toBe('CONFIRM_PASSWORD');
      expect(classifyElement(repeatPwd).semantic).toBe('CONFIRM_PASSWORD');
    });

    it('classifies date of birth vs generic date', () => {
      const dob = makeRaw({ htmlType: 'date', label: 'Date of Birth', autocomplete: 'bday' });
      const genericDate = makeRaw({ htmlType: 'date', label: 'Appointment Date' });

      expect(classifyElement(dob).semantic).toBe('DATE_OF_BIRTH');
      expect(classifyElement(dob).pii).toBe(true);
      expect(classifyElement(genericDate).semantic).toBe('DATE');
    });

    it('classifies username via aria-label or autocomplete', () => {
      const user1 = makeRaw({ htmlType: 'text', ariaLabel: 'Username', placeholder: 'Choose a username' });
      const user2 = makeRaw({ htmlType: 'text', autocomplete: 'username' });

      expect(classifyElement(user1).semantic).toBe('USERNAME');
      expect(classifyElement(user2).semantic).toBe('USERNAME');
    });
  });

  describe('Address & Regional Identity Fields', () => {
    it('classifies City, State, and PIN Code correctly', () => {
      const city = makeRaw({ htmlType: 'text', placeholder: 'City', label: 'City' });
      const state = makeRaw({ htmlType: 'text', placeholder: 'State / Province', label: 'State' });
      const pin = makeRaw({ htmlType: 'text', placeholder: 'PIN Code', label: 'PIN Code' });

      expect(classifyElement(city).semantic).toBe('CITY');
      expect(classifyElement(state).semantic).toBe('STATE');
      expect(classifyElement(pin).semantic).toBe('PINCODE');
    });

    it('classifies Indian Aadhaar and PAN Card fields', () => {
      const aadhaar = makeRaw({ htmlType: 'text', label: 'Aadhaar Number', htmlName: 'aadhaar' });
      const pan = makeRaw({ htmlType: 'text', label: 'PAN Card Number', htmlName: 'pan' });

      expect(classifyElement(aadhaar).semantic).toBe('AADHAAR');
      expect(classifyElement(aadhaar).pii).toBe(true);

      expect(classifyElement(pan).semantic).toBe('PAN');
      expect(classifyElement(pan).pii).toBe(true);
    });
  });

  describe('Payment & Sensitive Verification Fields', () => {
    it('classifies Card Number, Expiry, CVV, and OTP', () => {
      const card = makeRaw({ autocomplete: 'cc-number', label: 'Credit Card Number' });
      const exp = makeRaw({ autocomplete: 'cc-exp', label: 'Expiry Date' });
      const cvv = makeRaw({ autocomplete: 'cc-csc', label: 'CVV' });
      const otp = makeRaw({ autocomplete: 'one-time-code', label: 'Enter OTP' });

      expect(classifyElement(card).semantic).toBe('CARD_NUMBER');
      expect(classifyElement(exp).semantic).toBe('CARD_EXPIRY');
      expect(classifyElement(cvv).semantic).toBe('CARD_CVV');
      expect(classifyElement(otp).semantic).toBe('OTP');

      expect(classifyElement(card).pii).toBe(true);
      expect(classifyElement(cvv).pii).toBe(true);
    });
  });

  describe('Action & Navigation Elements', () => {
    it('classifies buttons as SUBMIT and links as NAV', () => {
      const submit = makeRaw({ tagName: 'BUTTON', type: 'button', innerText: 'Complete Registration' });
      const link = makeRaw({ tagName: 'A', type: 'link', label: 'Login to account' });
      const searchBtn = makeRaw({ tagName: 'BUTTON', type: 'button', innerText: 'Search Catalog' });

      expect(classifyElement(submit).semantic).toBe('SUBMIT');
      expect(classifyElement(link).semantic).toBe('NAV');
      expect(classifyElement(searchBtn).semantic).toBe('SEARCH');
    });

    it('detects CAPTCHAs', () => {
      const captcha = makeRaw({ htmlId: 'g-recaptcha-response', domPath: 'div#recaptcha > input' });
      expect(classifyElement(captcha).semantic).toBe('CAPTCHA');
      expect(classifyElement(captcha).pii).toBe(false);
    });
  });

  describe('PII Semantic Types Set Integrity', () => {
    it('contains all required sensitive categories', () => {
      expect(PII_SEMANTIC_TYPES.has('EMAIL')).toBe(true);
      expect(PII_SEMANTIC_TYPES.has('PHONE')).toBe(true);
      expect(PII_SEMANTIC_TYPES.has('PASSWORD')).toBe(true);
      expect(PII_SEMANTIC_TYPES.has('CONFIRM_PASSWORD')).toBe(true);
      expect(PII_SEMANTIC_TYPES.has('AADHAAR')).toBe(true);
      expect(PII_SEMANTIC_TYPES.has('PAN')).toBe(true);
      expect(PII_SEMANTIC_TYPES.has('CARD_NUMBER')).toBe(true);
      expect(PII_SEMANTIC_TYPES.has('CARD_CVV')).toBe(true);

      // Non-PII elements
      expect(PII_SEMANTIC_TYPES.has('SUBMIT')).toBe(false);
      expect(PII_SEMANTIC_TYPES.has('NAV')).toBe(false);
      expect(PII_SEMANTIC_TYPES.has('SEARCH')).toBe(false);
      expect(PII_SEMANTIC_TYPES.has('CITY')).toBe(false);
    });
  });
});
