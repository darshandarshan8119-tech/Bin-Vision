/**
 * form_detector.ts
 *
 * Phase 2 core module.
 *
 * Groups interactive page elements into logical forms and detects their
 * semantic purpose (REGISTRATION, LOGIN, PAYMENT, SEARCH, CONTACT, OTHER).
 *
 * Design principles:
 *   - Handles standard HTML <form> elements
 *   - Handles modern SPAs / React apps where form fields are grouped in <div> containers without a <form> tag
 *   - Computes form purpose based on field combinations and submit action intent
 */

import type { UPRElement, UPRForm } from '../shared/types';

/**
 * Detects and groups form elements into logical UPRForm structures.
 *
 * @param elements - The semantically enriched UPRElements on the page
 * @returns Array of detected UPRForms
 */
export function detectForms(elements: UPRElement[]): UPRForm[] {
  // If running in browser environment with live DOM:
  if (typeof document !== 'undefined') {
    return detectFormsFromDOM(elements);
  }

  // Fallback heuristic clustering (useful for test environments without full DOM tree)
  return detectFormsHeuristic(elements);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM-based Form Grouping
// ─────────────────────────────────────────────────────────────────────────────

function detectFormsFromDOM(elements: UPRElement[]): UPRForm[] {
  const forms: UPRForm[] = [];
  const formMap: Map<HTMLFormElement, { formId: string; elementIds: string[]; action?: string; method?: string }> = new Map();
  const orphanElements: UPRElement[] = [];

  let formCounter = 0;

  for (const el of elements) {
    // Find matching DOM node using the unique CSS path or id
    let domNode: HTMLElement | null = null;
    if (el.htmlId) {
      domNode = document.getElementById(el.htmlId);
    }
    if (!domNode && el.domPath) {
      try {
        domNode = document.querySelector<HTMLElement>(el.domPath);
      } catch {
        // Selector may fail in edge cases
      }
    }

    const parentForm = domNode?.closest('form') as HTMLFormElement | null;

    if (parentForm) {
      if (!formMap.has(parentForm)) {
        formCounter++;
        const id = parentForm.id || `form_${formCounter}`;
        const action = parentForm.getAttribute('action') || undefined;
        const method = (parentForm.getAttribute('method') || 'POST').toUpperCase();
        formMap.set(parentForm, { formId: id, elementIds: [], action, method });
      }
      formMap.get(parentForm)!.elementIds.push(el.id);
    } else {
      orphanElements.push(el);
    }
  }

  // Convert map to UPRForm objects
  for (const [, formData] of formMap.entries()) {
    const formElements = elements.filter(e => formData.elementIds.includes(e.id));
    const purpose = detectFormPurpose(formElements);
    forms.push({
      form_id: formData.formId,
      element_ids: formData.elementIds,
      action: formData.action,
      method: formData.method,
      semantic_purpose: purpose,
    });
  }

  // If there are orphan input fields that were not inside a <form> (common in SPAs):
  if (orphanElements.length > 0) {
    // Filter down to elements that typically belong in a form (inputs, selects, textareas, submits)
    const formLikeElements = orphanElements.filter(
      e => e.type === 'input' || e.type === 'select' || e.type === 'textarea' || (e.type === 'button' && e.semantic === 'SUBMIT')
    );

    if (formLikeElements.length >= 2) {
      formCounter++;
      const elementIds = formLikeElements.map(e => e.id);
      const purpose = detectFormPurpose(formLikeElements);
      forms.push({
        form_id: `form_virtual_${formCounter}`,
        element_ids: elementIds,
        semantic_purpose: purpose,
      });
    }
  }

  return forms;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic Form Grouping (when DOM tree is unavailable)
// ─────────────────────────────────────────────────────────────────────────────

function detectFormsHeuristic(elements: UPRElement[]): UPRForm[] {
  const formLike = elements.filter(
    e => e.type === 'input' || e.type === 'select' || e.type === 'textarea' || e.semantic === 'SUBMIT'
  );

  if (formLike.length === 0) return [];

  const purpose = detectFormPurpose(formLike);
  return [
    {
      form_id: 'form_1',
      element_ids: formLike.map(e => e.id),
      semantic_purpose: purpose,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Semantic Purpose Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines whether a collection of form elements represents a
 * REGISTRATION, LOGIN, PAYMENT, SEARCH, CONTACT, or OTHER form.
 */
export function detectFormPurpose(
  formElements: UPRElement[]
): 'REGISTRATION' | 'LOGIN' | 'PAYMENT' | 'SEARCH' | 'CONTACT' | 'OTHER' {
  const semantics = new Set(formElements.map(e => e.semantic));
  const buttonTexts = formElements
    .filter(e => e.type === 'button' || e.htmlType === 'submit')
    .map(e => (e.innerText || e.label || '').toLowerCase());

  // ── 1. Payment Form ──
  if (semantics.has('CARD_NUMBER') || semantics.has('CARD_CVV') || semantics.has('CARD_EXPIRY')) {
    return 'PAYMENT';
  }

  // ── 2. Registration Form ──
  // Indicators: has confirm password, or has password + name fields, or button says register/signup
  const hasPassword = semantics.has('PASSWORD');
  const hasConfirmPassword = semantics.has('CONFIRM_PASSWORD');
  const hasName = semantics.has('NAME') || semantics.has('FIRST_NAME') || semantics.has('LAST_NAME');
  const hasRegistrationButton = buttonTexts.some(
    txt => txt.includes('register') || txt.includes('sign up') || txt.includes('create account') || txt.includes('join')
  );

  if (hasConfirmPassword || (hasPassword && hasName) || (hasPassword && hasRegistrationButton)) {
    return 'REGISTRATION';
  }

  // ── 3. Login Form ──
  // Indicators: has password, has email or username, but lacks registration indicators
  const hasIdentifier = semantics.has('EMAIL') || semantics.has('USERNAME');
  const hasLoginButton = buttonTexts.some(
    txt => txt.includes('login') || txt.includes('log in') || txt.includes('sign in')
  );

  if (hasPassword && (hasIdentifier || hasLoginButton)) {
    return 'LOGIN';
  }

  // ── 4. Search Form ──
  // Indicators: only search field(s) and submit button
  if (semantics.has('SEARCH') && formElements.length <= 4) {
    return 'SEARCH';
  }

  // ── 5. Contact Form ──
  // Indicators: textarea (message) + email or name
  const hasTextarea = formElements.some(e => e.type === 'textarea');
  if (hasTextarea && (hasName || semantics.has('EMAIL'))) {
    return 'CONTACT';
  }

  return 'OTHER';
}
