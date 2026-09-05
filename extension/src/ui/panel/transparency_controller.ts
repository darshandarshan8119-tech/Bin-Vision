/**
 * transparency_controller.ts
 *
 * Phase 10: State management and DOM synchronization for the Transparency Panel.
 * Tracks loop states, actions timeline, privacy audit metrics, and perception data.
 */

import type { AgentAction, ActionResult, UnifiedPageRepresentation } from '../../shared/types';
import type { AgentLoopState } from '../../agent/agent_loop';
import type { AgentPanelState, LoggedActionItem, ActiveTokenBadge } from '../types';

export class TransparencyController {
  private state: AgentPanelState = {
    loopState: 'IDLE',
    step: 0,
    maxSteps: 20,
    goal: '',
    pageTitle: '',
    pageUrl: '',
    overallConfidence: 0,
    sanitizationSafe: true,
    activeTokens: [],
    detectedFormsCount: 0,
    detectedElementsCount: 0,
    actionsTimeline: [],
  };

  private rootElement: HTMLElement | null = null;
  private onAbortHandler?: () => void;
  private onStartTaskHandler?: (goal: string) => void;

  constructor(initialState?: Partial<AgentPanelState>) {
    if (initialState) {
      this.state = { ...this.state, ...initialState };
    }
  }

  public getState(): AgentPanelState {
    return { ...this.state };
  }

  /**
   * Binds the controller to a panel container element.
   */
  public attachUI(root: HTMLElement): void {
    this.rootElement = root;
    this.bindEvents();
    this.render();
  }

  /**
   * Registers user action handlers.
   */
  public onAbort(handler: () => void): void {
    this.onAbortHandler = handler;
  }

  public onStartTask(handler: (goal: string) => void): void {
    this.onStartTaskHandler = handler;
  }

  /**
   * Updates current agent loop state and step counter.
   */
  public setLoopState(state: AgentLoopState, step = 0, _details?: string): void {
    this.state.loopState = state;
    this.state.step = step;
    this.render();
  }

  /**
   * Updates the task goal.
   */
  public setGoal(goal: string): void {
    this.state.goal = goal;
    this.render();
  }

  /**
   * Updates perception metadata from a newly generated UPR.
   */
  public updatePerception(upr: UnifiedPageRepresentation): void {
    this.state.pageTitle = upr.page.title || 'Untitled Page';
    this.state.pageUrl = upr.page.url || '';
    this.state.overallConfidence = upr.overall_confidence;
    this.state.detectedFormsCount = upr.forms.length;
    this.state.detectedElementsCount = upr.elements.length;
    this.render();
  }

  /**
   * Updates privacy shield metrics and active tokens.
   */
  public updatePrivacyMetrics(safe: boolean, tokens: ActiveTokenBadge[]): void {
    this.state.sanitizationSafe = safe;
    this.state.activeTokens = tokens;
    this.render();
  }

  /**
   * Logs an action to the timeline.
   */
  public logAction(
    action: AgentAction,
    result?: ActionResult,
    status: LoggedActionItem['status'] = 'pending',
    validationMessage?: string
  ): void {
    const item: LoggedActionItem = {
      action,
      timestamp: Date.now(),
      result,
      status,
      validationMessage,
    };
    this.state.actionsTimeline.unshift(item); // prepend latest
    this.render();
  }

  /**
   * Clears the actions timeline.
   */
  public clearTimeline(): void {
    this.state.actionsTimeline = [];
    this.render();
  }

