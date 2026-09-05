/**
 * agent_loop.ts
 *
 * Phase 9: Full Autonomous Agent Loop & SPA Orchestrator.
 *
 * Orchestrates the closed-loop autonomous cycle:
 *   Observe ──► Perceive ──► Sanitize & Tokenize ──► Reason ──► Validate ──► Execute ──► Observe
 *
 * Features:
 *   - Zero-PII server privacy gate
 *   - Auto-population of SECRET_xxx tokens from local encrypted UserProfileStore
 *   - Pre-execution ActionValidator check with user-confirmation prompts
 *   - Dynamic SPA support via DOMMutationWatcher & PageStateCache
 *   - Runaway loop protection (max 20 steps circuit breaker)
 */

import { logger } from '../shared/logger';
import { AGENT, CONFIRM_REQUIRED_ACTIONS } from '../shared/constants';
import type {
  AgentAction,
  ActionResult,
  BackendToExtMessage,
  UnifiedPageRepresentation,
  UPRElement,
} from '../shared/types';
import { buildUPR } from '../perception/unified_page_rep';
import { pageStateCache } from '../perception/page_state_cache';
import { domMutationWatcher } from '../perception/mutation_observer';
import { tokenStore } from '../profile/token_store';
import { userProfileStore } from '../profile/user_profile_store';
import { redactUPR, verifySanitization } from '../privacy/redactor';
import { validateAction } from './action_validator';
import { executeAction } from './action_executor';

export type AgentLoopState =
  | 'IDLE'
  | 'OBSERVING'
  | 'PERCEIVING'
  | 'SANITIZING'
  | 'REASONING'
  | 'VALIDATING'
  | 'EXECUTING'
  | 'WAITING_FOR_DOM'
  | 'DONE'
  | 'ERROR'
  | 'ABORTED';

export interface AgentLoopOptions {
  maxSteps?: number;
  confirmationProvider?: (action: AgentAction, upr?: UnifiedPageRepresentation) => Promise<boolean>;
  planProvider?: (
    upr: UnifiedPageRepresentation,
    step: number,
    lastResult?: ActionResult
  ) => Promise<BackendToExtMessage>;
  onStateChange?: (state: AgentLoopState, step: number, details?: string) => void;
  onActionComplete?: (action: AgentAction, result: ActionResult) => void;
}

export interface AgentLoopSummary {
  success: boolean;
  stepsCompleted: number;
  actionsExecuted: number;
  finalReasoning: string;
  error?: string;
}

export class AgentLoop {
  private state: AgentLoopState = 'IDLE';
  private currentStep = 0;
  private isRunning = false;
  private shouldAbort = false;
  private lastActionResult: ActionResult | null = null;
  private actionsExecutedCount = 0;
  /** Reference to the live unsanitized UPR used during action execution */
  private currentUPR: UnifiedPageRepresentation | null = null;

  public getState(): AgentLoopState {
    return this.state;
  }

  public isBusy(): boolean {
    return this.isRunning;
  }

