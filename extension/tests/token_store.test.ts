import { describe, it, expect, beforeEach } from 'vitest';
import { TokenStore } from '../src/profile/token_store';

describe('Phase 4: Secret Token System (TokenStore)', () => {
  let store: TokenStore;

  beforeEach(() => {
    store = new TokenStore();
  });

  describe('Token Generation & Resolution', () => {
    it('generates a secret token conforming to SECRET_xxx format', () => {
      const token = store.generate('Darsh Shah');
      expect(token).toMatch(/^SECRET_\d{3}_[A-F0-9]{8}$/);
      expect(store.isSecretToken(token)).toBe(true);
    });

    it('resolves a token back to its original raw value', () => {
      const token = store.generate('darsh@example.com');
      expect(store.resolve(token)).toBe('darsh@example.com');
    });

    it('returns null when resolving a non-existent or expired token', () => {
      expect(store.resolve('SECRET_999_NONEXISTENT')).toBeNull();
      expect(store.resolve('')).toBeNull();
    });

    it('deduplicates identical values within the same session', () => {
      const token1 = store.generate('9876543210');
      const token2 = store.generate('9876543210');

      expect(token1).toBe(token2);
      expect(store.size).toBe(1);
    });

    it('provides reverse lookup from value to token', () => {
      const token = store.generate('ABCDE1234F');
      expect(store.getTokenForValue('ABCDE1234F')).toBe(token);
      expect(store.getTokenForValue('nonexistent')).toBeNull();
    });
  });

  describe('Hard Security Invariant: Password Protection', () => {
    it('STRICTLY REFUSES to tokenize password fields and throws an error', () => {
      expect(() => {
        store.generate('mySuperSecretPassword!', 'PASSWORD');
      }).toThrow(/Password values must NEVER be tokenized/i);

      expect(() => {
        store.generate('mySuperSecretPassword!', 'CONFIRM_PASSWORD');
      }).toThrow(/Password values must NEVER be tokenized/i);

      expect(store.size).toBe(0);
    });

    it('rejects empty or non-string values', () => {
      expect(() => store.generate('')).toThrow();
      expect(() => store.generate(null as any)).toThrow();
    });
  });

  describe('Session Lifecycle & Clearing', () => {
    it('clears all tokens on clear()', () => {
      const t1 = store.generate('val1');
      const t2 = store.generate('val2');
      expect(store.size).toBe(2);

      store.clear();
      expect(store.size).toBe(0);
      expect(store.resolve(t1)).toBeNull();
      expect(store.resolve(t2)).toBeNull();
      expect(store.getActiveTokens()).toEqual([]);
    });

    it('attaches lifecycle listeners without error in browser environments', () => {
      expect(() => store.attachLifecycleListeners()).not.toThrow();
    });
  });
});
