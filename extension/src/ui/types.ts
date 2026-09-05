/**
 * types.ts
 *
 * Phase 10: UI Transparency Panel & User Consent Types.
 */

import type { AgentAction, ActionResult, UPRElement } from '../shared/types';
import type { AgentLoopState } from '../agent/agent_loop';

export interface FormReviewItem {
  id: string;
  name?: string;
  label: string;
  semantic: string;
  value: string;
  isToken: boolean;
  isPII: boolean;
}

export interface ConsentRequest {
  action: AgentAction;
  actionType: string;
  targetElement?: UPRElement;
  formReviewItems: FormReviewItem[];
  destinationUrl?: string;
  warningMessage: string;
  reason?: string;
}

export interface LoggedActionItem {
  action: AgentAction;
  timestamp: number;
  result?: ActionResult;
  status: 'pending' | 'success' | 'failed' | 'rejected' | 'confirmation_required';
  validationMessage?: string;
}

export interface ActiveTokenBadge {
  token: string;
  semantic: string;
  maskedOriginal?: string;
}

export interface AgentPanelState {
  loopState: AgentLoopState;
  step: number;
  maxSteps: number;
  goal: string;
  pageTitle: string;
  pageUrl: string;
  overallConfidence: number;
  sanitizationSafe: boolean;
  activeTokens: ActiveTokenBadge[];
  detectedFormsCount: number;
  detectedElementsCount: number;
  actionsTimeline: LoggedActionItem[];
}
