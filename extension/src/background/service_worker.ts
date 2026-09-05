/**
 * service_worker.ts
 *
 * Chrome MV3 Background Service Worker for BIN-Vision.
 *
 * Phase 1 responsibilities:
 *   - Listen for DOM analysis results from content scripts
 *   - Log analysis results (for Phase 1 verification)
 *   - Handle extension install / startup events
 *
 * Future phases will add:
 *   - WebSocket connection to FastAPI backend (Phase 6)
 *   - Forwarding sanitized UPR to server (Phase 6)
 *   - Receiving and routing agent actions (Phase 6)
 */

import { logger } from '../shared/logger';
import type { ContentToWorkerMessage, WorkerToContentMessage } from '../shared/types';

// ─────────────────────────────────────────────────────────────────────────────
// Extension Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  logger.info('BIN-Vision installed', {
    reason: details.reason,
    version: chrome.runtime.getManifest().version,
  });
});

chrome.runtime.onStartup.addListener(() => {
  logger.info('BIN-Vision service worker started');
});

// ─────────────────────────────────────────────────────────────────────────────
// Content Script Message Handler
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: ContentToWorkerMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: WorkerToContentMessage | { ok: boolean }) => void
  ) => {
    const tabId = sender.tab?.id;
    const url   = sender.tab?.url ?? 'unknown';

    switch (message.type) {
      case 'PAGE_ANALYZED': {
        const { elements, analysisTime, pageTitle } = message.payload;

        logger.info(`[Tab ${tabId}] Page analyzed: "${pageTitle}"`, {
          url,
          elementCount: elements.length,
          analysisTimeMs: analysisTime.toFixed(1),
        });

        sendResponse({ ok: true });
        break;
      }

      case 'UPR_GENERATED': {
        const upr = message.payload;
        logger.info(`[Tab ${tabId}] UPR generated for: "${upr.page.title}"`, {
          url,
          elementsCount: upr.elements.length,
          formsCount: upr.forms.length,
          confidence: `${(upr.overall_confidence * 100).toFixed(0)}%`,
          forms: upr.forms.map(f => `${f.form_id} (${f.semantic_purpose})`),
        });

        sendResponse({ ok: true });
        break;
      }

      case 'ACTION_RESULT': {
        logger.info(`[Tab ${tabId}] Action result`, message.payload);
        sendResponse({ ok: true });
        break;
      }

      case 'REQUEST_TASK': {
        logger.info(`[Tab ${tabId}] Task requested: "${message.goal}"`);
        // Phase 6: Forward to backend and return actions.
        // Phase 1: Just acknowledge.
        sendResponse({ ok: true });
        break;
      }

      default: {
        logger.warn('Service worker received unknown message type');
        sendResponse({ ok: false });
      }
    }

    // Return true to keep the message channel open for async responses
    return true;
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tab Management
// ─────────────────────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  logger.debug(`Tab ${tabId} closed — token stores will be cleared by content script`);
  // Phase 4: Token store cleanup will be triggered here
});

logger.info('BIN-Vision service worker initialized');
