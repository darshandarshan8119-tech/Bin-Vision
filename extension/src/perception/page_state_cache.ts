/**
 * page_state_cache.ts
 *
 * Phase 9: DOM State Hashing & Page State Caching.
 *
 * Caches the Unified Page Representation (UPR) based on SHA-256 / fast structural
 * hashes of the DOM tree. When an SPA re-renders or the agent loop executes,
 * this cache prevents expensive re-analysis if the DOM has not changed.
 */

import type { UnifiedPageRepresentation } from '../shared/types';
import { logger } from '../shared/logger';

export class PageStateCache {
  private cache: Map<string, UnifiedPageRepresentation> = new Map();
  private lastHash: string | null = null;
  private maxEntries: number;

  constructor(maxEntries: number = 10) {
    this.maxEntries = maxEntries;
  }

  /**
   * Computes a structural hash of the current document or container element.
   */
  public async computeHash(rootElement?: Element): Promise<string> {
    const el = rootElement ?? (typeof document !== 'undefined' ? document.body ?? document.documentElement : null);
    if (!el) {
      return 'hash_empty';
    }

    // Extract structural digest (tag names, IDs, input types, values length, interactable state)
    const inputs = el.querySelectorAll('input, select, textarea, button, a[href]');
    const digestParts: string[] = [el.tagName, String(inputs.length)];

    for (let i = 0; i < Math.min(inputs.length, 100); i++) {
      const item = inputs[i] as HTMLInputElement;
      digestParts.push(
        `${item.tagName}:${item.id || ''}:${item.name || ''}:${item.type || ''}:${item.value || ''}:${item.disabled || false}`
      );
    }

    const digestStr = digestParts.join('|');

    if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(digestStr);
        const buffer = await crypto.subtle.digest('SHA-256', data);
        const hex = Array.from(new Uint8Array(buffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        return `sha256:${hex.slice(0, 32)}`;
      } catch {
        // Fallback to fast hash
      }
    }

    return this.fastHash(digestStr);
  }

  /**
   * Fast synchronous fallback hash.
   */
  public computeFastHash(rootElement?: Element): string {
    const el = rootElement ?? (typeof document !== 'undefined' ? document.body ?? document.documentElement : null);
    if (!el) return 'hash_empty';

    const inputs = el.querySelectorAll('input, select, textarea, button, a[href]');
    const digestStr = `${el.tagName}|${inputs.length}|${Array.from(inputs).map(i => (i as HTMLInputElement).value || '').join(',')}`;
    return this.fastHash(digestStr);
  }

  private fastHash(str: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    const hex = (hash >>> 0).toString(16).padStart(8, '0');
    return `sha256:${hex.repeat(4).slice(0, 32)}`;
  }

  /**
   * Retrieves cached UPR if available.
   */
  public get(hash: string): UnifiedPageRepresentation | null {
    const entry = this.cache.get(hash);
    if (entry) {
      logger.debug(`[PageStateCache] Cache hit for hash: ${hash}`);
      return entry;
    }
    return null;
  }

  /**
   * Stores a UPR in cache keyed by DOM hash.
   */
  public set(hash: string, upr: UnifiedPageRepresentation): void {
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(hash, upr);
    this.lastHash = hash;
  }

  /**
   * Checks if the provided hash differs from the previously recorded state.
   */
  public hasChanged(newHash: string): boolean {
    return this.lastHash !== newHash;
  }

  public getLastHash(): string | null {
    return this.lastHash;
  }

  public clear(): void {
    this.cache.clear();
    this.lastHash = null;
    logger.debug('[PageStateCache] Cache cleared');
  }
}

export const pageStateCache = new PageStateCache();