  /**
   * Binds interactive buttons in the panel.
   */
  private bindEvents(): void {
    if (!this.rootElement) return;

    const startBtn = this.rootElement.querySelector('#bv-btn-start-task') as HTMLButtonElement | null;
    const abortBtn = this.rootElement.querySelector('#bv-btn-abort-task') as HTMLButtonElement | null;
    const goalInput = this.rootElement.querySelector('#bv-input-goal') as HTMLInputElement | null;

    startBtn?.addEventListener('click', () => {
      const goal = goalInput?.value?.trim() || '';
      if (goal && this.onStartTaskHandler) {
        this.onStartTaskHandler(goal);
      }
    });

    abortBtn?.addEventListener('click', () => {
      if (this.onAbortHandler) {
        this.onAbortHandler();
      }
    });

    goalInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const goal = goalInput.value.trim();
        if (goal && this.onStartTaskHandler) {
          this.onStartTaskHandler(goal);
        }
      }
    });
  }

  /**
   * Synchronizes internal state to the DOM elements.
   */
  public render(): void {
    if (!this.rootElement) return;

    // 1. Status Badge
    const stateBadge = this.rootElement.querySelector('#bv-status-badge') as HTMLElement | null;
    if (stateBadge) {
      stateBadge.textContent = this.state.loopState;
      stateBadge.className = `bv-status-badge bv-status-${this.state.loopState.toLowerCase()}`;
    }

    // 2. Step Counter & Progress Bar
    const stepEl = this.rootElement.querySelector('#bv-step-counter') as HTMLElement | null;
    if (stepEl) {
      stepEl.textContent = `Step ${this.state.step} / ${this.state.maxSteps}`;
    }

    const progressBar = this.rootElement.querySelector('#bv-progress-bar-fill') as HTMLElement | null;
    if (progressBar) {
      const pct = Math.min(100, Math.round((this.state.step / this.state.maxSteps) * 100));
      progressBar.style.width = `${pct}%`;
    }

    // 3. Goal display
    const currentGoalEl = this.rootElement.querySelector('#bv-current-goal') as HTMLElement | null;
    if (currentGoalEl) {
      currentGoalEl.textContent = this.state.goal || 'No active task';
    }

    // 4. Privacy Shield HUD
    const privacyShield = this.rootElement.querySelector('#bv-privacy-status') as HTMLElement | null;
    if (privacyShield) {
      if (this.state.sanitizationSafe) {
        privacyShield.innerHTML = '🛡️ Zero Raw PII Leaked <span class="bv-status-pill bv-pill-pass">PASS</span>';
      } else {
        privacyShield.innerHTML = '⚠️ Raw PII Leak Detected <span class="bv-status-pill bv-pill-fail">AUDIT FAILED</span>';
      }
    }

    // 5. Active Tokens
    const tokensContainer = this.rootElement.querySelector('#bv-tokens-container') as HTMLElement | null;
    if (tokensContainer) {
      if (this.state.activeTokens.length === 0) {
        tokensContainer.innerHTML = '<span class="bv-empty-text">No active tokens in vault</span>';
      } else {
        tokensContainer.innerHTML = this.state.activeTokens
          .map(
            (t) =>
              `<span class="bv-token-chip" title="Mapped to ${escapeHtml(t.semantic)}">🔒 ${escapeHtml(t.token)}</span>`
          )
          .join('');
      }
    }

    // 6. Perception Stats
    const pageInfoEl = this.rootElement.querySelector('#bv-page-info') as HTMLElement | null;
    if (pageInfoEl) {
      pageInfoEl.textContent = this.state.pageTitle ? `"${this.state.pageTitle}"` : '—';
    }

    const formsCountEl = this.rootElement.querySelector('#bv-forms-count') as HTMLElement | null;
    if (formsCountEl) {
      formsCountEl.textContent = String(this.state.detectedFormsCount);
    }

    const elementsCountEl = this.rootElement.querySelector('#bv-elements-count') as HTMLElement | null;
    if (elementsCountEl) {
      elementsCountEl.textContent = String(this.state.detectedElementsCount);
    }

    const confidenceEl = this.rootElement.querySelector('#bv-confidence-val') as HTMLElement | null;
    if (confidenceEl) {
      confidenceEl.textContent = `${Math.round(this.state.overallConfidence * 100)}%`;
    }

    // 7. Action Timeline
    const timelineEl = this.rootElement.querySelector('#bv-timeline-list') as HTMLElement | null;
    if (timelineEl) {
      if (this.state.actionsTimeline.length === 0) {
        timelineEl.innerHTML = '<div class="bv-timeline-empty">No actions executed yet.</div>';
      } else {
        timelineEl.innerHTML = this.state.actionsTimeline
          .map((item) => {
            const act = item.action;
            const statusClass = `bv-action-status-${item.status}`;
            const timeStr = new Date(item.timestamp).toLocaleTimeString();
            return `
              <div class="bv-timeline-card ${statusClass}">
                <div class="bv-timeline-card-header">
                  <span class="bv-action-type-badge bv-badge-${act.type}">${escapeHtml(act.type.toUpperCase())}</span>
                  <span class="bv-action-target">${act.element_id ? `Target: ${escapeHtml(act.element_id)}` : ''} ${act.value ? `("${escapeHtml(act.value)}")` : ''}</span>
                  <span class="bv-action-time">${timeStr}</span>
                </div>
                ${act.reason ? `<div class="bv-timeline-reason">${escapeHtml(act.reason)}</div>` : ''}
                ${item.validationMessage ? `<div class="bv-timeline-validation-err">⚠️ ${escapeHtml(item.validationMessage)}</div>` : ''}
                ${item.result && !item.result.success ? `<div class="bv-timeline-validation-err">❌ ${escapeHtml(item.result.error || 'Execution failed')}</div>` : ''}
              </div>
            `;
          })
          .join('');
      }
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const transparencyController = new TransparencyController();
