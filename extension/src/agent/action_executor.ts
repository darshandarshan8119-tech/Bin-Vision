/**
 * action_executor.ts
 *
 * Phase 5 core module.
 *
 * Executes validated AgentActions in the live DOM with full modern framework
 * compatibility (React, Vue, Angular, vanilla forms).
 *
 * Responsibilities:
 *   1. Resolve SECRET_xxx tokens to real raw values via TokenStore.
 *   2. For password fields, inject credentials directly from UserProfileStore (zero tokenization).
 *   3. Dispatch synthetic events (InputEvent, ChangeEvent, KeyboardEvents) to trigger reactive form state.
 *   4. Safe DOM targeting via HTML id, unique CSS path, and coordinate fallbacks.
 *   5. Return structured ActionResult reporting execution success or error.
 */

import type {
  ActionResult,
  AgentAction,
  UnifiedPageRepresentation,
  UPRElement,
} from '../shared/types';
import { tokenStore } from '../profile/token_store';
import { userProfileStore } from '../profile/user_profile_store';
import { validateAction, type ValidationContext } from './action_validator';
import { logger } from '../shared/logger';

/**
 * Validates and executes an AgentAction in the DOM.
 *
 * @param action - Proposed action to execute
 * @param upr - Current UnifiedPageRepresentation
 * @param userConfirmed - Whether user confirmed a destructive action
 * @returns ActionResult reporting success or failure
 */
