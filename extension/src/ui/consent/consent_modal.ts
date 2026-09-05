/**
 * consent_modal.ts
 *
 * Phase 10: User Consent Dialog & Form Review Panel.
 *
 * Enforces the core exit criterion:
 * "No form is submitted without explicit user confirmation."
 *
 * Features:
 *   - Pre-submission Form Review: table of all form fields, values, and token status.
 *   - Action Warning: clear warning for destructive/navigational actions.
 *   - Glassmorphic modal rendering with animated backdrop.
 *   - Keyboard accessible (Enter to confirm, Escape to cancel).
 *   - Returns Promise<boolean> compatible with AgentLoop.confirmationProvider.
 */

import type { AgentAction, UnifiedPageRepresentation, UPRElement } from '../../shared/types';
import type { FormReviewItem, ConsentRequest } from '../types';
import { tokenStore } from '../../profile/token_store';

export class ConsentModal {
  private activeContainer: HTMLElement | null = null;
  private resolveFn: ((confirmed: boolean) => void) | null = null;

  /**
   * Prompts the user with a consent modal and form review table.
   * Resolves to `true` if the user confirms, or `false` if cancelled/rejected.
   */
  public requestConsent(
    action: AgentAction,
    upr?: UnifiedPageRepresentation,
    mountContainer?: HTMLElement
  ): Promise<boolean> {
    // If a modal is already open, cancel the existing one first
    if (this.activeContainer) {
      this.cancel();
    }

    return new Promise<boolean>((resolve) => {
      this.resolveFn = resolve;

      const targetEl = upr?.elements.find((e) => e.id === action.element_id);
      const reviewItems = this.buildFormReview(action, upr, targetEl);

      const request: ConsentRequest = {
        action,
        actionType: action.type.toUpperCase(),
        targetElement: targetEl,
        formReviewItems: reviewItems,
        destinationUrl: action.url,
        warningMessage: this.getWarningMessage(action),
        reason: action.reason || 'Autonomous agent requested execution of a restricted action.',
      };

      this.render(request, mountContainer);
    });
  }

  /**
   * Builds the list of form fields and current values for user review.
   */
  public buildFormReview(
    _action: AgentAction,
    upr?: UnifiedPageRepresentation,
    targetEl?: UPRElement
  ): FormReviewItem[] {
    const items: FormReviewItem[] = [];
    if (!upr) return items;

    // Find parent form in UPR if available
    const targetForm = upr.forms?.find(
      (f) => targetEl?.id && f.element_ids.includes(targetEl.id)
    );

    // Filter elements that belong to this form or are interactive input/select/textarea
    const formElements = upr.elements.filter((el) => {
      if (targetForm) {
        return targetForm.element_ids.includes(el.id) && el.type !== 'button';
      }
      return (
        el.type === 'input' ||
        el.type === 'select' ||
        el.type === 'textarea'
      );
    });

    for (const el of formElements) {
      // Check current DOM value first, then fallback to UPR value
      let val = el.value ?? '';
      const domEl = el.id ? document.querySelector(`[data-upr-id="${el.id}"], #${el.htmlId || 'none'}`) as HTMLInputElement | null : null;
      if (domEl && 'value' in domEl && domEl.value) {
        val = domEl.value;
      }

      // Check if value matches a secret token or element is tokenized in UPR
      const isToken = Boolean(el.tokenized) || val.startsWith('SECRET_') || tokenStore.has(val) || tokenStore.isSecretToken(val);

      items.push({
        id: el.id,
        name: el.htmlName || el.htmlId,
        label: el.label || el.htmlName || el.semantic || 'Field',
        semantic: el.semantic,
        value: val || '(empty)',
        isToken,
        isPII: el.pii,
      });
    }

    return items;
  }

  /**
   * Generates a descriptive warning message based on the action type.
   */
  private getWarningMessage(action: AgentAction): string {
    switch (action.type) {
      case 'submit':
        return 'The agent is ready to submit this form. Review the values below before confirming.';
      case 'navigate':
        return `The agent is requesting to navigate to external URL: ${action.url || 'unknown'}.`;
      case 'back':
        return 'The agent is requesting to navigate backward in browser history.';
      default:
        return `The agent requires explicit confirmation to execute action: "${action.type}".`;
    }
  }

