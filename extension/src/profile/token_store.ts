/**
 * token_store.ts
 *
 * Phase 4 core module.
 *
 * In-memory, per-session Secret Token Store.
 *
 * Security Architecture (Section 10 of Architecture Plan):
 *   1. Tokens are stored in volatile JavaScript heap memory ONLY.
 *   2. Never written to disk, localStorage, sessionStorage, or cookies.
 *   3. Server sees ONLY "SECRET_xxx" tokens (e.g. { "value": "SECRET_001" }).
 *   4. Real PII values are resolved locally in the browser immediately before DOM input.
 *   5. SECURITY INVARIANT: Passwords must NEVER be tokenized.
 *   6. Tokens automatically clear on tab navigation, page unload, or task completion.
 */

import type { SemanticType } from '../shared/types';
import { logger } from '../shared/logger';

export class TokenStore {
  private store: Map<string, string> = new Map(); // token -> raw value
  private reverseMap: Map<string, string> = new Map(); // raw value -> token
  private counter = 0;

  /**
   * Generates a unique SECRET_xxx token for a sensitive PII value.
   *
   * SECURITY ENFORCEMENT:
   * Throws a hard error if an attempt is made to tokenize a password.
   * Passwords must be filled directly from the encrypted profile into the DOM.
   *
   * @param value - The raw sensitive value (e.g. user's name or phone)
   * @param semanticType - Optional semantic field type for safety check
   * @returns Unpredictable secret token string e.g. "SECRET_A1B2C3D4"
   */
  public generate(value: string, semanticType?: SemanticType): string {
    // ── Hard Security Invariant ──
    if (semanticType === 'PASSWORD' || semanticType === 'CONFIRM_PASSWORD') {
      throw new Error(
        'Security Violation: Password values must NEVER be tokenized or passed to the TokenStore. Passwords must be filled directly in the DOM.'
      );
    }

    if (!value || typeof value !== 'string') {
      throw new Error('Cannot tokenize an empty or non-string value.');
    }

    // Reuse existing token if value was already tokenized in this session
    if (this.reverseMap.has(value)) {
      return this.reverseMap.get(value)!;
    }

    this.counter++;
    const randomHex = this.getRandomHex(4);
    const token = `SECRET_${String(this.counter).padStart(3, '0')}_${randomHex}`;

    this.store.set(token, value);
    this.reverseMap.set(value, token);

    logger.debug(`Generated token ${token} for PII field`);
    return token;
  }

  /**
   * Resolves a SECRET_xxx token back into its actual raw value.
   *
   * @param token - Token string e.g. "SECRET_001_ABCD"
   * @returns Raw sensitive string, or null if token is not found or expired
   */
  public resolve(token: string): string | null {
    if (!token || typeof token !== 'string') return null;
    return this.store.get(token.trim()) ?? null;
  }

  /**
   * Checks whether a given token exists in the in-memory store.
   */
  public has(token: string): boolean {
    return this.store.has(token);
  }

  /**
   * Returns the token previously generated for a raw value, if any.
   */
  public getTokenForValue(value: string): string | null {
    return this.reverseMap.get(value) ?? null;
  }

  /**
   * Number of active tokens in this session.
   */
  public get size(): number {
    return this.store.size;
  }

  /**
   * Returns all current active secret tokens (safe to inspect, contains no raw PII).
   */
  public getActiveTokens(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Checks if a string conforms to the secret token format.
   */
  public isSecretToken(value: string | null | undefined): boolean {
    if (!value || typeof value !== 'string') return false;
    return /^SECRET_[A-Z0-9_-]+$/i.test(value.trim());
  }

  /**
   * Clears all tokens from memory.
   * MUST be called on tab close, page navigation, or task reset.
   */
  public clear(): void {
    const count = this.store.size;
    this.store.clear();
    this.reverseMap.clear();
    this.counter = 0;
    if (count > 0) {
      logger.debug(`TokenStore cleared ${count} active tokens from memory.`);
    }
  }

  /**
   * Attaches browser lifecycle event listeners to automatically wipe
   * tokens when the user navigates away or closes the page.
   */
  public attachLifecycleListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.clear());
      window.addEventListener('pagehide', () => this.clear());
    }
  }

  private getRandomHex(bytes: number): string {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint8Array(bytes);
      crypto.getRandomValues(arr);
      return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    // Fallback pseudo-random
    return Math.random().toString(16).slice(2, 2 + bytes * 2).toUpperCase();
  }
}

/** Default singleton instance for content script scope */
export const tokenStore = new TokenStore();
