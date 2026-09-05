/**
 * local_planner.ts
 *
 * A built-in, server-free planning implementation for AgentLoop.
 *
 * When the extension operates without a FastAPI backend, this planner:
 *   1. Inspects the raw (live, tokenized) UPR for fillable form fields.
 *   2. Generates a deterministic sequence of fill / select / click actions.
 *   3. Returns a BackendToExtMessage-shaped response so AgentLoop's existing
 *      validation + execution pipeline works unchanged.
 *
 * Privacy model is preserved:
 *   - This planner receives the RAW (not yet redacted) UPR after tokenization
 *     has run (prepareTokensForFormFields was already called).
 *   - Action values are always SECRET_xxx tokens — never raw PII.
 *   - Token resolution to real values happens inside action_executor, locally.
 *
 * Limitations vs. server LLM:
 *   - No natural language goal understanding.
 *   - Fills all detected form fields; does not reason about which to skip.
 *   - Suitable for "fill this form with my profile" type tasks.
 */

import type {
  AgentAction,
  BackendToExtMessage,
  UnifiedPageRepresentation,
  ActionResult,
  UPRElement,
} from '../shared/types';
import { tokenStore } from '../profile/token_store';
import { logger } from '../shared/logger';


// Max steps before the local planner declares it is done
const LOCAL_PLANNER_MAX_FILL_STEPS = 2;

/**
 * Creates a planProvider function compatible with AgentLoopOptions.planProvider.
 *
 * @param goal - The natural-language goal (used for logging only)
 * @returns An async function that accepts (upr, step, lastResult) and returns a plan
 */
export function createLocalPlanProvider(
  goal: string
): (
  upr: UnifiedPageRepresentation,
  step: number,
  lastResult?: ActionResult
) => Promise<BackendToExtMessage> {
  logger.info(`[LocalPlanner] Created for goal: "${goal}"`);

  return async (
    upr: UnifiedPageRepresentation,
    step: number,
    _lastResult?: ActionResult
  ): Promise<BackendToExtMessage> => {
    logger.info(`[LocalPlanner] Planning step ${step} — ${upr.elements.length} elements, ${upr.forms.length} forms`);

    // After LOCAL_PLANNER_MAX_FILL_STEPS steps, signal completion to avoid endless loop
    if (step > LOCAL_PLANNER_MAX_FILL_STEPS) {
      logger.info('[LocalPlanner] All form fields processed. Signalling DONE.');
      return {
        session_id: 'local',
        message_type: 'done',
        step,
        actions: [],
        reasoning: 'All fillable form fields have been processed.',
        done: true,
      };
    }

    const actions: AgentAction[] = [];
    let actionIndex = 0;

    for (const el of upr.elements) {
      if (!el.visible || !el.interactable) continue;

      // ── Fill: text / email / tel / number inputs and textareas ──
      if (
        (el.type === 'input' || el.type === 'textarea') &&
        el.htmlType !== 'submit' &&
        el.htmlType !== 'button' &&
        el.htmlType !== 'checkbox' &&
        el.htmlType !== 'radio' &&
        el.htmlType !== 'hidden'
      ) {
        const fillValue = pickFillValue(el);
        if (fillValue) {
          actionIndex++;
          actions.push({
            action_id: `local_fill_${step}_${actionIndex}`,
            type: 'fill',
            element_id: el.id,
            value: fillValue,
            reason: `Fill ${el.label || el.semantic} field`,
          });
        }
        continue;
      }

      // ── Select: dropdown menus ──
      if (el.type === 'select') {
        const selectValue = pickFillValue(el);
        if (selectValue) {
          actionIndex++;
          actions.push({
            action_id: `local_select_${step}_${actionIndex}`,
            type: 'select',
            element_id: el.id,
            value: selectValue,
            reason: `Select value for ${el.label || el.semantic} field`,
          });
        }
        continue;
      }
    }

    if (actions.length === 0) {
      // No fillable fields found — declare done
      logger.info('[LocalPlanner] No actionable elements found. Signalling DONE.');
      return {
        session_id: 'local',
        message_type: 'done',
        step,
        actions: [],
        reasoning: 'No fillable or actionable form fields detected on this page.',
        done: true,
      };
    }

    logger.info(`[LocalPlanner] Step ${step}: generated ${actions.length} action(s)`);

    return {
      session_id: 'local',
      message_type: 'action',
      step,
      actions,
      reasoning: `Filling ${actions.length} form field(s) from profile data.`,
      done: false,
    };
  };
}

/**
 * Determines the best value to put into a UPRElement.
 *
 * Priority:
 *   1. el.tokenized (SECRET_xxx) — assigned by prepareTokensForFormFields
 *   2. el.value (already present in DOM, skip)
 *   3. null — no profile data available for this field
 */
function pickFillValue(el: UPRElement): string | null {
  // If prepareTokensForFormFields already assigned a real token in TokenStore, use it
  if (el.tokenized && tokenStore.has(el.tokenized)) {
    return el.tokenized;
  }

  // If the field already has a value, skip it
  if (el.value) {
    return null;
  }

  return null;
}
