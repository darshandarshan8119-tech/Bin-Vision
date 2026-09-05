/**
 * types.ts
 *
 * Central type definitions for the entire BIN-Vision project.
 * All modules import from here. Never define types inline elsewhere.
 *
 * Organized by layer:
 *   1. Core primitives
 *   2. DOM / Perception types (Phase 1-2)
 *   3. Privacy / PII types (Phase 3-4)
 *   4. Unified Page Representation (Phase 2+)
 *   5. Agent / Action types (Phase 5-6)
 *   6. Messaging types (Phase 6)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Core Primitives
// ─────────────────────────────────────────────────────────────────────────────

/** [x, y, width, height] in document-absolute pixels */
export type BBox = [number, number, number, number];

/** Where did this element's data come from? */
export type PerceptionSource = 'dom' | 'ocr' | 'vision';

/** Semantic element types */
export type ElementType =
  | 'input'
  | 'button'
  | 'link'
  | 'select'
  | 'textarea'
  | 'image'
  | 'text'
  | 'form';

/**
 * Semantic meaning of a form field.
 * Used in Phase 2 (Semantic Classifier).
 */
export type SemanticType =
  | 'NAME'
  | 'FIRST_NAME'
  | 'LAST_NAME'
  | 'EMAIL'
  | 'PHONE'
  | 'PASSWORD'
  | 'CONFIRM_PASSWORD'
  | 'DATE'
  | 'DATE_OF_BIRTH'
  | 'ADDRESS'
  | 'CITY'
  | 'STATE'
  | 'COUNTRY'
  | 'PINCODE'
  | 'USERNAME'
  | 'SEARCH'
  | 'SUBMIT'
  | 'NAV'
  | 'CAPTCHA'
  | 'OTP'
  | 'CARD_NUMBER'
  | 'CARD_EXPIRY'
  | 'CARD_CVV'
  | 'AADHAAR'
  | 'PAN'
  | 'FACE'
  | 'DOCUMENT'
  | 'OTHER';

/** PII category types used in redaction */
export type PIICategory =
  | 'NAME'
  | 'EMAIL'
  | 'PHONE'
  | 'CARD'
  | 'AADHAAR'
  | 'PAN'
  | 'PASSWORD'
  | 'ADDRESS'
  | 'DATE_OF_BIRTH'
  | 'OTP'
  | 'CVV'
  | 'FACE'
  | 'DOCUMENT'
  | 'OTHER_PII';

// ─────────────────────────────────────────────────────────────────────────────
// 2. DOM / Perception Types (Phase 1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw element extracted directly from the DOM.
 * No semantic classification or PII detection applied yet.
 */
export interface RawElement {
  /** Generated stable ID for this session: "e1", "e2", ... */
  id: string;

  /** Uppercase tag name: INPUT, BUTTON, A, SELECT, TEXTAREA, etc. */
  tagName: string;

  /** Resolved element type */
  type: ElementType;

  /** HTML type attribute (for <input>): text, email, password, checkbox, etc. */
  htmlType?: string;

  /** HTML id attribute */
  htmlId?: string;

  /** HTML name attribute */
  htmlName?: string;

  /** Resolved human-readable label (8 fallback strategies applied) */
  label: string;

  /** placeholder attribute */
  placeholder?: string;

  /**
   * Current value of the element.
   * SECURITY: Always undefined for password fields.
   */
  value?: string;

  /** aria-label attribute */
  ariaLabel?: string;

  /** autocomplete attribute */
  autocomplete?: string;

  /** Bounding box in document-absolute coordinates */
  bbox: BBox;

  /** Is the element currently visible? */
  visible: boolean;

  /** Is the element interactable (not disabled, not hidden)? */
  interactable: boolean;

  /** Inner text content (for buttons and links, max 100 chars) */
  innerText?: string;

  /** href attribute (for links) */
  href?: string;

  /** Unique CSS selector path to this element */
  domPath: string;

  /** Key HTML attributes for semantic understanding */
  attributes: Record<string, string>;
}

