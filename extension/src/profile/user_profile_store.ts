/**
 * user_profile_store.ts
 *
 * Phase 4 core module.
 *
 * Encrypted Local User Profile Store using Web Crypto API (PBKDF2 + AES-GCM 256-bit).
 *
 * Security Architecture (Section 10 & 13 of Implementation Plan):
 *   1. All user profile data (identity, credentials, addresses) is encrypted at rest.
 *   2. Encryption key is derived on-device from a user PIN using PBKDF2 (100,000 iterations, SHA-256).
 *   3. Ciphertext is stored in IndexedDB using the 'idb' library.
 *   4. Memory caching while unlocked; clearable on lock.
 *   5. Automatic field mapping: resolves SemanticType → User Profile Value.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { SemanticType, UserProfile } from '../shared/types';
import { STORAGE_KEYS } from '../shared/constants';
import { logger } from '../shared/logger';

interface EncryptedPayload {
  salt: string; // Hex 16-byte salt
  iv: string;   // Hex 12-byte IV
  data: string; // Hex ciphertext
}

const DB_NAME = 'BINVisionDB';
const DB_VERSION = 1;
const STORE_NAME = 'secure_profile';

export const DEFAULT_PROFILE: UserProfile = {
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
    default: 'default_secr3t!',
  },
};

export class UserProfileStore {
  private inMemoryProfile: UserProfile | null = null;
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private isUnlocked = false;

  constructor() {
    if (typeof indexedDB !== 'undefined') {
      this.initDB();
    }
  }

  private initDB(): void {
    this.dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }

  /**
   * Encrypts and saves the user profile to persistent local storage.
   *
   * @param profile - The UserProfile data to store
   * @param pin - The user's PIN/passphrase for encryption key derivation (default: '0000' for dev)
   */
  public async saveProfile(profile: UserProfile, pin = '0000'): Promise<void> {
    const json = JSON.stringify(profile);
    const encrypted = await this.encryptText(json, pin);

    if (this.dbPromise) {
      const db = await this.dbPromise;
      await db.put(STORE_NAME, encrypted, STORAGE_KEYS.USER_PROFILE);
    } else {
      // Fallback in-memory storage for test/headless environments
      (globalThis as any)[`__fallback_${STORAGE_KEYS.USER_PROFILE}`] = encrypted;
    }

    this.inMemoryProfile = { ...profile };
    this.isUnlocked = true;
    logger.info('User profile saved and encrypted locally.');
  }

  /**
   * Decrypts and loads the user profile from local storage.
   *
   * @param pin - The user's PIN/passphrase to unlock the profile
   * @returns UserProfile or null if not found or incorrect PIN
   */
  public async loadProfile(pin = '0000'): Promise<UserProfile | null> {
    let encrypted: EncryptedPayload | undefined;

    if (this.dbPromise) {
      const db = await this.dbPromise;
      encrypted = await db.get(STORE_NAME, STORAGE_KEYS.USER_PROFILE);
    } else {
      encrypted = (globalThis as any)[`__fallback_${STORAGE_KEYS.USER_PROFILE}`];
    }

    if (!encrypted) {
      return null;
    }

    try {
      const decryptedJson = await this.decryptText(encrypted, pin);
      const profile: UserProfile = JSON.parse(decryptedJson);
      this.inMemoryProfile = profile;
      this.isUnlocked = true;
      return profile;
    } catch {
      logger.warn('Failed to decrypt user profile. Incorrect PIN or corrupted data.');
      return null;
    }
  }

  /**
   * Sets profile in memory directly (useful for tests and active session caching).
   */
  public setInMemoryProfile(profile: UserProfile): void {
    this.inMemoryProfile = { ...profile };
    this.isUnlocked = true;
  }

  /**
   * Gets the currently loaded in-memory profile.
   */
  public getProfile(): UserProfile | null {
    return this.inMemoryProfile;
  }

  /**
   * Resolves a value from the user profile corresponding to a semantic field type.
   *
   * @param semantic - The target semantic field type
   * @param domain - Optional current hostname for domain-specific credentials
   * @returns Resolved string value or undefined
   */
  public resolveField(semantic: SemanticType, domain?: string): string | undefined {
    const p = this.inMemoryProfile;
    if (!p) return undefined;

    switch (semantic) {
      case 'NAME':
        return p.fullName || (p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName);
      case 'FIRST_NAME':
        return p.firstName;
      case 'LAST_NAME':
        return p.lastName;
      case 'EMAIL':
        return p.email;
      case 'PHONE':
        return p.phone;
      case 'DATE_OF_BIRTH':
        return p.dateOfBirth;
      case 'ADDRESS':
        return p.addressLine1;
      case 'CITY':
        return p.city;
      case 'STATE':
        return p.state;
      case 'COUNTRY':
        return p.country;
      case 'PINCODE':
        return p.pincode;
      case 'USERNAME':
        return p.username;
      case 'AADHAAR':
        return p.aadhaar;
      case 'PAN':
        return p.pan;
      case 'PASSWORD':
      case 'CONFIRM_PASSWORD':
        if (domain && p.passwords?.[domain]) {
          return p.passwords[domain];
        }
        return p.passwords?.['default'] ?? undefined;
      default:
        return undefined;
    }
  }

  /**
   * Locks the profile store and wipes in-memory profile data.
   */
  public lock(): void {
    this.inMemoryProfile = null;
    this.isUnlocked = false;
    logger.debug('UserProfileStore locked. In-memory data purged.');
  }

  /**
   * Deletes the stored encrypted profile permanently.
   */
  public async clearProfile(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise;
      await db.delete(STORE_NAME, STORAGE_KEYS.USER_PROFILE);
    }
    delete (globalThis as any)[`__fallback_${STORAGE_KEYS.USER_PROFILE}`];
    this.lock();
    logger.info('User profile deleted.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Web Crypto Encryption Implementation (PBKDF2 + AES-GCM 256)
  // ─────────────────────────────────────────────────────────────────────────

  private async encryptText(plainText: string, pin: string): Promise<EncryptedPayload> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const key = await this.deriveKey(pin, salt);
    const encoded = new TextEncoder().encode(plainText);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    return {
      salt: this.bufferToHex(salt),
      iv: this.bufferToHex(iv),
      data: this.bufferToHex(new Uint8Array(ciphertext)),
    };
  }

  private async decryptText(payload: EncryptedPayload, pin: string): Promise<string> {
    const salt = this.hexToBuffer(payload.salt);
    const iv = this.hexToBuffer(payload.iv);
    const data = this.hexToBuffer(payload.data);

    const key = await this.deriveKey(pin, salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      data as BufferSource
    );

    return new TextDecoder().decode(decrypted);
  }

  public get unlocked(): boolean {
    return this.isUnlocked;
  }

  private async deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const pinBuffer = encoder.encode(pin);

    const baseKey = await crypto.subtle.importKey(
      'raw',
      pinBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: 100_000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private bufferToHex(buf: Uint8Array): string {
    return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private hexToBuffer(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }
}

/** Default singleton instance */
export const userProfileStore = new UserProfileStore();