  /**
   * Renders the modal HTML and attaches event listeners.
   */
  private render(request: ConsentRequest, mountContainer?: HTMLElement): void {
    const container = mountContainer || document.body;

    const overlay = document.createElement('div');
    overlay.className = 'bv-consent-backdrop';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('data-testid', 'consent-dialog');

    const tableRows = request.formReviewItems.length > 0
      ? request.formReviewItems
          .map(
            (item) => `
            <tr>
              <td><strong>${escapeHtml(item.label)}</strong></td>
              <td><code>${escapeHtml(item.semantic)}</code></td>
              <td>${escapeHtml(item.value)}</td>
              <td>
                ${item.isToken ? '<span class="bv-tag-token">🛡️ Tokenized</span>' : ''}
                ${item.isPII && !item.isToken ? '<span class="bv-tag-pii">⚠️ PII</span>' : ''}
                ${!item.isPII && !item.isToken ? '<span style="color:#94a3b8;">Standard</span>' : ''}
              </td>
            </tr>`
          )
          .join('')
      : `<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding:16px;">No form inputs detected to review.</td></tr>`;

    overlay.innerHTML = `
      <div class="bv-consent-card">
        <div class="bv-consent-header">
          <div class="bv-consent-badge-icon">⚠️</div>
          <div class="bv-consent-title-group">
            <h2 class="bv-consent-title">Confirm ${escapeHtml(request.actionType)} Action</h2>
            <p class="bv-consent-subtitle">${escapeHtml(request.warningMessage)}</p>
          </div>
        </div>

        <div class="bv-consent-body">
          <div class="bv-consent-reason-box">
            <div class="bv-consent-reason-label">Agent Reasoning</div>
            <div>${escapeHtml(request.reason || '')}</div>
          </div>

          ${
            request.action.type === 'submit'
              ? `
            <div class="bv-consent-review-title">
              <span>Form Data Review</span>
              <span style="font-size:11px; color:#10b981; font-weight:600;">🛡️ Privacy Protected</span>
            </div>
            <div class="bv-consent-table-container">
              <table class="bv-consent-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Semantic</th>
                    <th>Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>`
              : ''
          }
        </div>

        <div class="bv-consent-footer">
          <button class="bv-btn bv-btn-cancel" id="bv-consent-btn-cancel" data-testid="consent-cancel-btn">
            ✕ Cancel & Reject
          </button>
          <button class="bv-btn bv-btn-confirm" id="bv-consent-btn-confirm" data-testid="consent-confirm-btn">
            ✓ Confirm & Execute
          </button>
        </div>
      </div>
    `;

    container.appendChild(overlay);
    this.activeContainer = overlay;

    // Attach button listeners
    const cancelBtn = overlay.querySelector('#bv-consent-btn-cancel') as HTMLButtonElement | null;
    const confirmBtn = overlay.querySelector('#bv-consent-btn-confirm') as HTMLButtonElement | null;

    cancelBtn?.addEventListener('click', () => this.cancel());
    confirmBtn?.addEventListener('click', () => this.confirm());

    // Keyboard support: Escape cancels, Enter confirms
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.removeEventListener('keydown', keyHandler);
        this.cancel();
      } else if (e.key === 'Enter' && e.target === confirmBtn) {
        e.preventDefault();
        window.removeEventListener('keydown', keyHandler);
        this.confirm();
      }
    };
    window.addEventListener('keydown', keyHandler);

    // Focus confirm button by default
    confirmBtn?.focus();
  }

  /**
   * Confirms the action, resolving the promise to true.
   */
  public confirm(): void {
    if (this.resolveFn) {
      this.resolveFn(true);
      this.resolveFn = null;
    }
    this.cleanup();
  }

  /**
   * Cancels the action, resolving the promise to false.
   */
  public cancel(): void {
    if (this.resolveFn) {
      this.resolveFn(false);
      this.resolveFn = null;
    }
    this.cleanup();
  }

  /**
   * Returns true if a consent dialog is currently displayed.
   */
  public isShowing(): boolean {
    return this.activeContainer !== null;
  }

  /**
   * Cleans up the rendered modal elements from the DOM.
   */
  private cleanup(): void {
    if (this.activeContainer && this.activeContainer.parentNode) {
      this.activeContainer.parentNode.removeChild(this.activeContainer);
    }
    this.activeContainer = null;
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

export const consentModal = new ConsentModal();