/** Return type of analyzePage() */
export interface DOMAnalysisResult {
  elements: RawElement[];
  /** Time taken for DOM analysis in milliseconds */
  analysisTime: number;
  pageTitle: string;
  pageUrl: string;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Privacy / PII Types (Phase 3-4)
// ─────────────────────────────────────────────────────────────────────────────

export interface PIIMatch {
  category: PIICategory;
  value: string;
  start: number;
  end: number;
  source: 'dom' | 'regex' | 'nlp' | 'ocr';
  confidence: number;
}

export interface PIIField {
  elementId: string;
  category: PIICategory;
  originalValue: string;
  redactedValue: string;
  token?: string; // SECRET_xxx if tokenized
}

export interface UserProfile {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  username?: string;
  aadhaar?: string;
  pan?: string;
  passwords?: Record<string, string>;
  customFields?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Unified Page Representation (Phase 2+)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fully enriched element: has semantic label, source, confidence, PII info.
 * This is what goes into the UPR.
 */
export interface UPRElement extends RawElement {
  semantic: SemanticType;
  source: PerceptionSource;
  confidence: number;
  pii: boolean;
  tokenized?: string; // "SECRET_xxx" if pii=true and field needs to be filled
}

export interface UPRForm {
  form_id: string;
  element_ids: string[];
  action?: string;
  method?: string;
  semantic_purpose?: 'REGISTRATION' | 'LOGIN' | 'PAYMENT' | 'SEARCH' | 'CONTACT' | 'OTHER';
}

export interface UPRPage {
  title: string;
  url: string;
  /** SHA-256 hex hash of outerHTML — used for cache invalidation */
  snapshot_hash: string;
  timestamp: number;
}

export interface UnifiedPageRepresentation {
  page: UPRPage;
  elements: UPRElement[];
  forms: UPRForm[];
  perception_source: PerceptionSource[];
  overall_confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Agent / Action Types (Phase 5-6)
// ─────────────────────────────────────────────────────────────────────────────

export type ActionType =
  | 'fill'
  | 'click'
  | 'select'
  | 'scroll'
  | 'navigate'
  | 'wait'
  | 'submit'
  | 'back';

export interface AgentAction {
  action_id: string;
  type: ActionType;
  /** Reference to UPRElement.id — required for DOM-targeting actions */
  element_id?: string;
  /** For fill/select. May be "SECRET_xxx" */
  value?: string;
  /** For navigate */
  url?: string;
  /** For scroll */
  direction?: 'up' | 'down';
  /** For wait — milliseconds */
  duration_ms?: number;
  /** LLM's explanation for transparency panel */
  reason?: string;
}

export interface ActionResult {
  action_id: string;
  success: boolean;
  error?: string;
}

export type ValidationFailureReason =
  | 'ELEMENT_NOT_FOUND'
  | 'ELEMENT_NOT_VISIBLE'
  | 'ELEMENT_NOT_INTERACTABLE'
  | 'ACTION_TYPE_NOT_ALLOWED'
  | 'TOKEN_NOT_FOUND'
  | 'URL_NOT_IN_ALLOWLIST'
  | 'REQUIRES_USER_CONFIRMATION'
  | 'STALE_ELEMENT_REFERENCE';

export interface ValidationResult {
  valid: boolean;
  reason?: ValidationFailureReason;
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Messaging Types (Phase 6)
// ─────────────────────────────────────────────────────────────────────────────

/** Messages sent FROM content script TO service worker */
export type ContentToWorkerMessage =
  | { type: 'PAGE_ANALYZED'; payload: DOMAnalysisResult }
  | { type: 'UPR_GENERATED'; payload: UnifiedPageRepresentation }
  | { type: 'ACTION_RESULT'; payload: ActionResult }
  | { type: 'REQUEST_TASK'; goal: string };

/** Messages sent FROM service worker TO content script */
export type WorkerToContentMessage =
  | { type: 'EXECUTE_ACTION'; payload: AgentAction }
  | { type: 'TASK_DONE' }
  | { type: 'TASK_ERROR'; message: string };

/** WebSocket messages: Extension → Backend */
export interface ExtToBackendMessage {
  session_id: string;
  message_type: 'page_context' | 'action_result' | 'ping';
  goal?: string;
  upr?: UnifiedPageRepresentation;
  action_result?: ActionResult;
  step: number;
}

/** WebSocket messages: Backend → Extension */
export interface BackendToExtMessage {
  session_id: string;
  message_type: 'action' | 'done' | 'error' | 'pong';
  actions?: AgentAction[];
  reasoning?: string;
  done?: boolean;
  error?: string;
  step: number;
}