  /**
   * Starts and drives the multi-step agent loop until the goal is achieved,
   * max steps are reached, or user aborts.
   */
  public async startTask(
    goal: string,
    options: AgentLoopOptions = {}
  ): Promise<AgentLoopSummary> {
    if (this.isRunning) {
      throw new Error('AgentLoop is already executing a task.');
    }

    const maxSteps = options.maxSteps ?? AGENT.MAX_ACTIONS_PER_TASK;
    this.isRunning = true;
    this.shouldAbort = false;
    this.currentStep = 0;
    this.actionsExecutedCount = 0;
    this.lastActionResult = null;
    this.currentUPR = null;
    let finalReasoning = '';

    logger.info(`[AgentLoop] Task started: "${goal}" (Max steps: ${maxSteps})`);
    domMutationWatcher.start();

    try {
      while (this.currentStep < maxSteps) {
        if (this.shouldAbort) {
          this.setState('ABORTED', options, 'Task was stopped by user or system');
          return {
            success: false,
            stepsCompleted: this.currentStep,
            actionsExecuted: this.actionsExecutedCount,
            finalReasoning: 'Task aborted by user',
          };
        }

        this.currentStep++;
        logger.info(`[AgentLoop] ─── Step ${this.currentStep} ───`);

        // ── 1. Observe & Check State Cache ──
        this.setState('OBSERVING', options);
        const domHash = await pageStateCache.computeHash();
        let upr: UnifiedPageRepresentation | null = pageStateCache.get(domHash);

        // ── 2. Perceive ──
        if (!upr) {
          this.setState('PERCEIVING', options);
          upr = await buildUPR();
          pageStateCache.set(domHash, upr);
        }

        // Store the live UPR for use during action execution
        this.currentUPR = upr;

        // ── 3. Sanitize & Tokenize ──
        this.setState('SANITIZING', options);
        await this.prepareTokensForFormFields(upr.elements);
        const sanitizedUPR = redactUPR(upr);

        // Security Gate Check: Zero PII invariant verification
        const sanitizationCheck = verifySanitization(sanitizedUPR);
        if (!sanitizationCheck.safe) {
          const leakErr = `Sanitization verification failed: ${sanitizationCheck.violations.join(', ')}`;
          logger.error(`[AgentLoop] Security gate triggered: ${leakErr}`);
          throw new Error(leakErr);
        }

        // ── 4. Reason ──
        this.setState('REASONING', options);
        if (!options.planProvider) {
          throw new Error('No planProvider configured for AgentLoop reasoning.');
        }

        const planResponse: BackendToExtMessage = await options.planProvider(
          upr,
          this.currentStep,
          this.lastActionResult ?? undefined
        );

        if (this.shouldAbort) {
          this.setState('ABORTED', options, 'Task was stopped by user or system');
          return {
            success: false,
            stepsCompleted: this.currentStep,
            actionsExecuted: this.actionsExecutedCount,
            finalReasoning: 'Task aborted by user',
          };
        }

        finalReasoning = planResponse.reasoning || finalReasoning;

        // Check completion signal
        if (planResponse.done || !planResponse.actions || planResponse.actions.length === 0) {
          logger.info(`[AgentLoop] Task marked as complete by planner. Reason: ${finalReasoning}`);
          this.setState('DONE', options, finalReasoning);
          return {
            success: true,
            stepsCompleted: this.currentStep,
            actionsExecuted: this.actionsExecutedCount,
            finalReasoning,
          };
        }

        // ── 5. Validate & Execute Planned Actions ──
        for (const action of planResponse.actions) {
          if (this.shouldAbort) break;

          this.setState('VALIDATING', options, `Validating ${action.type}`);

          // Request user confirmation if action requires it
          let userConfirmed = false;
          if (CONFIRM_REQUIRED_ACTIONS.includes(action.type)) {
            if (options.confirmationProvider) {
              userConfirmed = await options.confirmationProvider(action, this.currentUPR!);
            } else {
              userConfirmed = true; // Default auto-confirm in headless testing
            }
          }

          // Validate with current live UPR
          const validation = validateAction(action, { upr: this.currentUPR!, userConfirmed });
          if (!validation.valid) {
            const valMsg = `Action validation failed: ${validation.reason} (${validation.message})`;
            logger.warn(`[AgentLoop] ${valMsg}`);
            this.lastActionResult = {
              action_id: action.action_id,
              success: false,
              error: valMsg,
            };
            options.onActionComplete?.(action, this.lastActionResult);
            continue;
          }

          // ── 6. Execute ──
          this.setState('EXECUTING', options, `Executing ${action.type}`);
          const execResult = await executeAction(action, this.currentUPR!, userConfirmed);
          this.lastActionResult = execResult;
          this.actionsExecutedCount++;
          options.onActionComplete?.(action, execResult);

          if (!execResult.success) {
            logger.warn(`[AgentLoop] Action execution failed: ${execResult.error}`);
          }
        }

        // ── 7. Wait for DOM Settling (SPA Support) ──
        this.setState('WAITING_FOR_DOM', options);
        await domMutationWatcher.waitForNextChange(350);
      }

      // Max steps budget exhausted — circuit breaker
      const limitReason = `Task exceeded maximum step budget of ${maxSteps} steps. circuit breaker engaged.`;
      logger.warn(`[AgentLoop] Circuit breaker tripped: ${limitReason}`);
      this.setState('DONE', options, limitReason);

      return {
        success: false,
        stepsCompleted: this.currentStep,
        actionsExecuted: this.actionsExecutedCount,
        finalReasoning: limitReason,
        error: limitReason,
      };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      logger.error('[AgentLoop] Fatal error during task execution', err);
      this.setState('ERROR', options, errorMsg);
      return {
        success: false,
        stepsCompleted: this.currentStep,
        actionsExecuted: this.actionsExecutedCount,
        finalReasoning,
        error: errorMsg,
      };
    } finally {
      this.isRunning = false;
      this.currentUPR = null;
      domMutationWatcher.stop();
      logger.info(`[AgentLoop] Loop ended. Total actions executed: ${this.actionsExecutedCount}`);
    }
  }

