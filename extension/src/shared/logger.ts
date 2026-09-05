/**
 * logger.ts
 *
 * Safe, centralized logger for BIN-Vision.
 *
 * Safety guarantees:
 *   - Never logs raw PII values
 *   - Never logs SECRET_xxx token values (redacts them)
 *   - Never logs password field values
 *   - Debug logs suppressed in production builds
 *
 * Usage:
 *   import { logger } from '@shared/logger';
 *   logger.info('DOM analysis done', { elements: 12 });
 *   logger.error('Validation failed', error);
 */

import { LOG_PREFIX } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Sensitive pattern redaction
// ─────────────────────────────────────────────────────────────────────────────

/** Patterns that should never appear in logs */
const REDACT_PATTERNS: [RegExp, string][] = [
  [/SECRET_[A-Z0-9]+/g,                    '[REDACTED_TOKEN]'],
  [/(?<=password["\s:=]+)[^\s"',}\]]+/gi,   '[REDACTED_PASSWORD]'],
  [/[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}/g,     '[REDACTED_EMAIL]'],
  [/\b[6-9]\d{9}\b/g,                       '[REDACTED_PHONE]'],
  [/\b\d{4}\s?\d{4}\s?\d{4}\b/g,           '[REDACTED_AADHAAR]'],
  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,           '[REDACTED_PAN]'],
];

function sanitizeString(str: string): string {
  let result = str;
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (data instanceof Error) {
    return { message: sanitizeString(data.message), name: data.name };
  }

  try {
    // Serialize → redact → deserialize
    const serialized = JSON.stringify(data);
    const redacted = sanitizeString(serialized);
    return JSON.parse(redacted) as unknown;
  } catch {
    return '[UNSERIALIZABLE_DATA]';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger implementation
// ─────────────────────────────────────────────────────────────────────────────

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function log(level: LogLevel, message: string, data?: unknown): void {
  // In production, suppress debug logs
  const isDev = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : process.env.NODE_ENV !== 'production';
  if (level === 'debug' && !isDev) return;

  const tag = `${LOG_PREFIX}`;
  const sanitizedData = data !== undefined ? sanitizeData(data) : undefined;

  switch (level) {
    case 'info':
      if (sanitizedData !== undefined) {
        console.info(tag, message, sanitizedData);
      } else {
        console.info(tag, message);
      }
      break;

    case 'warn':
      if (sanitizedData !== undefined) {
        console.warn(tag, message, sanitizedData);
      } else {
        console.warn(tag, message);
      }
      break;

    case 'error':
      if (sanitizedData !== undefined) {
        console.error(tag, message, sanitizedData);
      } else {
        console.error(tag, message);
      }
      break;

    case 'debug':
      if (sanitizedData !== undefined) {
        console.debug(tag, '🔍', message, sanitizedData);
      } else {
        console.debug(tag, '🔍', message);
      }
      break;
  }
}

export const logger = {
  info:  (message: string, data?: unknown) => log('info',  message, data),
  warn:  (message: string, data?: unknown) => log('warn',  message, data),
  error: (message: string, data?: unknown) => log('error', message, data),
  debug: (message: string, data?: unknown) => log('debug', message, data),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Vite global type declaration
// ─────────────────────────────────────────────────────────────────────────────

// __DEV__ is replaced at build time by vite.config.ts define
declare const __DEV__: boolean;