export async function executeAction(
  action: AgentAction,
  upr: UnifiedPageRepresentation,
  userConfirmed = false
): Promise<ActionResult> {
  const context: ValidationContext = { upr, userConfirmed };
  const validation = validateAction(action, context);

  if (!validation.valid) {
    logger.warn(`Action "${action.action_id}" (${action.type}) rejected by validator:`, validation.message);
    return {
      action_id: action.action_id,
      success: false,
      error: validation.message,
    };
  }

  try {
    switch (action.type) {
      case 'fill':
        return await executeFill(action, upr);
      case 'click':
      case 'submit':
        return await executeClick(action, upr);
      case 'select':
        return await executeSelect(action, upr);
      case 'scroll':
        return await executeScroll(action);
      case 'wait':
        return await executeWait(action);
      case 'navigate':
        return await executeNavigate(action);
      case 'back':
        return await executeBack(action);
      default:
        return {
          action_id: action.action_id,
          success: false,
          error: `Unhandled action type: ${(action as any).type}`,
        };
    }
  } catch (err: any) {
    logger.error(`Error executing action ${action.action_id}:`, err);
    return {
      action_id: action.action_id,
      success: false,
      error: err?.message || 'Unknown execution error',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Handlers
// ─────────────────────────────────────────────────────────────────────────────

async function executeFill(
  action: AgentAction,
  upr: UnifiedPageRepresentation
): Promise<ActionResult> {
  const targetMeta = upr.elements.find(e => e.id === action.element_id)!;
  const domNode = findDOMElement(targetMeta);

  if (!domNode) {
    return {
      action_id: action.action_id,
      success: false,
      error: `Could not locate DOM element for ${action.element_id}`,
    };
  }

  // ── Resolve Value: TokenStore vs Direct Password vs Plain Text ──
  let finalValue: string;

  if (targetMeta.htmlType === 'password' || targetMeta.semantic === 'PASSWORD' || targetMeta.semantic === 'CONFIRM_PASSWORD') {
    // SECURITY: Passwords are NEVER tokenized. Directly query local profile store.
    const hostname = typeof window !== 'undefined' ? window.location.hostname : undefined;
    const resolvedPwd = userProfileStore.resolveField('PASSWORD', hostname);
    if (!resolvedPwd) {
      return {
        action_id: action.action_id,
        success: false,
        error: `No stored password available for domain "${hostname}".`,
      };
    }
    finalValue = resolvedPwd;
  } else if (action.value && tokenStore.isSecretToken(action.value)) {
    const rawVal = tokenStore.resolve(action.value);
    if (!rawVal) {
      return {
        action_id: action.action_id,
        success: false,
        error: `Token ${action.value} expired or not found.`,
      };
    }
    finalValue = rawVal;
  } else {
    finalValue = action.value ?? '';
  }

  // Focus and clear existing value
  domNode.focus();
  const inputEl = domNode as HTMLInputElement | HTMLTextAreaElement;

  // React / Vue synthetic property setter bypass
  const proto = domNode instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;

  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(inputEl, finalValue);
  } else {
    inputEl.value = finalValue;
  }

  // Dispatch full lifecycle of input and change events
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  inputEl.blur();

  logger.info(`Filled element ${action.element_id} (${targetMeta.label})`);
  return { action_id: action.action_id, success: true };
}

async function executeClick(
  action: AgentAction,
  upr: UnifiedPageRepresentation
): Promise<ActionResult> {
  const targetMeta = upr.elements.find(e => e.id === action.element_id)!;
  const domNode = findDOMElement(targetMeta);

  if (!domNode) {
    return {
      action_id: action.action_id,
      success: false,
      error: `Could not locate DOM element for ${action.element_id}`,
    };
  }

  domNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
  domNode.focus();

  // Dispatch mouse click event sequence
  domNode.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  domNode.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  domNode.click();

  logger.info(`Clicked element ${action.element_id} (${targetMeta.label})`);
  return { action_id: action.action_id, success: true };
}

async function executeSelect(
  action: AgentAction,
  upr: UnifiedPageRepresentation
): Promise<ActionResult> {
  const targetMeta = upr.elements.find(e => e.id === action.element_id)!;
  const domNode = findDOMElement(targetMeta) as HTMLSelectElement | null;

  if (!domNode || domNode.tagName !== 'SELECT') {
    return {
      action_id: action.action_id,
      success: false,
      error: `Target element ${action.element_id} is not a <select> element.`,
    };
  }

  let rawVal = action.value?.trim() ?? '';
  if (tokenStore.isSecretToken(rawVal)) {
    const resolved = tokenStore.resolve(rawVal);
    if (resolved) {
      rawVal = resolved;
    }
  }
  const requestedVal = rawVal.toLowerCase();
  let matchedOption: HTMLOptionElement | null = null;

  // Match by value or option innerText
  for (const option of Array.from(domNode.options)) {
    if (
      option.value.toLowerCase() === requestedVal ||
      option.text.trim().toLowerCase() === requestedVal ||
      option.text.trim().toLowerCase().includes(requestedVal)
    ) {
      matchedOption = option;
      break;
    }
  }

  if (!matchedOption) {
    return {
      action_id: action.action_id,
      success: false,
      error: `Option "${action.value}" not found in dropdown options.`,
    };
  }

  domNode.value = matchedOption.value;
  domNode.dispatchEvent(new Event('input', { bubbles: true }));
  domNode.dispatchEvent(new Event('change', { bubbles: true }));

  logger.info(`Selected option "${matchedOption.text}" in element ${action.element_id}`);
  return { action_id: action.action_id, success: true };
}

async function executeScroll(action: AgentAction): Promise<ActionResult> {
  if (typeof window !== 'undefined') {
    const delta = action.direction === 'up' ? -500 : 500;
    window.scrollBy({ top: delta, behavior: 'smooth' });
  }
  return { action_id: action.action_id, success: true };
}

async function executeWait(action: AgentAction): Promise<ActionResult> {
  const ms = action.duration_ms ?? 500;
  await new Promise(resolve => setTimeout(resolve, ms));
  return { action_id: action.action_id, success: true };
}

async function executeNavigate(action: AgentAction): Promise<ActionResult> {
  if (typeof window !== 'undefined' && action.url) {
    window.location.href = action.url;
  }
  return { action_id: action.action_id, success: true };
}

async function executeBack(action: AgentAction): Promise<ActionResult> {
  if (typeof window !== 'undefined' && window.history) {
    window.history.back();
  }
  return { action_id: action.action_id, success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM Node Lookup Helper
// ─────────────────────────────────────────────────────────────────────────────

export function findDOMElement(meta: UPRElement): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  // 1. Try HTML ID (fastest & most reliable)
  if (meta.htmlId) {
    const node = document.getElementById(meta.htmlId);
    if (node) return node;
  }

  // 2. Try CSS domPath
  if (meta.domPath) {
    try {
      const node = document.querySelector<HTMLElement>(meta.domPath);
      if (node) return node;
    } catch {
      // Ignored
    }
  }

  // 3. Try name attribute
  if (meta.htmlName) {
    const escapedName = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
      ? CSS.escape(meta.htmlName)
      : meta.htmlName.replace(/(["\\])/g, '\\$1');
    const node = document.querySelector<HTMLElement>(`[name="${escapedName}"]`);
    if (node) return node;
  }

  return null;
}
