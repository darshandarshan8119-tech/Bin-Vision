import { describe, it, expect, beforeEach } from 'vitest';
import { validateAction } from '../src/agent/action_validator';
import { tokenStore } from '../src/profile/token_store';
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

describe('Phase 5: Action Validator', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  describe('Action Type Allowlist & Confirmation Checks', () => {
    it('approves standard allowed action types', () => {
      const upr = makeUPR([makeUPRElement({ id: 'e1' })]);

      const fillAction: AgentAction = { action_id: 'a1', type: 'fill', element_id: 'e1', value: 'hello' };
      const waitAction: AgentAction = { action_id: 'a2', type: 'wait', duration_ms: 500 };
      const scrollAction: AgentAction = { action_id: 'a3', type: 'scroll', direction: 'down' };

      expect(validateAction(fillAction, { upr }).valid).toBe(true);
      expect(validateAction(waitAction, { upr }).valid).toBe(true);
      expect(validateAction(scrollAction, { upr }).valid).toBe(true);
    });

    it('rejects disallowed or malicious action types', () => {
      const upr = makeUPR([]);
      const badAction: any = { action_id: 'b1', type: 'run_arbitrary_js' };

      const res = validateAction(badAction, { upr });
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('ACTION_TYPE_NOT_ALLOWED');
    });

    it('rejects submit or navigate actions without explicit user confirmation', () => {
      const upr = makeUPR([makeUPRElement({ id: 'btn_sub', type: 'button' })]);
      const submitAction: AgentAction = { action_id: 's1', type: 'submit', element_id: 'btn_sub' };
      const navAction: AgentAction = { action_id: 'n1', type: 'navigate', url: 'https://example.com' };

      // Without confirmation -> REJECTED
      const resSubmit = validateAction(submitAction, { upr, userConfirmed: false });
      expect(resSubmit.valid).toBe(false);
      expect(resSubmit.reason).toBe('REQUIRES_USER_CONFIRMATION');

      const resNav = validateAction(navAction, { upr, userConfirmed: false });
      expect(resNav.valid).toBe(false);
      expect(resNav.reason).toBe('REQUIRES_USER_CONFIRMATION');

      // With confirmation -> APPROVED
      expect(validateAction(submitAction, { upr, userConfirmed: true }).valid).toBe(true);
      expect(validateAction(navAction, { upr, userConfirmed: true }).valid).toBe(true);
    });
  });

  describe('Target Element Checks (Visibility, Interactability, Existence)', () => {
    it('rejects action if element_id does not exist in UPR', () => {
      const upr = makeUPR([makeUPRElement({ id: 'e1' })]);
      const action: AgentAction = { action_id: 'a1', type: 'click', element_id: 'e999' };

      const res = validateAction(action, { upr });
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('ELEMENT_NOT_FOUND');
    });

    it('rejects action if target element is hidden (visible: false)', () => {
      const upr = makeUPR([makeUPRElement({ id: 'e_hidden', visible: false })]);
      const action: AgentAction = { action_id: 'a1', type: 'fill', element_id: 'e_hidden', value: 'test' };

      const res = validateAction(action, { upr });
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('ELEMENT_NOT_VISIBLE');
    });

    it('rejects action if target element is disabled (interactable: false)', () => {
      const upr = makeUPR([makeUPRElement({ id: 'e_disabled', interactable: false })]);
      const action: AgentAction = { action_id: 'a1', type: 'click', element_id: 'e_disabled' };

      const res = validateAction(action, { upr });
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('ELEMENT_NOT_INTERACTABLE');
    });

    it('rejects fill on a button element', () => {
      const upr = makeUPR([makeUPRElement({ id: 'e_btn', type: 'button' })]);
      const action: AgentAction = { action_id: 'a1', type: 'fill', element_id: 'e_btn', value: 'invalid' };

      const res = validateAction(action, { upr });
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('ACTION_TYPE_NOT_ALLOWED');
    });
  });

  describe('Secret Token Validation', () => {
    it('approves action when SECRET_xxx token exists in TokenStore', () => {
      const token = tokenStore.generate('Real Phone Value');
      const upr = makeUPR([makeUPRElement({ id: 'e1' })]);
      const action: AgentAction = { action_id: 'a1', type: 'fill', element_id: 'e1', value: token };

      const res = validateAction(action, { upr });
      expect(res.valid).toBe(true);
    });

    it('rejects action when SECRET_xxx token does NOT exist in TokenStore', () => {
      const upr = makeUPR([makeUPRElement({ id: 'e1' })]);
      const action: AgentAction = { action_id: 'a1', type: 'fill', element_id: 'e1', value: 'SECRET_999_EXPIRED' };

      const res = validateAction(action, { upr });
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('TOKEN_NOT_FOUND');
    });
  });
});
