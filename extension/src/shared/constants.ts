/**
 * constants.ts
 *
 * All configuration constants for BIN-Vision.
 * Centralized here so thresholds, patterns, and limits
 * can be changed in one place without hunting through modules.
 */

import type { ActionType } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// DOM Selectors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CSS selectors for elements the DOM analyzer should capture.
 * Covers standard interactive elements + ARIA-role equivalents.
 */
export const DOM_SELECTORS = {
  INTERACTIVE: [
    'input:not([type="hidden"])',
    'button',
    'a[href]',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="menuitem"]',
    '[contenteditable="true"]',
  ].join(', '),
} as const;

/** Tags that are themselves interactive — used in label resolution */
export const INTERACTIVE_TAGS = new Set([
  'INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Confidence Thresholds (Two-Stage Perception — Phase 11)
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIDENCE = {
  /** DOM confidence at or above this: skip OCR entirely */
  DOM_SUFFICIENT: 0.70,

  /** OCR confidence at or above this: skip vision model */
  OCR_SUFFICIENT: 0.40,

  /** Minimum confidence to include an element in the UPR */
  ELEMENT_MIN: 0.30,
} as const;

export const CONFIDENCE_THRESHOLDS = CONFIDENCE;

// ─────────────────────────────────────────────────────────────────────────────
// Performance Budgets
// ─────────────────────────────────────────────────────────────────────────────

export const PERFORMANCE = {
  /** Debounce delay for MutationObserver (ms) — prevents re-analysis during animations */
  MUTATION_DEBOUNCE_MS: 300,

  /** Maximum DOM analysis time before we consider the page too complex */
  DOM_ANALYSIS_MAX_MS: 100,

  /** Max OCR processing time budget */
  OCR_MAX_MS: 500,

  /** Max vision model inference time budget */
  VISION_MAX_MS: 1000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Agent Safety Limits
// ─────────────────────────────────────────────────────────────────────────────

export const AGENT = {
  /** Hard limit on actions per task — prevents runaway loops */
  MAX_ACTIONS_PER_TASK: 20,

  /** Max consecutive failures before the loop stops */
  MAX_CONSECUTIVE_FAILURES: 3,

  /** WebSocket reconnect delay (ms) */
  WS_RECONNECT_DELAY_MS: 2000,

  /** Max WebSocket reconnect attempts */
  WS_MAX_RECONNECTS: 5,

  /** Ping interval (ms) */
  WS_PING_INTERVAL_MS: 30_000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Action Security Policy (Phase 5)
// ─────────────────────────────────────────────────────────────────────────────

/** Action types the agent is allowed to request */
export const ALLOWED_ACTIONS: ActionType[] = [
  'fill',
  'click',
  'select',
  'scroll',
  'wait',
];

/**
 * Actions that require explicit user confirmation before execution.
 * The UI panel must show a "Confirm" dialog before these run.
 */
export const CONFIRM_REQUIRED_ACTIONS: ActionType[] = [
  'submit',
  'navigate',
  'back',
];

/**
 * URL patterns the agent is allowed to navigate to.
 * Empty = navigate is fully disabled until user configures patterns.
 */
export const NAVIGATE_ALLOWLIST: RegExp[] = [
  // e.g., /^https:\/\/example\.com\//
  // Add patterns when user configures trusted domains
];

// ─────────────────────────────────────────────────────────────────────────────
// PII Regex Patterns (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

export const PII_PATTERNS = {
  EMAIL: /[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}/g,

  // Indian mobile (10 digits, starting 6-9, optional +91)
  PHONE_IN: /(?:\+91[\s\-]?)?[6-9]\d{9}/g,

  // Generic international phone
  PHONE_INTL: /\+?[1-9]\d{1,3}[\s.\-]?\(?\d{1,4}\)?[\s.\-]?\d{1,4}[\s.\-]?\d{1,9}/g,

  // Credit/debit card (13-16 digits, may have spaces/dashes)
  CARD: /\b(?:\d[ \-]?){13,16}\b/g,

  // Indian Aadhaar (12 digits in groups of 4)
  AADHAAR: /\b\d{4}\s?\d{4}\s?\d{4}\b/g,

  // Indian PAN card
  PAN: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,

  // Indian PIN code (6 digits, first non-zero)
  PINCODE: /\b[1-9][0-9]{5}\b/g,

  // Dates in common formats
  DATE: /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g,

  // CVV (3-4 digits)
  CVV: /\b\d{3,4}\b/g,

  // OTP (4-8 digits)
  OTP: /\b\d{4,8}\b/g,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// DOM Attribute Signals for Semantic Classification (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keyword signals for each semantic type.
 * Used by the semantic classifier to label form fields.
 */
export const SEMANTIC_SIGNALS: Record<string, string[]> = {
  NAME:             ['name', 'fullname', 'full_name', 'full-name', 'yourname', 'your-name'],
  FIRST_NAME:       ['firstname', 'first_name', 'first-name', 'fname', 'given'],
  LAST_NAME:        ['lastname', 'last_name', 'last-name', 'lname', 'surname', 'family'],
  EMAIL:            ['email', 'e-mail', 'mail'],
  PHONE:            ['phone', 'mobile', 'cell', 'tel', 'contact', 'phoneno', 'mobileno'],
  PASSWORD:         ['password', 'pass', 'passwd', 'pwd', 'secret'],
  CONFIRM_PASSWORD: ['confirmpassword', 'confirm_password', 'repassword', 'repeatpassword', 'verifypassword'],
  DATE_OF_BIRTH:    ['dob', 'birthday', 'birth_date', 'birthdate', 'dateofbirth'],
  DATE:             ['date', 'datetime'],
  ADDRESS:          ['address', 'addr', 'street', 'line1', 'line2'],
  CITY:             ['city', 'town'],
  STATE:            ['state', 'province', 'region'],
  COUNTRY:          ['country', 'nation'],
  PINCODE:          ['pincode', 'pin', 'zip', 'zipcode', 'postal', 'postcode'],
  USERNAME:         ['username', 'user', 'userid', 'login', 'handle'],
  SEARCH:           ['search', 'query', 'q', 'keyword'],
  OTP:              ['otp', 'onetime', 'verification', 'passcode', 'verificationcode', 'authcode'],
  CARD_NUMBER:      ['cardnumber', 'card_number', 'ccnumber', 'cc-number', 'cardno'],
  CARD_EXPIRY:      ['expiry', 'expdate', 'exp', 'cardexpiry', 'expirydate'],
  CARD_CVV:         ['cvv', 'cvc', 'cvv2', 'securitycode'],
  AADHAAR:          ['aadhaar', 'aadhar', 'uid'],
  PAN:              ['pan', 'pannumber', 'pan_number'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Backend Connection (Phase 6)
// ─────────────────────────────────────────────────────────────────────────────

export const BACKEND = {
  WS_URL: 'ws://localhost:8000/ws/agent',
  REST_URL: 'http://localhost:8000/api/agent/act',
  HEALTH_URL: 'http://localhost:8000/health',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Storage Keys
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  USER_PROFILE: 'bin_vision_profile',
  SETTINGS: 'bin_vision_settings',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

export const LOG_PREFIX = '[BIN-Vision]';
