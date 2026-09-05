import { describe, it, expect, beforeEach } from 'vitest';
import { executeAction } from '../src/agent/action_executor';
import { tokenStore } from '../src/profile/token_store';
import { userProfileStore } from '../src/profile/user_profile_store';
import type { AgentAction, UnifiedPageRepresentation, UPRElement } from '../src/shared/types';

function makeUPRElement(overrides: Partial<UPRElement>): UPRElement {
  return {
    id: 'e1',
    tagName: 'INPUT',
    type: 'input',
    label: 'Email',
    semantic: 'EMAIL',
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

function makeUPR(elements: UPRElement[]): UnifiedPageRepresentation {
  return {
    page: { title: 'Test', url: 'https://example.com', snapshot_hash: 'sha256:123', timestamp: 123 },
    elements,
    forms: [],
    perception_source: ['dom'],
    overall_confidence: 0.9,
  };
}

describe('Phase 5: Action Executor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    tokenStore.clear();
    userProfileStore.clearProfile();
  });

  describe('Form Filling & Synthetic Event Dispatching', () => {
    it('fills plain text input and fires input and change events', async () => {
      document.body.innerHTML = `
        <form>
          <input id="username-field" type="text" />
        </form>
      `;
      const input = document.getElementById('username-field') as HTMLInputElement;

      let inputFired = false;
      let changeFired = false;
      input.addEventListener('input', () => { inputFired = true; });
      input.addEventListener('change', () => { changeFired = true; });

      const upr = makeUPR([
        makeUPRElement({ id: 'e1', htmlId: 'username-field', semantic: 'USERNAME', pii: false }),
      ]);

      const action: AgentAction = {
        action_id: 'act_001',
        type: 'fill',
        element_id: 'e1',
        value: 'darsh_dev',
      };

      const res = await executeAction(action, upr);

      expect(res.success).toBe(true);
      expect(input.value).toBe('darsh_dev');
      expect(inputFired).toBe(true);
      expect(changeFired).toBe(true);
    });

    it('resolves SECRET_xxx token and fills actual PII value into the DOM', async () => {
      document.body.innerHTML = `
        <form>
          <input id="email-field" type="email" />
        </form>
      `;
      const input = document.getElementById('email-field') as HTMLInputElement;

      // Tokenize the user's real email
      const realEmail = 'real.user@example.com';
      const token = tokenStore.generate(realEmail);

      const upr = makeUPR([
        makeUPRElement({ id: 'e2', htmlId: 'email-field', semantic: 'EMAIL', pii: true }),
      ]);

      const action: AgentAction = {
        action_id: 'act_002',
        type: 'fill',
        element_id: 'e2',
        value: token, // Server sends ONLY the token!
      };

      const res = await executeAction(action, upr);

      expect(res.success).toBe(true);
      // DOM contains the real value, NOT the token!
      expect(input.value).toBe(realEmail);
    });

    it('fills password field directly from UserProfileStore without server token', async () => {
      document.body.innerHTML = `
        <form>
          <input id="pwd-field" type="password" />
        </form>
      `;
      const input = document.getElementById('pwd-field') as HTMLInputElement;

      // Configure user's password locally
      userProfileStore.setInMemoryProfile({
        passwords: {
          default: 'Direct_Secret_P@ssword_99!',
        },
      });

      const upr = makeUPR([
        makeUPRElement({ id: 'e3', htmlId: 'pwd-field', htmlType: 'password', semantic: 'PASSWORD', pii: true }),
      ]);

      const action: AgentAction = {
        action_id: 'act_003',
        type: 'fill',
        element_id: 'e3',
        // Note: No value sent from server for passwords!
      };

      const res = await executeAction(action, upr);

      expect(res.success).toBe(true);
      expect(input.value).toBe('Direct_Secret_P@ssword_99!');
    });
  });

  describe('Click & Select Actions', () => {
    it('clicks button and triggers click event handler', async () => {
      document.body.innerHTML = `
        <button id="reg-btn" type="button">Register</button>
      `;
      const btn = document.getElementById('reg-btn') as HTMLButtonElement;

      let clicked = false;
      btn.addEventListener('click', () => { clicked = true; });

      // Mock scrollIntoView for test environment
      btn.scrollIntoView = () => {};

      const upr = makeUPR([
        makeUPRElement({ id: 'btn_1', htmlId: 'reg-btn', type: 'button', semantic: 'SUBMIT' }),
      ]);

      const action: AgentAction = {
        action_id: 'act_004',
        type: 'click',
        element_id: 'btn_1',
      };

      const res = await executeAction(action, upr);

      expect(res.success).toBe(true);
      expect(clicked).toBe(true);
    });

    it('selects option in dropdown by value or text', async () => {
      document.body.innerHTML = `
        <select id="country-select">
          <option value="">Choose</option>
          <option value="IN">India</option>
          <option value="US">United States</option>
        </select>
      `;
      const select = document.getElementById('country-select') as HTMLSelectElement;

      let changeFired = false;
      select.addEventListener('change', () => { changeFired = true; });

      const upr = makeUPR([
        makeUPRElement({ id: 'sel_1', htmlId: 'country-select', type: 'select', semantic: 'COUNTRY' }),
      ]);

      const action: AgentAction = {
        action_id: 'act_005',
        type: 'select',
        element_id: 'sel_1',
        value: 'India',
      };

      const res = await executeAction(action, upr);

      expect(res.success).toBe(true);
      expect(select.value).toBe('IN');
      expect(changeFired).toBe(true);
    });
  });

  describe('Non-DOM Actions (Wait, Scroll)', () => {
    it('executes wait action successfully', async () => {
      const action: AgentAction = { action_id: 'w1', type: 'wait', duration_ms: 10 };
      const res = await executeAction(action, makeUPR([]));
      expect(res.success).toBe(true);
    });
  });
});
