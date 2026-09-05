/**
 * content/index.ts
 *
 * Content script entry point — injected into every webpage.
 *
 * Phase 1 responsibilities:
 *   1. Run DOM analysis when the page finishes loading
 *   2. Send the analysis result to the service worker
 *   3. Log results to the browser console for Phase 1 verification
 *
 * Phase 9:
 *   - Agent loop execution via START_TASK message from popup
 *   - Local planProvider fills form fields from encrypted profile (no server required)
 *
 * Privacy model:
 *   - Raw PII never leaves the device.
 *   - Profile data is loaded from the encrypted local vault (default dev PIN: 0000).
 *   - All values passed to actions are SECRET_xxx tokens, resolved locally before DOM write.
 */

import { analyzePage } from '../perception/dom_analyzer';
import { buildUPR } from '../perception/unified_page_rep';
import { agentLoop } from '../agent/agent_loop';
import { createLocalPlanProvider } from '../agent/local_planner';
import { userProfileStore, DEFAULT_PROFILE } from '../profile/user_profile_store';
import { redactUPR, verifySanitization } from '../privacy/redactor';
import { logger } from '../shared/logger';
import type { ContentToWorkerMessage } from '../shared/types';

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

// Only run on real web pages, not on Chrome internal pages
if (
  window.location.protocol === 'http:' ||
  window.location.protocol === 'https:' ||
  window.location.protocol === 'file:'
) {
  init();
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

function init(): void {
  logger.info(`Content script loaded on: ${window.location.href}`);

  // Run analysis when the DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAnalysis);
  } else {
    // DOM already loaded (script injected with run_at: document_idle)
    runAnalysis();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline: Perception (Phase 1-2) + Privacy Engine (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

async function runAnalysis(): Promise<void> {
  try {
    logger.info('Starting DOM analysis & semantic classification...');

    // Phase 1: DOM analysis
    const domResult = analyzePage();

    // Phase 2: Build Unified Page Representation (UPR)
    const rawUPR = await buildUPR(domResult);

    // Phase 3: Redact PII to produce Sanitized UPR
    const sanitizedUPR = redactUPR(rawUPR);
    const audit = verifySanitization(sanitizedUPR);

    // ── Console output for Phase 2 & 3 verification ──
    console.group('%c🧠 BIN-Vision — Unified Page Representation (UPR)', 'color: #8b5cf6; font-weight: bold;');
    console.info(`Page: "${sanitizedUPR.page.title}"`);
    console.info(`URL: ${sanitizedUPR.page.url}`);
    console.info(`Overall Confidence: ${(sanitizedUPR.overall_confidence * 100).toFixed(0)}%`);
    console.info(`Detected Forms: ${sanitizedUPR.forms.length}`, sanitizedUPR.forms);
    console.info(`Privacy Status: ${audit.safe ? '🛡️ ZERO RAW PII LEAKED (Passed Audit)' : '⚠️ LEAK DETECTED'}`);

    console.table(
      sanitizedUPR.elements.map(el => ({
        id: el.id,
        label: el.label,
        type: el.type,
        semantic: el.semantic,
        value: el.value ?? '—',
        confidence: `${(el.confidence * 100).toFixed(0)}%`,
        pii: el.pii ? '🔒 YES' : 'NO',
        htmlType: el.htmlType ?? '—',
      }))
    );
    console.info('Sanitized UPR Object:', sanitizedUPR);
    console.groupEnd();

    // ── Send Sanitized UPR to service worker ──
    const message: ContentToWorkerMessage = {
      type: 'UPR_GENERATED',
      payload: sanitizedUPR,
    };

    try {
      await chrome.runtime.sendMessage(message);
    } catch (err) {
      // Service worker may not be ready on first load — this is non-fatal
      logger.debug('Could not send to service worker (may not be ready)', err);
    }

  } catch (err) {
    logger.error('Privacy perception pipeline failed', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Loop: START_TASK handler
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_TASK') {
    const goal: string = message.goal ?? '';
    logger.info(`[BIN-Vision] Task received: "${goal}"`);

    // Acknowledge receipt immediately so popup does not time out
    sendResponse({ ok: true });

    // Run the full agent loop asynchronously (does not block the listener)
    runAgentTask(goal).catch((err) => {
      logger.error('[BIN-Vision] Agent task runner error', err);
    });
  }

  // Return true to keep the message channel open for async sendResponse
  return true;
});

/**
 * Loads the user profile vault and drives the full AgentLoop cycle.
 *
 * Flow:
 *   1. Load profile from encrypted IndexedDB vault (default dev PIN: 0000).
 *   2. Create a LocalPlanProvider that maps tokenized UPR fields → actions.
 *   3. Start the AgentLoop with planProvider.
 *   4. Log the summary result.
 *
 * @param goal - Natural-language task description from the popup
 */
async function runAgentTask(goal: string): Promise<void> {
  logger.info('[BIN-Vision] Starting agent task pipeline...');

  // ── Step 1: Ensure user profile is loaded into memory ──
  if (!userProfileStore.getProfile()) {
    logger.info('[BIN-Vision] Loading user profile from vault...');
    let profile = await userProfileStore.loadProfile('0000');
    if (!profile) {
      logger.info('[BIN-Vision] Vault empty — auto-initializing with default profile...');
      await userProfileStore.saveProfile(DEFAULT_PROFILE, '0000');
      profile = userProfileStore.getProfile();
    }
    if (profile) {
      logger.info('[BIN-Vision] User profile loaded successfully.');
    } else {
      logger.warn('[BIN-Vision] Could not initialize user profile.');
    }
  } else {
    logger.info('[BIN-Vision] User profile already in memory.');
  }

  // ── Step 2: Create local plan provider ──
  // This is a server-free planner that reads tokenized UPR elements and
  // returns fill / select actions. Raw PII values are NEVER included —
  // actions carry SECRET_xxx tokens that are resolved to real values
  // locally inside action_executor immediately before DOM write.
  const planProvider = createLocalPlanProvider(goal);

  // ── Step 3: Run the AgentLoop ──
  logger.info('[BIN-Vision] Handing control to AgentLoop...');

  const summary = await agentLoop.startTask(goal, {
    planProvider,
    onStateChange: (state, step, details) => {
      logger.info(
        `[AgentLoop] State → ${state} (step ${step})${details ? `: ${details}` : ''}`
      );
    },
    onActionComplete: (action, result) => {
      if (result.success) {
        logger.info(`[AgentLoop] ✅ Action ${action.type} on ${action.element_id ?? 'n/a'} succeeded`);
      } else {
        logger.warn(`[AgentLoop] ❌ Action ${action.type} failed: ${result.error}`);
      }
    },
  });

  // ── Step 4: Log result ──
  if (summary.success) {
    logger.info(
      `[BIN-Vision] ✅ Task complete! Steps: ${summary.stepsCompleted}, ` +
      `Actions executed: ${summary.actionsExecuted}. ${summary.finalReasoning}`
    );
  } else {
    logger.warn(
      `[BIN-Vision] ⚠️ Task ended. Steps: ${summary.stepsCompleted}, ` +
      `Actions: ${summary.actionsExecuted}. Reason: ${summary.finalReasoning ?? summary.error}`
    );
  }
}