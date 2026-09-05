/**
 * panel.ts
 *
 * Phase 10: Entry script for the Transparency Side Panel.
 */

import { transparencyController } from './transparency_controller';
import { logger } from '../../shared/logger';

document.addEventListener('DOMContentLoaded', () => {
  transparencyController.attachUI(document.body);
  logger.info('[TransparencyPanel] Initialized and bound to DOM');

  // Handle messages from service worker or content scripts if running in Chrome extension
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'UPR_GENERATED' && message.payload) {
        transparencyController.updatePerception(message.payload);
      } else if (message.type === 'STATE_CHANGE') {
        transparencyController.setLoopState(message.state, message.step, message.details);
      } else if (message.type === 'ACTION_LOG') {
        transparencyController.logAction(message.action, message.result, message.status);
      }
    });
  }
});

export { transparencyController };
