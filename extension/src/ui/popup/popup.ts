/**
 * popup.ts
 *
 * Phase 10: Extension Action Popup Controller.
 */

import { userProfileStore } from '../../profile/user_profile_store';
import { logger } from '../../shared/logger';

document.addEventListener('DOMContentLoaded', async () => {
  const profileStatusEl = document.getElementById('bv-popup-profile-status');
  const launchBtn = document.getElementById('bv-popup-btn-launch');
  const openPanelBtn = document.getElementById('bv-popup-btn-open-panel');
  const goalInput = document.getElementById('bv-popup-goal-input') as HTMLInputElement | null;

  try {
    const profile = (await userProfileStore.loadProfile()) || userProfileStore.getProfile();
    const hasProf = profile !== null;
    if (profileStatusEl) {
      profileStatusEl.textContent = hasProf ? '🔒 Profile Loaded' : '⚠️ Vault Empty';
      profileStatusEl.style.color = hasProf ? '#34d399' : '#fcd34d';
    }
  } catch (err) {
    logger.warn('[Popup] Could not check profile status', err);
  }

  // Open side panel
  openPanelBtn?.addEventListener('click', async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.sidePanel) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.sidePanel.open({ tabId: tab.id });
          window.close();
        }
      }
    } catch (err) {
      logger.warn('[Popup] Could not open side panel', err);
    }
  });

  // Launch task
  launchBtn?.addEventListener('click', async () => {
    const goal = goalInput?.value?.trim();
    if (!goal) return;

    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'START_TASK',
            goal,
          });
          window.close();
        }
      }
    } catch (err) {
      logger.error('[Popup] Failed to send task to active tab', err);
    }
  });
});
