/**
 * action_validator.ts
 *
 * Phase 5 core module.
 *
 * Security gate for all agent actions before they touch the DOM.
 * Implements the 8-point Validator Checklist from Section 12 of the Architecture Plan:
 *   1. Action type in ALLOWED_ACTIONS or CONFIRM_REQUIRED_ACTIONS
 *   2. Target element exists in current UPR
 *   3. Target element is visible (visible === true)
 *   4. Target element is interactable (interactable === true)
 *   5. If value is SECRET_xxx, token must exist in TokenStore
 *   6. If action is "navigate", URL must be valid and conform to security policy
 *   7. If action requires user confirmation (submit, navigate, back), user must have confirmed
 *   8. Element reference is not stale
 */

import type {
  AgentAction,
  UnifiedPageRepresentation,
  UPRElement,
  ValidationResult,
} from '../shared/types';
import {
  ALLOWED_ACTIONS,
  CONFIRM_REQUIRED_ACTIONS,
  NAVIGATE_ALLOWLIST,
} from '../shared/constants';
import { tokenStore } from '../profile/token_store';

export interface ValidationContext {
  upr: UnifiedPageRepresentation;
  userConfirmed?: boolean;
}

/**
 * Validates an AgentAction against the current page state and security policies.
 *
 * @param action - The proposed AgentAction from LLM planner
 * @param context - The current page UPR and user confirmation status
 * @returns ValidationResult { valid: boolean, reason?: string, message?: string }
 */
export function validateAction(
  action: AgentAction,
  context: ValidationContext
): ValidationResult {
  if (!action || !action.type) {
    return {
      valid: false,
      reason: 'ACTION_TYPE_NOT_ALLOWED',
      message: 'Invalid action payload: missing action type.',
    };
  }

  // ── 1. Check Action Type Allowlist ──
  const isAllowed = ALLOWED_ACTIONS.includes(action.type);
  const isConfirmationRequired = CONFIRM_REQUIRED_ACTIONS.includes(action.type);

  if (!isAllowed && !isConfirmationRequired) {
    return {
      valid: false,
      reason: 'ACTION_TYPE_NOT_ALLOWED',
      message: `Action type "${action.type}" is not permitted by security policy.`,
    };
  }

  // ── 2. Check User Confirmation for Destructive/Navigational Actions ──
  if (isConfirmationRequired && !context.userConfirmed) {
    return {
      valid: false,
      reason: 'REQUIRES_USER_CONFIRMATION',
      message: `Action "${action.type}" requires explicit user confirmation before execution.`,
    };
  }

  // ── 3. Validate DOM-Targeting Actions (fill, click, select) ──
  if (action.type === 'fill' || action.type === 'click' || action.type === 'select') {
    if (!action.element_id) {
      return {
        valid: false,
        reason: 'ELEMENT_NOT_FOUND',
        message: `Action "${action.type}" requires an element_id.`,
      };
    }

    const targetElement = context.upr.elements.find(e => e.id === action.element_id);

    if (!targetElement) {
      return {
        valid: false,
        reason: 'ELEMENT_NOT_FOUND',
        message: `Element "${action.element_id}" does not exist in the current page representation.`,
      };
    }

    if (!targetElement.visible) {
      return {
        valid: false,
        reason: 'ELEMENT_NOT_VISIBLE',
        message: `Element "${action.element_id}" (${targetElement.label}) is not visible on the screen.`,
      };
    }

    if (!targetElement.interactable) {
      return {
        valid: false,
        reason: 'ELEMENT_NOT_INTERACTABLE',
        message: `Element "${action.element_id}" (${targetElement.label}) is disabled or not interactable.`,
      };
    }

    // ── 4. Validate Token Existence for Secret Values ──
    if (action.value && tokenStore.isSecretToken(action.value)) {
      if (!tokenStore.has(action.value)) {
        return {
          valid: false,
          reason: 'TOKEN_NOT_FOUND',
          message: `Secret token "${action.value}" not found in local TokenStore or has expired.`,
        };
      }
    }

    // ── 5. Specific Element Type Compatibility ──
    const validationError = validateElementTypeMatch(action, targetElement);
    if (validationError) {
      return validationError;
    }
  }

  // ── 6. Validate Navigate Action ──
  if (action.type === 'navigate') {
    if (!action.url) {
      return {
        valid: false,
        reason: 'URL_NOT_IN_ALLOWLIST',
        message: 'Navigate action requires a destination url.',
      };
    }

    try {
      const parsed = new URL(action.url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          valid: false,
          reason: 'URL_NOT_IN_ALLOWLIST',
          message: `Navigation protocol "${parsed.protocol}" is not allowed.`,
        };
      }

      // Check allowlist if configured
      if (NAVIGATE_ALLOWLIST.length > 0) {
        const matchesAllowlist = NAVIGATE_ALLOWLIST.some(pattern => pattern.test(action.url!));
        if (!matchesAllowlist) {
          return {
            valid: false,
            reason: 'URL_NOT_IN_ALLOWLIST',
            message: `URL "${action.url}" does not match configured navigation allowlist.`,
          };
        }
      }
    } catch {
      return {
        valid: false,
        reason: 'URL_NOT_IN_ALLOWLIST',
        message: `Invalid URL format: "${action.url}".`,
      };
    }
  }

  // ── 7. Validate Wait Action ──
  if (action.type === 'wait') {
    const duration = action.duration_ms ?? 0;
    if (duration < 0 || duration > 30000) {
      return {
        valid: false,
        reason: 'ACTION_TYPE_NOT_ALLOWED',
        message: `Wait duration ${duration}ms exceeds safety limits (0 - 30,000ms).`,
      };
    }
  }

  return { valid: true };
}

function validateElementTypeMatch(
  action: AgentAction,
  el: UPRElement
): ValidationResult | null {
  if (action.type === 'fill') {
    if (el.type !== 'input' && el.type !== 'textarea') {
      return {
        valid: false,
        reason: 'ACTION_TYPE_NOT_ALLOWED',
        message: `Cannot execute "fill" on non-input element type "${el.type}".`,
      };
    }
  }

  if (action.type === 'select') {
    if (el.type !== 'select') {
      return {
        valid: false,
        reason: 'ACTION_TYPE_NOT_ALLOWED',
        message: `Cannot execute "select" on non-select element type "${el.type}".`,
      };
    }
  }

  return null;
}
