/**
 * transparency_panel.test.ts
 *
 * Phase 10: UI Transparency Panel & User Consent Tests.
 *
 * Verifies:
 *   1. ConsentModal rendering, form review table, and token status.
 *   2. User confirmation (Accept -> returns true, Execute proceeds).
 *   3. User cancellation (Reject -> returns false, Action rejected).
 *   4. Keyboard accessibility (Escape cancels).
 *   5. TransparencyController state tracking, action timeline, and privacy shield.
 *   6. InPageHUD floating dock mounting and state updates.
 *   7. Exit Criterion: No form is submitted without explicit user confirmation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsentModal } from '../src/ui/consent/consent_modal';
import { TransparencyController } from '../src/ui/panel/transparency_controller';
import { InPageHUD } from '../src/ui/hud/in_page_hud';
import { AgentLoop } from '../src/agent/agent_loop';
import { tokenStore } from '../src/profile/token_store';
import { userProfileStore } from '../src/profile/user_profile_store';
import type {
  AgentAction,
  UnifiedPageRepresentation,
  BackendToExtMessage,
} from '../src/shared/types';

describe('Phase 10: UI Transparency Panel & User Consent', () => {
  let modal: ConsentModal;
  let controller: TransparencyController;
  let hud: InPageHUD;

  beforeEach(async () => {
    modal = new ConsentModal();
    controller = new TransparencyController();
    hud = new InPageHUD();

    tokenStore.clear();
    await userProfileStore.clearProfile();

    document.body.innerHTML = `
      <div id="panel-container">
        <div id="bv-status-badge"></div>
        <div id="bv-step-counter"></div>
        <div id="bv-progress-bar-fill"></div>
        <div id="bv-current-goal"></div>
        <div id="bv-privacy-status"></div>
        <div id="bv-tokens-container"></div>
        <div id="bv-page-info"></div>
        <div id="bv-forms-count"></div>
        <div id="bv-elements-count"></div>
        <div id="bv-confidence-val"></div>
        <div id="bv-timeline-list"></div>
        <input id="bv-input-goal" />
        <button id="bv-btn-start-task"></button>
        <button id="bv-btn-abort-task"></button>
      </div>

      <form id="test-form">
        <label for="name-field">Full Name</label>
        <input id="name-field" name="fullname" value="Darshan Sharma" />

        <label for="email-field">Email</label>
        <input id="email-field" name="email" value="darshan@example.com" />

        <button id="submit-btn" type="submit">Submit Form</button>
      </form>
    `;
  });

  afterEach(() => {
    modal.cancel();
    hud.unmount();
    document.body.innerHTML = '';
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. ConsentModal & Form Review Table
  // ───────────────────────────────────────────────────────────────────────────

  describe('ConsentModal', () => {
    const mockUPR: UnifiedPageRepresentation = {
      page: { title: 'Test Form Page', url: 'https://test.com', snapshot_hash: 'h1', timestamp: 1 },
      elements: [
        {
          id: 'e1',
          tagName: 'INPUT',
          type: 'input',
          htmlId: 'name-field',
          htmlName: 'fullname',
          label: 'Full Name',
          value: 'SECRET_001',
          tokenized: 'SECRET_001',
          semantic: 'FULL_NAME',
          source: 'dom',
          confidence: 0.95,
          pii: true,
          visible: true,
          interactable: true,
          bbox: { x: 0, y: 0, width: 100, height: 30 },
          domPath: '#name-field',
          attributes: {},
        },
        {
          id: 'e2',
          tagName: 'INPUT',
          type: 'input',
          htmlId: 'email-field',
          htmlName: 'email',
          label: 'Email',
          value: 'darshan@example.com',
          semantic: 'EMAIL',
          source: 'dom',
          confidence: 0.9,
          pii: true,
          visible: true,
          interactable: true,
          bbox: { x: 0, y: 40, width: 100, height: 30 },
          domPath: '#email-field',
          attributes: {},
        },
        {
          id: 'e3',
          tagName: 'BUTTON',
          type: 'button',
          htmlId: 'submit-btn',
          label: 'Submit Form',
          semantic: 'SUBMIT',
          source: 'dom',
          confidence: 0.99,
          pii: false,
          visible: true,
          interactable: true,
          bbox: { x: 0, y: 80, width: 100, height: 30 },
          domPath: '#submit-btn',
          attributes: {},
        },
      ],
      forms: [
        {
          form_id: 'test-form',
          element_ids: ['e1', 'e2', 'e3'],
          semantic_purpose: 'REGISTRATION',
        },
      ],
      perception_source: ['dom'],
      overall_confidence: 0.95,
    };

    it('renders the consent dialog with form review items and warning', () => {
      const action: AgentAction = {
        action_id: 'act_sub',
        type: 'submit',
        element_id: 'e3',
        reason: 'Submit completed registration form',
      };

      modal.requestConsent(action, mockUPR);

      expect(modal.isShowing()).toBe(true);

      const dialog = document.querySelector('[data-testid="consent-dialog"]');
      expect(dialog).not.toBeNull();

      // Verify title & warning
      expect(dialog?.textContent).toContain('Confirm SUBMIT Action');
      expect(dialog?.textContent).toContain('Submit completed registration form');

      // Verify review table entries
      expect(dialog?.textContent).toContain('Full Name');
      expect(dialog?.textContent).toContain('Tokenized');
      expect(dialog?.textContent).toContain('Email');
    });

    it('resolves true when user clicks Confirm button', async () => {
      const action: AgentAction = {
        action_id: 'act_sub',
        type: 'submit',
        element_id: 'e3',
        reason: 'Submit form',
      };

      const consentPromise = modal.requestConsent(action, mockUPR);

      const confirmBtn = document.querySelector('[data-testid="consent-confirm-btn"]') as HTMLButtonElement;
      expect(confirmBtn).not.toBeNull();

      confirmBtn.click();

      const result = await consentPromise;
      expect(result).toBe(true);
      expect(modal.isShowing()).toBe(false);
      expect(document.querySelector('[data-testid="consent-dialog"]')).toBeNull();
    });

    it('resolves false when user clicks Cancel button', async () => {
      const action: AgentAction = {
        action_id: 'act_sub',
        type: 'submit',
        element_id: 'e3',
        reason: 'Submit form',
      };

      const consentPromise = modal.requestConsent(action, mockUPR);

      const cancelBtn = document.querySelector('[data-testid="consent-cancel-btn"]') as HTMLButtonElement;
      expect(cancelBtn).not.toBeNull();

      cancelBtn.click();

      const result = await consentPromise;
      expect(result).toBe(false);
      expect(modal.isShowing()).toBe(false);
      expect(document.querySelector('[data-testid="consent-dialog"]')).toBeNull();
    });

    it('resolves false when Escape key is pressed', async () => {
      const action: AgentAction = {
        action_id: 'act_nav',
        type: 'navigate',
        url: 'https://external-site.com',
        reason: 'Navigate to external partner',
      };

      const consentPromise = modal.requestConsent(action, mockUPR);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      const result = await consentPromise;
      expect(result).toBe(false);
      expect(modal.isShowing()).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. TransparencyController & Side Panel State
  // ───────────────────────────────────────────────────────────────────────────

  describe('TransparencyController', () => {
    it('binds to DOM and synchronizes loop state transitions', () => {
      const container = document.getElementById('panel-container')!;
      controller.attachUI(container);

      controller.setLoopState('PERCEIVING', 2);
      expect(container.querySelector('#bv-status-badge')?.textContent).toBe('PERCEIVING');
      expect(container.querySelector('#bv-step-counter')?.textContent).toBe('Step 2 / 20');

      controller.setLoopState('EXECUTING', 4);
      expect(container.querySelector('#bv-status-badge')?.textContent).toBe('EXECUTING');
      expect(container.querySelector('#bv-progress-bar-fill')?.getAttribute('style')).toContain('width: 20%');
    });

    it('updates privacy shield and active tokens', () => {
      const container = document.getElementById('panel-container')!;
      controller.attachUI(container);

      controller.updatePrivacyMetrics(true, [
        { token: 'SECRET_001', semantic: 'FULL_NAME' },
        { token: 'SECRET_002', semantic: 'EMAIL' },
      ]);

      const shieldEl = container.querySelector('#bv-privacy-status');
      expect(shieldEl?.textContent).toContain('Zero Raw PII Leaked');
      expect(shieldEl?.textContent).toContain('PASS');

      const tokensEl = container.querySelector('#bv-tokens-container');
      expect(tokensEl?.textContent).toContain('SECRET_001');
      expect(tokensEl?.textContent).toContain('SECRET_002');
    });

    it('logs action timeline items with badges and status', () => {
      const container = document.getElementById('panel-container')!;
      controller.attachUI(container);

      const action: AgentAction = {
        action_id: 'act_1',
        type: 'fill',
        element_id: 'name-field',
        value: 'SECRET_001',
        reason: 'Filling name with secret token',
      };

      controller.logAction(action, { action_id: 'act_1', success: true }, 'success');

      const timelineEl = container.querySelector('#bv-timeline-list');
      expect(timelineEl?.textContent).toContain('FILL');
      expect(timelineEl?.textContent).toContain('Filling name with secret token');
      expect(timelineEl?.textContent).toContain('name-field');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. In-Page HUD Floating Dock
  // ───────────────────────────────────────────────────────────────────────────

  describe('InPageHUD', () => {
    it('mounts, updates state, and unmounts cleanly', () => {
      hud.mount();
      expect(hud.isVisible()).toBe(true);

      const dock = document.querySelector('[data-testid="in-page-hud"]');
      expect(dock).not.toBeNull();
      expect(dock?.textContent).toContain('IDLE');

      hud.updateState('EXECUTING', 3);
      expect(dock?.textContent).toContain('EXECUTING');
      expect(dock?.textContent).toContain('Step 3');

      hud.unmount();
      expect(hud.isVisible()).toBe(false);
      expect(document.querySelector('[data-testid="in-page-hud"]')).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Exit Criterion: No Form Submitted Without Explicit User Confirmation
  // ───────────────────────────────────────────────────────────────────────────

  describe('Exit Criterion: Consent Gate Integration', () => {
    it('blocks and rejects submit action when user denies confirmation', async () => {
      const loop = new AgentLoop();
      let formSubmitted = false;

      // Track submit event on the actual HTML form
      const form = document.getElementById('test-form') as HTMLFormElement;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        formSubmitted = true;
      });

      // Planner that directly requests a submit action
      const submitPlanner = async (): Promise<BackendToExtMessage> => {
        return {
          session_id: 'consent_test',
          message_type: 'action',
          step: 1,
          actions: [
            {
              action_id: 'sub_1',
              type: 'submit',
              element_id: 'submit-btn',
              reason: 'Attempting to submit form',
            },
          ],
          done: false,
        };
      };

      // Mock confirmationProvider that simulates user clicking "Cancel"
      const rejectConfirmation = vi.fn().mockResolvedValue(false);

      const summary = await loop.startTask('Submit form with rejection', {
        maxSteps: 1,
        planProvider: submitPlanner,
        confirmationProvider: rejectConfirmation,
      });

      expect(rejectConfirmation).toHaveBeenCalledTimes(1);
      // Action was rejected due to lack of confirmation
      expect(summary.actionsExecuted).toBe(0);
      expect(formSubmitted).toBe(false);
    });

    it('allows submit execution only after explicit user confirmation', async () => {
      const loop = new AgentLoop();

      // Planner that requests submit action
      const submitPlanner = async (upr: UnifiedPageRepresentation, step: number): Promise<BackendToExtMessage> => {
        if (step === 1) {
          const btn = upr.elements.find((e) => e.htmlId === 'submit-btn' || e.type === 'button');
          return {
            session_id: 'consent_confirm_test',
            message_type: 'action',
            step: 1,
            actions: [
              {
                action_id: 'sub_1',
                type: 'submit',
                element_id: btn?.id || 'submit-btn',
                reason: 'Submitting form with user approval',
              },
            ],
            done: false,
          };
        }
        return {
          session_id: 'consent_confirm_test',
          message_type: 'done',
          step: 2,
          actions: [],
          done: true,
        };
      };

      // Mock confirmationProvider simulating user clicking "Confirm"
      const approveConfirmation = vi.fn().mockResolvedValue(true);

      const summary = await loop.startTask('Submit form with approval', {
        maxSteps: 2,
        planProvider: submitPlanner,
        confirmationProvider: approveConfirmation,
      });

      expect(approveConfirmation).toHaveBeenCalledTimes(1);
      expect(summary.actionsExecuted).toBe(1);
      expect(summary.success).toBe(true);
    });
  });
});
