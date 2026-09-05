/**
 * in_page_hud.ts
 *
 * Phase 10: Floating In-Page Transparency HUD Dock.
 * Mounts a non-intrusive floating pill on the webpage showing real-time agent status.
 */

import type { AgentLoopState } from '../../agent/agent_loop';

export class InPageHUD {
  private element: HTMLElement | null = null;
  private isMounted = false;

  public mount(container: HTMLElement = document.body): void {
    if (this.isMounted) return;

    const dock = document.createElement('div');
    dock.className = 'bv-hud-dock';
    dock.id = 'bv-inpage-hud';
    dock.setAttribute('data-testid', 'in-page-hud');

    dock.innerHTML = `
      <div class="bv-hud-icon">🧠</div>
      <div class="bv-hud-status-dot" id="bv-hud-dot"></div>
      <span class="bv-hud-label" id="bv-hud-state">IDLE</span>
      <span class="bv-hud-step" id="bv-hud-step">Step 0</span>
      <span class="bv-hud-shield">🛡️ Zero PII</span>
    `;

    container.appendChild(dock);
    this.element = dock;
    this.isMounted = true;
  }

  public updateState(state: AgentLoopState, step = 0): void {
    if (!this.element) return;

    const stateEl = this.element.querySelector('#bv-hud-state');
    const stepEl = this.element.querySelector('#bv-hud-step');
    const dotEl = this.element.querySelector('#bv-hud-dot') as HTMLElement | null;

    if (stateEl) stateEl.textContent = state;
    if (stepEl) stepEl.textContent = `Step ${step}`;

    if (dotEl) {
      if (state === 'EXECUTING' || state === 'DONE') {
        dotEl.style.background = '#10b981';
        dotEl.style.boxShadow = '0 0 8px #10b981';
      } else if (state === 'VALIDATING' || state === 'WAITING_FOR_DOM') {
        dotEl.style.background = '#f59e0b';
        dotEl.style.boxShadow = '0 0 8px #f59e0b';
      } else if (state === 'ERROR' || state === 'ABORTED') {
        dotEl.style.background = '#f43f5e';
        dotEl.style.boxShadow = '0 0 8px #f43f5e';
      } else {
        dotEl.style.background = '#8b5cf6';
        dotEl.style.boxShadow = '0 0 8px #8b5cf6';
      }
    }
  }

  public unmount(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.isMounted = false;
  }

  public isVisible(): boolean {
    return this.isMounted;
  }
}

export const inPageHUD = new InPageHUD();
