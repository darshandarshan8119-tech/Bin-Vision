/**
 * mutation_observer.ts
 *
 * Phase 9: Single Page Application (SPA) Support & DOM Mutation Watcher.
 *
 * Monitors dynamic DOM tree modifications (such as SPA route transitions, multi-step wizards,
 * conditional field reveals, and modal appearances) using a debounced MutationObserver.
 * Triggers re-analysis only after the DOM settles.
 */

import { logger } from '../shared/logger';
import { PERFORMANCE } from '../shared/constants';

export type DOMChangeCallback = () => void;

export class DOMMutationWatcher {
  private observer: MutationObserver | null = null;
  private debounceTimer: any = null;
  private debounceMs: number;
  private callback: DOMChangeCallback | null = null;
  private _isObserving = false;
  private pendingResolvers: Array<(changed: boolean) => void> = [];

  constructor(debounceMs: number = PERFORMANCE.MUTATION_DEBOUNCE_MS) {
    this.debounceMs = debounceMs;
  }

  public get isObserving(): boolean {
    return this._isObserving;
  }

  /**
   * Starts observing DOM mutations on the specified root node (default: document.body).
   */
  public start(target?: Node, onChange?: DOMChangeCallback): void {
    if (this._isObserving) {
      this.stop();
    }

    if (onChange) {
      this.callback = onChange;
    }

    const nodeToWatch = target ?? (typeof document !== 'undefined' ? document.body ?? document.documentElement : null);
    if (!nodeToWatch || typeof MutationObserver === 'undefined') {
      logger.warn('[MutationWatcher] Target node or MutationObserver unavailable');
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    try {
      this.observer.observe(nodeToWatch, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'disabled', 'aria-hidden', 'type'],
      });
      this._isObserving = true;
      logger.debug('[MutationWatcher] Observation started');
    } catch (err) {
      logger.error('[MutationWatcher] Failed to start observer', err);
    }
  }

  /**
   * Handles incoming mutation records with a debounce window.
   */
  private handleMutations(mutations: MutationRecord[]): void {
    if (!mutations || mutations.length === 0) return;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      logger.debug(`[MutationWatcher] DOM settled after mutations. Triggering change callback.`);
      if (this.callback) {
        this.callback();
      }

      // Resolve any pending waitForNextChange promises
      const resolvers = [...this.pendingResolvers];
      this.pendingResolvers = [];
      for (const resolve of resolvers) {
        resolve(true);
      }
    }, this.debounceMs);
  }

  /**
   * Waits asynchronously until the next DOM mutation settles, or until timeout.
   */
  public waitForNextChange(timeoutMs: number = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const index = this.pendingResolvers.indexOf(resolver);
        if (index !== -1) {
          this.pendingResolvers.splice(index, 1);
        }
        resolve(false);
      }, timeoutMs);

      const resolver = (changed: boolean) => {
        clearTimeout(timer);
        resolve(changed);
      };

      this.pendingResolvers.push(resolver);
    });
  }

  /**
   * Manually notifies change (useful for synthetic triggers or tests).
   */
  public triggerChange(): void {
    if (this.callback) {
      this.callback();
    }
    const resolvers = [...this.pendingResolvers];
    this.pendingResolvers = [];
    for (const resolve of resolvers) {
      resolve(true);
    }
  }

  /**
   * Stops the MutationObserver and clears pending debounce timers.
   */
  public stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this._isObserving = false;
    this.pendingResolvers = [];
    logger.debug('[MutationWatcher] Observation stopped');
  }
}

export const domMutationWatcher = new DOMMutationWatcher();
