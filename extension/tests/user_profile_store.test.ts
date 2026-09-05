import { describe, it, expect, beforeEach } from 'vitest';
import { UserProfileStore } from '../src/profile/user_profile_store';
import type { UserProfile } from '../src/shared/types';

describe('Phase 4: User Profile Store', () => {
  let store: UserProfileStore;

  const sampleProfile: UserProfile = {
    firstName: 'Darsh',
    lastName: 'Shah',
    fullName: 'Darsh Shah',
    email: 'darsh@example.com',
    phone: '+91 98765 43210',
    dateOfBirth: '2000-01-15',
    gender: 'Male',
    addressLine1: '42 Marine Drive',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    pincode: '400020',
    username: 'darsh_shah',
    aadhaar: '2345 6789 0123',
    pan: 'BKRPD5432K',
    passwords: {
      'github.com': 'gh_p@ssw0rd123',
      'default': 'default_secr3t!',
    },
  };

  beforeEach(() => {
    store = new UserProfileStore();
  });

  describe('Semantic Field Resolution', () => {
    beforeEach(() => {
      store.setInMemoryProfile(sampleProfile);
    });

    it('resolves names correctly', () => {
      expect(store.resolveField('NAME')).toBe('Darsh Shah');
      expect(store.resolveField('FIRST_NAME')).toBe('Darsh');
      expect(store.resolveField('LAST_NAME')).toBe('Shah');
    });

    it('resolves contact and identity fields', () => {
      expect(store.resolveField('EMAIL')).toBe('darsh@example.com');
      expect(store.resolveField('PHONE')).toBe('+91 98765 43210');
      expect(store.resolveField('DATE_OF_BIRTH')).toBe('2000-01-15');
      expect(store.resolveField('AADHAAR')).toBe('2345 6789 0123');
      expect(store.resolveField('PAN')).toBe('BKRPD5432K');
    });

    it('resolves regional address fields', () => {
      expect(store.resolveField('ADDRESS')).toBe('42 Marine Drive');
      expect(store.resolveField('CITY')).toBe('Mumbai');
      expect(store.resolveField('STATE')).toBe('Maharashtra');
      expect(store.resolveField('PINCODE')).toBe('400020');
      expect(store.resolveField('COUNTRY')).toBe('India');
    });

    it('resolves domain-specific passwords and falls back to default', () => {
      expect(store.resolveField('PASSWORD', 'github.com')).toBe('gh_p@ssw0rd123');
      expect(store.resolveField('PASSWORD', 'unknown-domain.com')).toBe('default_secr3t!');
    });

    it('returns undefined for unconfigured fields', () => {
      expect(store.resolveField('SEARCH')).toBeUndefined();
      expect(store.resolveField('OTHER')).toBeUndefined();
    });
  });

  describe('Locking & Purging', () => {
    it('wipes memory on lock()', () => {
      store.setInMemoryProfile(sampleProfile);
      expect(store.getProfile()).toBeDefined();

      store.lock();
      expect(store.getProfile()).toBeNull();
      expect(store.resolveField('EMAIL')).toBeUndefined();
      expect(store.unlocked).toBe(false);
    });
  });

  describe('Web Crypto PBKDF2 + AES-GCM 256-bit Encryption Round-Trip', () => {
    it('encrypts profile with PIN and decrypts accurately', async () => {
      const pin = '4829';
      await store.saveProfile(sampleProfile, pin);

      // Lock to clear in-memory state
      store.lock();
      expect(store.getProfile()).toBeNull();

      // Load with correct PIN
      const loaded = await store.loadProfile(pin);
      expect(loaded).toBeDefined();
      expect(loaded?.email).toBe('darsh@example.com');
      expect(loaded?.pan).toBe('BKRPD5432K');
      expect(store.unlocked).toBe(true);
    });

    it('fails to decrypt and returns null when wrong PIN is provided', async () => {
      const pin = '4829';
      await store.saveProfile(sampleProfile, pin);
      store.lock();

      const failedLoad = await store.loadProfile('9999'); // Wrong PIN
      expect(failedLoad).toBeNull();
      expect(store.unlocked).toBe(false);
    });
  });
});
