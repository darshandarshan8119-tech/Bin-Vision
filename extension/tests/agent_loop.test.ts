/**
 * agent_loop.test.ts
 *
 * Phase 9: Full Autonomous Agent Loop & SPA Support Tests.
 *
 * Verifies:
 *   1. PageStateCache hashing and cache hit/miss behavior.
 *   2. DOMMutationWatcher observation and debounce settling.
 *   3. AgentLoop multi-step form completion (Observe -> Perceive -> Sanitize -> Reason -> Validate -> Execute -> Observe).
 *   4. Circuit breaker protection on maximum task steps.
 *   5. Clean abort handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PageStateCache } from '../src/perception/page_state_cache';
import { DOMMutationWatcher } from '../src/perception/mutation_observer';
import { AgentLoop } from '../src/agent/agent_loop';
import { tokenStore } from '../src/profile/token_store';
import { userProfileStore } from '../src/profile/user_profile_store';
import type { BackendToExtMessage, UnifiedPageRepresentation } from '../src/shared/types';

describe('Phase 9: Full Agent Loop & SPA Support', () => {
  let cache: PageStateCache;
  let watcher: DOMMutationWatcher;
  let loop: AgentLoop;

  beforeEach(async () => {
    cache = new PageStateCache();
    watcher = new DOMMutationWatcher(50); // fast 50ms debounce for tests
    loop = new AgentLoop();

    tokenStore.clear();
    await userProfileStore.clearProfile();

    // Set up dummy profile
    userProfileStore.setInMemoryProfile({
      fullName: 'Darshan Sharma',
      email: 'darshan@example.com',
      phone: '+919876543210',
      country: 'India',
    });

    document.body.innerHTML = `
      <form id="reg-form">
        <label for="fullname">Full Name</label>
        <input id="fullname" type="text" name="fullname" />

        <label for="email">Email</label>
        <input id="email" type="email" name="email" />

        <label for="country">Country</label>
        <select id="country" name="country">
          <option value="">Choose...</option>
          <option value="India">India</option>
          <option value="USA">USA</option>
        </select>

        <button id="btn-submit" type="submit">Submit Registration</button>
      </form>
    `;
  });

  afterEach(() => {
    watcher.stop();
    loop.abort();
    cache.clear();
    document.body.innerHTML = '';
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Page State Cache
  // ───────────────────────────────────────────────────────────────────────────

  describe('PageStateCache', () => {
    it('computes consistent hashes and detects state changes', async () => {
      const hash1 = await cache.computeHash(document.body);
      expect(hash1).toMatch(/^sha256:/);

      const hash2 = await cache.computeHash(document.body);
      expect(hash1).toBe(hash2);

      // Modify DOM
      const nameInput = document.getElementById('fullname') as HTMLInputElement;
      nameInput.value = 'John Doe';

      const hash3 = await cache.computeHash(document.body);
      expect(cache.hasChanged(hash3)).toBe(true);
    });

    it('caches and returns UnifiedPageRepresentation objects', () => {
      const mockUPR = {
        page: { title: 'Test', url: 'https://test.com', snapshot_hash: '123', timestamp: 1 },
        elements: [],
        forms: [],
        perception_source: ['dom'] as any,
        overall_confidence: 1.0,
      };

      cache.set('hash_abc', mockUPR);
      expect(cache.get('hash_abc')).toBe(mockUPR);
      expect(cache.get('hash_unknown')).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. DOM Mutation Watcher
  // ───────────────────────────────────────────────────────────────────────────

  describe('DOMMutationWatcher', () => {
    it('starts, triggers changes, and resolves waitForNextChange', async () => {
      const callback = vi.fn();
      watcher.start(document.body, callback);
      expect(watcher.isObserving).toBe(true);

      const waitPromise = watcher.waitForNextChange(200);

      // Synthetic DOM mutation
      const newDiv = document.createElement('div');
      newDiv.textContent = 'Dynamic update';
      document.body.appendChild(newDiv);

      watcher.triggerChange();

      const changed = await waitPromise;
      expect(changed).toBe(true);
      expect(callback).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Multi-Step Autonomous Agent Loop Execution
  // ───────────────────────────────────────────────────────────────────────────

  describe('AgentLoop Execution', () => {
    it('completes a 5-step form filling and submission task on SPA page', async () => {
      const executedActionTypes: string[] = [];

      /**
       * Step-by-step plan mock simulating backend reasoning.
       * Uses element IDs from the live UPR directly — no semantic label assumptions —
       * so the test is robust regardless of classifier label variations.
       */
      const mockPlanProvider = async (
        upr: UnifiedPageRepresentation,
        step: number
      ): Promise<BackendToExtMessage> => {
        // Find elements by their HTML attributes for robust matching
        const inputElements = upr.elements.filter(e => e.type === 'input');
        const selectEl = upr.elements.find(e => e.type === 'select');
        const submitEl = upr.elements.find(e => e.type === 'button' || e.semantic === 'SUBMIT');

        // Step 1: Fill Name (first text input)
        if (step === 1) {
          const nameEl = inputElements.find(e => e.htmlName === 'fullname' || e.htmlId === 'fullname');
          if (!nameEl) throw new Error('Name element not found in UPR. Elements: ' + JSON.stringify(upr.elements.map(e => ({ id: e.id, type: e.type, htmlName: e.htmlName, htmlId: e.htmlId, semantic: e.semantic }))));
          return {
            session_id: 'test_sess',
            message_type: 'action',
            step: 1,
            actions: [
              {
                action_id: 'act_1',
                type: 'fill',
                element_id: nameEl.id,
                value: nameEl.tokenized ?? 'Darshan Sharma',
                reason: 'Fill name field with token',
              },
            ],
            reasoning: 'Filling name',
            done: false,
          };
        }

        // Step 2: Fill Email
        if (step === 2) {
          const emailEl = inputElements.find(e => e.htmlName === 'email' || e.htmlId === 'email' || e.htmlType === 'email');
          if (!emailEl) throw new Error('Email element not found in UPR');
          return {
            session_id: 'test_sess',
            message_type: 'action',
            step: 2,
            actions: [
              {
                action_id: 'act_2',
                type: 'fill',
                element_id: emailEl.id,
                value: emailEl.tokenized ?? 'darshan@example.com',
                reason: 'Fill email field with token',
              },
            ],
            reasoning: 'Filling email',
            done: false,
          };
        }

        // Step 3: Select Country
        if (step === 3) {
          if (!selectEl) throw new Error('Select element not found in UPR');
          return {
            session_id: 'test_sess',
            message_type: 'action',
            step: 3,
            actions: [
              {
                action_id: 'act_3',
                type: 'select',
                element_id: selectEl.id,
                value: 'India',
                reason: 'Select country option',
              },
            ],
            reasoning: 'Selecting country',
            done: false,
          };
        }

        // Step 4: Click Submit
        if (step === 4) {
          if (!submitEl) throw new Error('Submit button not found in UPR');
          return {
            session_id: 'test_sess',
            message_type: 'action',
            step: 4,
            actions: [
              {
                action_id: 'act_4',
                type: 'click',
                element_id: submitEl.id,
                reason: 'Click submit button',
              },
            ],
            reasoning: 'Submitting form',
            done: false,
          };
        }

        // Step 5: Done
        return {
          session_id: 'test_sess',
          message_type: 'done',
          step: 5,
          actions: [],
          reasoning: 'All registration steps completed successfully',
          done: true,
        };
      };

      const summary = await loop.startTask('Complete registration form', {
        maxSteps: 10,
        planProvider: mockPlanProvider,
        onActionComplete: (action, res) => {
          executedActionTypes.push(action.type);
          // Individual actions might fail (e.g. submit blocked by jsdom) — only check types
        },
      });

      expect(summary.success).toBe(true);
      expect(summary.stepsCompleted).toBe(5);
      expect(summary.actionsExecuted).toBe(4);
      expect(executedActionTypes).toEqual(['fill', 'fill', 'select', 'click']);

      // Check DOM final state — text inputs and select should be updated
      const nameInput = document.getElementById('fullname') as HTMLInputElement;
      const emailInput = document.getElementById('email') as HTMLInputElement;
      const countrySelect = document.getElementById('country') as HTMLSelectElement;

      expect(nameInput.value).toBe('Darshan Sharma');
      expect(emailInput.value).toBe('darshan@example.com');
      expect(countrySelect.value).toBe('India');
    });

    it('trips circuit breaker when task exceeds max steps budget', async () => {
      // Endless plan provider
      const infinitePlanner = async (upr: UnifiedPageRepresentation, step: number): Promise<BackendToExtMessage> => {
        return {
          session_id: 'loop_sess',
          message_type: 'action',
          step,
          actions: [
            {
              action_id: `act_${step}`,
              type: 'wait',
              duration_ms: 10,
              reason: 'Waiting',
            },
          ],
          done: false,
        };
      };

      const summary = await loop.startTask('Infinite loop test', {
        maxSteps: 3,
        planProvider: infinitePlanner,
      });

      expect(summary.success).toBe(false);
      expect(summary.stepsCompleted).toBe(3);
      expect(summary.error).toContain('circuit breaker');
    });

    it('aborts task cleanly on abort() call', async () => {
      const slowPlanner = async (upr: UnifiedPageRepresentation, step: number): Promise<BackendToExtMessage> => {
        loop.abort(); // trigger abort inside step
        return {
          session_id: 'abort_sess',
          message_type: 'action',
          step,
          actions: [{ action_id: 'a1', type: 'wait', duration_ms: 10 }],
          done: false,
        };
      };

      const summary = await loop.startTask('Abort test', {
        maxSteps: 5,
        planProvider: slowPlanner,
      });

      expect(summary.success).toBe(false);
      expect(loop.getState()).toBe('ABORTED');
    });
  });
});
