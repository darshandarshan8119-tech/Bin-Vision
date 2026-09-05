import { describe, it, expect, beforeEach } from 'vitest';
import { detectForms, detectFormPurpose } from '../src/perception/form_detector';
import type { UPRElement } from '../src/shared/types';

function makeUPRElement(overrides: Partial<UPRElement>): UPRElement {
  return {
    id: 'e1',
    tagName: 'INPUT',
    type: 'input',
    label: '',
    semantic: 'OTHER',
    source: 'dom',
    confidence: 0.8,
    pii: false,
    bbox: [0, 0, 100, 30],
    visible: true,
    interactable: true,
    domPath: 'form > input',
    attributes: {},
    ...overrides,
  };
}

describe('Phase 2: Form Detector', () => {
  describe('Semantic Purpose Detection', () => {
    it('detects REGISTRATION purpose when password and confirm password are present', () => {
      const elements: UPRElement[] = [
        makeUPRElement({ semantic: 'EMAIL', label: 'Email' }),
        makeUPRElement({ semantic: 'PASSWORD', label: 'Password' }),
        makeUPRElement({ semantic: 'CONFIRM_PASSWORD', label: 'Confirm Password' }),
        makeUPRElement({ semantic: 'SUBMIT', label: 'Register', innerText: 'Register' }),
      ];
      expect(detectFormPurpose(elements)).toBe('REGISTRATION');
    });

    it('detects REGISTRATION purpose when password and first/last name are present', () => {
      const elements: UPRElement[] = [
        makeUPRElement({ semantic: 'FIRST_NAME', label: 'First Name' }),
        makeUPRElement({ semantic: 'LAST_NAME', label: 'Last Name' }),
        makeUPRElement({ semantic: 'EMAIL', label: 'Email' }),
        makeUPRElement({ semantic: 'PASSWORD', label: 'Password' }),
        makeUPRElement({ semantic: 'SUBMIT', label: 'Sign Up', innerText: 'Sign Up' }),
      ];
      expect(detectFormPurpose(elements)).toBe('REGISTRATION');
    });

    it('detects LOGIN purpose when only identifier and password exist', () => {
      const elements: UPRElement[] = [
        makeUPRElement({ semantic: 'EMAIL', label: 'Email' }),
        makeUPRElement({ semantic: 'PASSWORD', label: 'Password' }),
        makeUPRElement({ semantic: 'SUBMIT', label: 'Login', innerText: 'Login' }),
      ];
      expect(detectFormPurpose(elements)).toBe('LOGIN');
    });

    it('detects PAYMENT purpose when card fields are present', () => {
      const elements: UPRElement[] = [
        makeUPRElement({ semantic: 'CARD_NUMBER', label: 'Card Number' }),
        makeUPRElement({ semantic: 'CARD_EXPIRY', label: 'Expiry' }),
        makeUPRElement({ semantic: 'CARD_CVV', label: 'CVV' }),
        makeUPRElement({ semantic: 'SUBMIT', label: 'Pay Now', innerText: 'Pay Now' }),
      ];
      expect(detectFormPurpose(elements)).toBe('PAYMENT');
    });

    it('detects SEARCH purpose', () => {
      const elements: UPRElement[] = [
        makeUPRElement({ semantic: 'SEARCH', label: 'Search' }),
        makeUPRElement({ semantic: 'SUBMIT', label: 'Go', innerText: 'Search' }),
      ];
      expect(detectFormPurpose(elements)).toBe('SEARCH');
    });
  });

  describe('DOM-based Form Grouping', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('groups elements inside HTML <form> elements with action and method', () => {
      document.body.innerHTML = `
        <form id="signup-form" action="/api/register" method="POST">
          <input id="u_name" type="text" />
          <input id="u_email" type="email" />
          <button id="u_sub" type="submit">Sign Up</button>
        </form>
      `;

      const elements: UPRElement[] = [
        makeUPRElement({ id: 'e1', htmlId: 'u_name', semantic: 'NAME', domPath: 'form#signup-form > input#u_name' }),
        makeUPRElement({ id: 'e2', htmlId: 'u_email', semantic: 'EMAIL', domPath: 'form#signup-form > input#u_email' }),
        makeUPRElement({ id: 'e3', htmlId: 'u_sub', type: 'button', semantic: 'SUBMIT', innerText: 'Sign Up', domPath: 'form#signup-form > button#u_sub' }),
      ];

      const forms = detectForms(elements);
      expect(forms.length).toBe(1);
      expect(forms[0].form_id).toBe('signup-form');
      expect(forms[0].action).toBe('/api/register');
      expect(forms[0].method).toBe('POST');
      expect(forms[0].element_ids).toEqual(['e1', 'e2', 'e3']);
    });

    it('creates virtual form for orphan SPA inputs', () => {
      document.body.innerHTML = `
        <div class="modal-card">
          <input id="field1" type="text" />
          <input id="field2" type="password" />
          <button id="btn1" type="button">Login</button>
        </div>
      `;

      const elements: UPRElement[] = [
        makeUPRElement({ id: 'e1', htmlId: 'field1', semantic: 'USERNAME' }),
        makeUPRElement({ id: 'e2', htmlId: 'field2', semantic: 'PASSWORD' }),
        makeUPRElement({ id: 'e3', htmlId: 'btn1', type: 'button', semantic: 'SUBMIT', innerText: 'Login' }),
      ];

      const forms = detectForms(elements);
      expect(forms.length).toBe(1);
      expect(forms[0].form_id).toContain('virtual');
      expect(forms[0].semantic_purpose).toBe('LOGIN');
    });
  });
});