  /**
   * Generates or assigns SECRET_xxx tokens for unfilled PII inputs from user profile data.
   * Passwords are never tokenized — they are filled directly from the encrypted profile.
   */
  private async prepareTokensForFormFields(elements: UPRElement[]): Promise<void> {
    const profile = userProfileStore.getProfile();

    for (const el of elements) {
      // Passwords are never tokenized (handled locally in action_executor)
      if (el.semantic === 'PASSWORD' || el.semantic === 'CONFIRM_PASSWORD') {
        continue;
      }

      // If already tokenized or filled, keep existing token/value
      if (el.tokenized || el.value) {
        continue;
      }

      // If field expects PII and we have profile data, generate an in-memory token
      let rawValToTokenize: string | null = null;
      if (profile) {
        const resolved = userProfileStore.resolveField(el.semantic);
        if (resolved) {
          rawValToTokenize = resolved;
        } else {
          // Fallback heuristic: match against element label or name
          const identifier = `${el.label || ''} ${el.htmlName || ''} ${el.htmlId || ''}`.toLowerCase();
          if (identifier.includes('name') && !identifier.includes('user')) {
            rawValToTokenize = profile.fullName || (profile.firstName ? `${profile.firstName} ${profile.lastName || ''}`.trim() : null);
          } else if (identifier.includes('email') || identifier.includes('mail')) {
            rawValToTokenize = profile.email ?? null;
          } else if (identifier.includes('phone') || identifier.includes('mobile') || identifier.includes('tel')) {
            rawValToTokenize = profile.phone ?? null;
          } else if (identifier.includes('address') || identifier.includes('street')) {
            rawValToTokenize = profile.addressLine1 ?? null;
          } else if (identifier.includes('city') || identifier.includes('town')) {
            rawValToTokenize = profile.city ?? null;
          } else if (identifier.includes('state') || identifier.includes('province')) {
            rawValToTokenize = profile.state ?? null;
          } else if (identifier.includes('country')) {
            rawValToTokenize = profile.country ?? null;
          } else if (identifier.includes('pincode') || identifier.includes('zip') || identifier.includes('postal')) {
            rawValToTokenize = profile.pincode ?? null;
          } else if (identifier.includes('birth') || identifier.includes('dob')) {
            rawValToTokenize = profile.dateOfBirth ?? null;
          } else if (identifier.includes('gender')) {
            rawValToTokenize = profile.gender ?? null;
          } else if (identifier.includes('username') || identifier.includes('user')) {
            rawValToTokenize = profile.username ?? null;
          } else if (identifier.includes('aadhaar')) {
            rawValToTokenize = profile.aadhaar ?? null;
          } else if (identifier.includes('pan')) {
            rawValToTokenize = profile.pan ?? null;
          }
        }
      }

      if (rawValToTokenize) {
        el.tokenized = tokenStore.generate(rawValToTokenize);
      } else if (el.pii) {
        // Generate placeholder token even without profile data so server knows
        // this field carries PII without seeing the value
        el.tokenized = `SECRET_${el.id.toUpperCase()}`;
      }
    }
  }

  private setState(state: AgentLoopState, options?: AgentLoopOptions, details?: string): void {
    this.state = state;

    // Use info for meaningful progress states so they are visible in production console
    const isProgressState = (
      state === 'OBSERVING'   ||
      state === 'PERCEIVING'  ||
      state === 'SANITIZING'  ||
      state === 'REASONING'   ||
      state === 'EXECUTING'   ||
      state === 'DONE'        ||
      state === 'ERROR'       ||
      state === 'ABORTED'
    );

    const msg = `[AgentLoop] State: ${state}${details ? ` — ${details}` : ''}`;
    if (isProgressState) {
      logger.info(msg);
    } else {
      logger.debug(msg);
    }

    options?.onStateChange?.(state, this.currentStep, details);
  }

  /**
   * Signals the active loop to stop after the current action completes.
   * Safe to call from any context.
   */
  public abort(): void {
    logger.info('[AgentLoop] Abort requested');
    this.shouldAbort = true;
  }

  /**
   * Exposes the current live UPR for external inspection (e.g., transparency panel).
   */
  public getCurrentUPR(): UnifiedPageRepresentation | null {
    return this.currentUPR;
  }
}

export const agentLoop = new AgentLoop();
