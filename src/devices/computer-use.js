import { normalizeStepApprovals, stepApprovalMatches } from '../security/approval-gates.js';
export const COMPUTER_USE_SCHEMA = 'mel.devices.computer-use.v1';

export const COMPUTER_USE_RISK = Object.freeze({
  OBSERVE: 'OBSERVE',
  INTERACT: 'INTERACT',
  SENSITIVE: 'SENSITIVE',
  DENY: 'DENY',
});

export const COMPUTER_USE_ACTIONS = Object.freeze({
  SCREENSHOT: 'screen.capture',
  CURSOR_MOVE: 'cursor.move',
  CLICK: 'pointer.click',
  SCROLL: 'pointer.scroll',
  KEY_PRESS: 'keyboard.press',
  TYPE_TEXT: 'keyboard.type',
  OPEN_APP: 'app.open',
  BROWSER_NAVIGATE: 'browser.navigate',
  BROWSER_INSPECT: 'browser.inspect',
  BROWSER_CAPTURE: 'browser.capture',
  BROWSER_CLICK: 'browser.click',
  BROWSER_PRESS: 'browser.press',
  BROWSER_FIND: 'browser.find',
  BROWSER_FIND_NEXT: 'browser.find-next',
  BROWSER_FIND_PREVIOUS: 'browser.find-previous',
  BROWSER_NEXT_TAB: 'browser.next-tab',
  BROWSER_PREVIOUS_TAB: 'browser.previous-tab',
  BROWSER_SELECT_TAB: 'browser.select-tab',
  BROWSER_ZOOM_IN: 'browser.zoom-in',
  BROWSER_ZOOM_OUT: 'browser.zoom-out',
  BROWSER_ZOOM_RESET: 'browser.zoom-reset',
  BROWSER_OPEN_DOWNLOADS: 'browser.open-downloads',
  BROWSER_OPEN_HISTORY: 'browser.open-history',
  BROWSER_FOCUS_ADDRESS: 'browser.focus-address',
  BROWSER_SCROLL: 'browser.scroll',
  BROWSER_TYPE: 'browser.type',
  BROWSER_BACK: 'browser.back',
  BROWSER_NEW_TAB: 'browser.new-tab',
  BROWSER_CLOSE_TAB: 'browser.close-tab',
  BROWSER_REOPEN_TAB: 'browser.reopen-tab',
  BROWSER_TOGGLE_FULLSCREEN: 'browser.toggle-fullscreen',
  BROWSER_BOOKMARK_PAGE: 'browser.bookmark-page',
  BROWSER_FORWARD: 'browser.forward',
  BROWSER_RELOAD: 'browser.reload',
  CLOSE_APP: 'app.close',
  OPEN_FILE: 'file.open',
  CLOSE_FILE: 'file.close',
  CLIPBOARD_READ: 'clipboard.read',
  CLIPBOARD_WRITE: 'clipboard.write',
});

const ACTION_RISK = new Map([
  [COMPUTER_USE_ACTIONS.SCREENSHOT, COMPUTER_USE_RISK.OBSERVE],
  [COMPUTER_USE_ACTIONS.CURSOR_MOVE, COMPUTER_USE_RISK.INTERACT],
  [COMPUTER_USE_ACTIONS.CLICK, COMPUTER_USE_RISK.INTERACT],
  [COMPUTER_USE_ACTIONS.SCROLL, COMPUTER_USE_RISK.INTERACT],
  // Even an allowed shortcut can submit a form, paste private clipboard content,
  // save changes or switch applications. Each keypress needs owner step approval.
  [COMPUTER_USE_ACTIONS.KEY_PRESS, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.TYPE_TEXT, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.OPEN_APP, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_NAVIGATE, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_INSPECT, COMPUTER_USE_RISK.OBSERVE],
  [COMPUTER_USE_ACTIONS.BROWSER_CAPTURE, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_CLICK, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_PRESS, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_FIND, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_FIND_NEXT, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_FIND_PREVIOUS, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_NEXT_TAB, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_PREVIOUS_TAB, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_SELECT_TAB, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_ZOOM_IN, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_ZOOM_OUT, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_ZOOM_RESET, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_OPEN_DOWNLOADS, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_OPEN_HISTORY, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_FOCUS_ADDRESS, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_SCROLL, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_TYPE, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_BACK, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_NEW_TAB, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_CLOSE_TAB, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_REOPEN_TAB, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_TOGGLE_FULLSCREEN, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_BOOKMARK_PAGE, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_FORWARD, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.BROWSER_RELOAD, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.CLOSE_APP, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.OPEN_FILE, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.CLOSE_FILE, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.CLIPBOARD_READ, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.CLIPBOARD_WRITE, COMPUTER_USE_RISK.SENSITIVE],
]);

const RAW_EXECUTION_ACTIONS = new Set([
  'shell.exec',
  'process.spawn',
  'file.read',
  'file.write',
  'file.delete',
  'registry.write',
  'power.off',
  'power.restart',
]);

const MAX_STEPS = 100;
const MAX_TEXT = 4096;
const MAX_ID = 200;
const MAX_APP = 200;

 // Keep this allowlist aligned with the native Windows Key-Token function.
 // Raw SendKeys metacharacters (+, ^, %, ~, {, }, etc.) are not safe literals.
const WINDOWS_KEY_TOKENS = new Set([
  'ENTER', 'RETURN', 'TAB', 'ESC', 'ESCAPE', 'BACKSPACE', 'DELETE',
  'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME', 'END', 'PGUP', 'PGDN',
  'CTRL+L', 'CTRL+C', 'CTRL+V', 'CTRL+A', 'CTRL+S', 'ALT+TAB',
]);

function supportedWindowsKey(value) {
  if (typeof value !== 'string') return false;
  const key = value.trim().toUpperCase();
  return /^[A-Z0-9]$/.test(key)
    || /^F(?:[1-9]|1[0-2])$/.test(key)
    || WINDOWS_KEY_TOKENS.has(key);
}

function boundedText(value, max = MAX_ID) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function uniqueTexts(value, maxItems = 64, maxLength = MAX_APP) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => boundedText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Native Windows pointer operations consume integer coordinates and deltas.
// Validate the submitted values before numeric() could silently substitute 0.
function suppliedSafeInteger(value) {
  // PowerShell [int] / SetCursorPos / mouse_event consume signed 32-bit values.
  // Reject rather than overflow when JavaScript's safe integer is wider.
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim() !== '')) return false;
  const numericValue = Number(value);
  return Number.isInteger(numericValue)
    && numericValue >= -2147483648
    && numericValue <= 2147483647;
}

function validBrowserWindowHandle(value) {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)
    && BigInt(value) <= 9223372036854775807n;
}

// Find cycling only accepts the inspected window and step identity. Unknown
// fields must not be silently ignored: they can change the owner's intent.
const FIND_CYCLE_ALLOWED_FIELDS = new Set(['id', 'action', 'window_handle']);
// browser.find accepts only the inspected window and search text.
// Reject unexpected execution targets instead of silently discarding intent.
const BROWSER_FIND_ALLOWED_FIELDS = new Set(['id', 'action', 'window_handle', 'text']);
const BROWSER_NAVIGATION_KEYS = new Set([
  'ENTER', 'RETURN', 'TAB', 'ESC', 'ESCAPE', 'BACKSPACE', 'DELETE',
  'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME', 'END', 'PGUP', 'PGDN',
]);

function normalizeOrigin(value) {
  const raw = boundedText(value, 2048);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.origin : '';
  } catch {
    return '';
  }
}

function normalizedCapabilities(device = {}) {
  const raw = Array.isArray(device.capabilities) ? device.capabilities : [];
  return new Set(raw.map(item => boundedText(item, 160)).filter(Boolean));
}

function appAllowed(app, allowlist) {
  if (!app) return true;
  return allowlist.includes(app);
}

function originAllowed(url, allowlist) {
  if (!url) return true;
  const origin = normalizeOrigin(url);
  return Boolean(origin) && allowlist.includes(origin);
}

function normalizeLocalPath(value) {
  const raw = boundedText(value, 4096).replace(/\//g, '\\');
  if (!raw || raw.includes('\0')) return '';
  if (/^\\\\/.test(raw)) return '';
  if (!/^[A-Za-z]:\\/.test(raw)) return '';
  const parts = raw.split('\\').filter(Boolean);
  if (parts.some(part => part === '..' || part === '.')) return '';
  const drive = parts.shift();
  return [drive.toUpperCase(), ...parts].join('\\');
}

function pathAllowed(path, allowlist) {
  if (!path) return true;
  const candidate = normalizeLocalPath(path);
  if (!candidate) return false;
  const lower = candidate.toLowerCase();
  return allowlist.some(root => {
    const normalizedRoot = normalizeLocalPath(root);
    if (!normalizedRoot) return false;
    const rootLower = normalizedRoot.toLowerCase().replace(/\\+$/,'');
    return lower === rootLower || lower.startsWith(rootLower + '\\');
  });
}

export function classifyComputerUseAction(action) {
  const normalized = boundedText(action, 160);
  if (!normalized || RAW_EXECUTION_ACTIONS.has(normalized)) return COMPUTER_USE_RISK.DENY;
  return ACTION_RISK.get(normalized) || COMPUTER_USE_RISK.DENY;
}

export function normalizeComputerUseRequest(input = {}) {
  const rawSandbox = input.sandbox && typeof input.sandbox === 'object' ? input.sandbox : {};
  const maxSteps = Math.max(1, Math.min(MAX_STEPS, Math.trunc(numeric(rawSandbox.max_steps, 20)) || 20));
  const allowedApps = uniqueTexts(rawSandbox.allowed_apps);
  const allowedPaths = [...new Set(
    uniqueTexts(rawSandbox.allowed_paths, 64, 4096)
      .map(normalizeLocalPath)
      .filter(Boolean)
  )];
  const allowedOrigins = uniqueTexts(rawSandbox.allowed_origins, 64, 2048)
    .map(normalizeOrigin)
    .filter(Boolean);
  const rawSteps = Array.isArray(input.steps) ? input.steps.slice(0, maxSteps) : [];

  return {
    schema: COMPUTER_USE_SCHEMA,
    session_id: boundedText(input.session_id),
    owner_halt: input.owner_halt === true,
    device: {
      id: boundedText(input.device?.id),
      capabilities: uniqueTexts(input.device?.capabilities, 64, 160),
    },
    sandbox: {
      allowed_apps: allowedApps,
      allowed_paths: allowedPaths,
      allowed_origins: allowedOrigins,
      max_steps: maxSteps,
    },
    approvals: normalizeStepApprovals(input.approvals, MAX_STEPS),
    steps: rawSteps.map((step, index) => ({
      id: boundedText(step?.id) || `step-${index + 1}`,
      action: boundedText(step?.action, 160),
      app: boundedText(step?.app, MAX_APP),
      path: boundedText(step?.path, 4096),
      url: boundedText(step?.url, 2048),
      text: typeof step?.text === 'string' ? step.text.slice(0, MAX_TEXT) : '',
      x: numeric(step?.x),
      y: numeric(step?.y),
      delta_x: numeric(step?.delta_x),
      delta_y: numeric(step?.delta_y),
      key: boundedText(step?.key, 80),
      // Unmodified inspection HWND: a numeric handle is accepted only when exact in JS.
      tab_index: numeric(step?.tab_index),
      window_handle: typeof step?.window_handle === 'string'
        ? step.window_handle
        : Number.isSafeInteger(step?.window_handle) ? String(step.window_handle) : '',
    })),
  };
}

/**
 * GEN2-30 policy gate for provider-neutral Computer Use.
 *
 * This layer can express visual UI actions, but intentionally rejects raw
 * shell/process/file/power actions. Those belong to separately permissioned
 * device capabilities. The full plan fails closed if any step is unsafe.
 */
export function evaluateComputerUsePlan(input = {}) {
  const request = normalizeComputerUseRequest(input);
  const decisions = [];

  if (request.owner_halt) {
    return result(request, false, 'OWNER_HALT_ACTIVE', decisions);
  }
  if (!request.session_id || !request.device.id) {
    return result(request, false, 'SESSION_AND_DEVICE_REQUIRED', decisions);
  }
  if (!normalizedCapabilities(request.device).has('computer.use')) {
    return result(request, false, 'COMPUTER_USE_CAPABILITY_REQUIRED', decisions);
  }
  if (request.steps.length === 0) {
    return result(request, false, 'COMPUTER_USE_STEPS_REQUIRED', decisions);
  }
  // Refuse partial execution when normalization would silently truncate the plan.
  const submittedSteps = Array.isArray(input.steps) ? input.steps : [];
  if (submittedSteps.length > request.sandbox.max_steps) {
    return result(request, false, 'COMPUTER_USE_STEP_LIMIT_EXCEEDED', decisions);
  }
  if (submittedSteps.some(step => typeof step?.text === 'string' && step.text.length > MAX_TEXT)) {
    return result(request, false, 'COMPUTER_USE_TEXT_LIMIT_EXCEEDED', decisions);
  }
  // Reject fields before boundedText can alter the requested target or action.
  // A clipped URL, path or key must never be authorized as if the owner sent it.
  const fieldLimits = [
    ['id', MAX_ID], ['action', 160], ['app', MAX_APP],
    ['path', 4096], ['url', 2048], ['key', 80],
  ];
  if (submittedSteps.some(step => fieldLimits.some(([field, limit]) =>
    typeof step?.[field] === 'string' && step[field].length > limit))) {
    return result(request, false, 'COMPUTER_USE_STEP_FIELD_LIMIT_EXCEEDED', decisions);
  }

  const stepIds = new Set();
  for (const step of request.steps) {
    const risk = classifyComputerUseAction(step.action);
    let allowed = true;
    let reason = 'AUTHORIZED';

    if (stepIds.has(step.id)) {
      allowed = false;
      reason = 'DUPLICATE_STEP_ID';
    } else if (risk === COMPUTER_USE_RISK.DENY) {
      allowed = false;
      reason = 'ACTION_NOT_ALLOWED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_INSPECT
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action'].includes(field))) {
      // Inspection observes only the foreground browser. It cannot navigate,
      // choose another HWND, extract page text, or silently honor a target.
      allowed = false;
      reason = 'BROWSER_INSPECT_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.CLICK
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'app', 'url', 'path'].includes(field))) {
      // Native pointer.click is a single LEFT click at the current cursor.
      // x/y and button are not implemented and cannot be silently ignored.
      allowed = false;
      reason = 'POINTER_CLICK_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.SCROLL
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'delta_y', 'app', 'url', 'path'].includes(field))) {
      // Native pointer.scroll only supports vertical wheel deltas.
      allowed = false;
      reason = 'POINTER_SCROLL_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.CURSOR_MOVE
      && (!suppliedSafeInteger(submittedSteps[decisions.length]?.x)
        || !suppliedSafeInteger(submittedSteps[decisions.length]?.y))) {
      allowed = false;
      reason = 'POINTER_COORDINATES_INVALID';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_CLICK
      && (!suppliedSafeInteger(submittedSteps[decisions.length]?.x)
        || !suppliedSafeInteger(submittedSteps[decisions.length]?.y)
        || Number(submittedSteps[decisions.length].x) < -2147483648
        || Number(submittedSteps[decisions.length].x) > 2147483647
        || Number(submittedSteps[decisions.length].y) < -2147483648
        || Number(submittedSteps[decisions.length].y) > 2147483647)) {
      allowed = false;
      reason = 'BROWSER_CLICK_COORDINATES_INVALID';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_CLICK
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_CLICK_WINDOW_HANDLE_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_CLICK
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle', 'x', 'y'].includes(field))) {
      // Native browser.click always performs a LEFT click at x/y.
      // A requested right click, double click or other target cannot be ignored.
      allowed = false;
      reason = 'BROWSER_CLICK_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_SCROLL
      && (!suppliedSafeInteger(submittedSteps[decisions.length]?.x)
        || !suppliedSafeInteger(submittedSteps[decisions.length]?.y)
        || Number(submittedSteps[decisions.length].x) < -2147483648
        || Number(submittedSteps[decisions.length].x) > 2147483647
        || Number(submittedSteps[decisions.length].y) < -2147483648
        || Number(submittedSteps[decisions.length].y) > 2147483647)) {
      allowed = false;
      reason = 'BROWSER_SCROLL_COORDINATES_INVALID';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_SCROLL
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_SCROLL_WINDOW_HANDLE_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_SCROLL
      && (!suppliedSafeInteger(submittedSteps[decisions.length]?.delta_y)
        || Math.abs(Number(submittedSteps[decisions.length].delta_y)) > 1440
        || Number(submittedSteps[decisions.length].delta_y) === 0)) {
      allowed = false;
      reason = 'BROWSER_SCROLL_DELTA_INVALID';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_SCROLL
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle', 'x', 'y', 'delta_y'].includes(field))) {
      // Native browser.scroll is vertical-only; do not fake horizontal scrolling.
      allowed = false;
      reason = 'BROWSER_SCROLL_UNEXPECTED_FIELD';
    } else if ((step.action === COMPUTER_USE_ACTIONS.BROWSER_FIND_NEXT
      || step.action === COMPUTER_USE_ACTIONS.BROWSER_FIND_PREVIOUS)
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_FIND_CYCLE_WINDOW_HANDLE_REQUIRED';
    } else if ((step.action === COMPUTER_USE_ACTIONS.BROWSER_FIND_NEXT
      || step.action === COMPUTER_USE_ACTIONS.BROWSER_FIND_PREVIOUS)
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !FIND_CYCLE_ALLOWED_FIELDS.has(field))) {
      allowed = false;
      reason = 'BROWSER_FIND_CYCLE_UNEXPECTED_FIELD';
    } else if ((step.action === COMPUTER_USE_ACTIONS.BROWSER_NEXT_TAB
      || step.action === COMPUTER_USE_ACTIONS.BROWSER_PREVIOUS_TAB)
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_TAB_CYCLE_WINDOW_HANDLE_REQUIRED';
    } else if ((step.action === COMPUTER_USE_ACTIONS.BROWSER_NEXT_TAB
      || step.action === COMPUTER_USE_ACTIONS.BROWSER_PREVIOUS_TAB)
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !FIND_CYCLE_ALLOWED_FIELDS.has(field))) {
      allowed = false;
      reason = 'BROWSER_TAB_CYCLE_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_SELECT_TAB
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_SELECT_TAB_WINDOW_HANDLE_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_SELECT_TAB
      && (!Number.isInteger(submittedSteps[decisions.length]?.tab_index)
        || submittedSteps[decisions.length].tab_index < 1
        || submittedSteps[decisions.length].tab_index > 9)) {
      allowed = false;
      reason = 'BROWSER_SELECT_TAB_INDEX_INVALID';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_SELECT_TAB
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle', 'tab_index'].includes(field))) {
      allowed = false;
      reason = 'BROWSER_SELECT_TAB_UNEXPECTED_FIELD';
    } else if ([COMPUTER_USE_ACTIONS.BROWSER_ZOOM_IN,
      COMPUTER_USE_ACTIONS.BROWSER_ZOOM_OUT, COMPUTER_USE_ACTIONS.BROWSER_ZOOM_RESET].includes(step.action)
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_ZOOM_WINDOW_HANDLE_REQUIRED';
    } else if ([COMPUTER_USE_ACTIONS.BROWSER_ZOOM_IN,
      COMPUTER_USE_ACTIONS.BROWSER_ZOOM_OUT, COMPUTER_USE_ACTIONS.BROWSER_ZOOM_RESET].includes(step.action)
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle'].includes(field))) {
      // One approved zoom shortcut only. Do not silently ignore a desired
      // zoom percentage, repetition count or an alternate browser target.
      allowed = false;
      reason = 'BROWSER_ZOOM_UNEXPECTED_FIELD';
    } else if ([COMPUTER_USE_ACTIONS.BROWSER_OPEN_DOWNLOADS,
      COMPUTER_USE_ACTIONS.BROWSER_OPEN_HISTORY].includes(step.action)
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_PANEL_WINDOW_HANDLE_REQUIRED';
    } else if ([COMPUTER_USE_ACTIONS.BROWSER_OPEN_DOWNLOADS,
      COMPUTER_USE_ACTIONS.BROWSER_OPEN_HISTORY].includes(step.action)
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle'].includes(field))) {
      // These shortcuts only open the browser's own management views.
      // Reject guessed search filters, deletion requests or alternate targets.
      allowed = false;
      reason = 'BROWSER_PANEL_UNEXPECTED_FIELD';
    } else if ([COMPUTER_USE_ACTIONS.BROWSER_BACK,
      COMPUTER_USE_ACTIONS.BROWSER_FORWARD, COMPUTER_USE_ACTIONS.BROWSER_RELOAD,
      COMPUTER_USE_ACTIONS.BROWSER_NEW_TAB, COMPUTER_USE_ACTIONS.BROWSER_CLOSE_TAB].includes(step.action)
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_SHORTCUT_WINDOW_HANDLE_REQUIRED';
    } else if ([COMPUTER_USE_ACTIONS.BROWSER_BACK,
      COMPUTER_USE_ACTIONS.BROWSER_FORWARD, COMPUTER_USE_ACTIONS.BROWSER_RELOAD,
      COMPUTER_USE_ACTIONS.BROWSER_NEW_TAB, COMPUTER_USE_ACTIONS.BROWSER_CLOSE_TAB].includes(step.action)
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle'].includes(field))) {
      // Legacy shortcuts must not silently act on another browser window,
      // discard an alternate URL, or ignore any other owner-supplied target.
      allowed = false;
      reason = 'BROWSER_SHORTCUT_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_FOCUS_ADDRESS
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_FOCUS_ADDRESS_WINDOW_HANDLE_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_FOCUS_ADDRESS
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle'].includes(field))) {
      // Ctrl+L focuses/selects the address bar; it cannot type, navigate,
      // replace the URL, or silently honor any alternate target or payload.
      allowed = false;
      reason = 'BROWSER_FOCUS_ADDRESS_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_REOPEN_TAB
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_REOPEN_TAB_WINDOW_HANDLE_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_REOPEN_TAB
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle'].includes(field))) {
      // Reopening a closed tab/window may restore sensitive session content.
      // Owner must approve a single scoped shortcut, not an implicit URL or
      // any silently discarded repeat/count/target.
      allowed = false;
      reason = 'BROWSER_REOPEN_TAB_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_CAPTURE
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_CAPTURE_WINDOW_HANDLE_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_CAPTURE
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle'].includes(field))) {
      // Capturing a different window can expose unrelated private browser
      // content. Do not ignore a supplied target, region or alternate URL.
      allowed = false;
      reason = 'BROWSER_CAPTURE_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_BOOKMARK_PAGE
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_BOOKMARK_PAGE_WINDOW_HANDLE_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_BOOKMARK_PAGE
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle'].includes(field))) {
      // Ctrl+D may create a bookmark. It does not configure title, target
      // folder, or arbitrary URL; never silently discard the owner's intent.
      allowed = false;
      reason = 'BROWSER_BOOKMARK_PAGE_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_TOGGLE_FULLSCREEN
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_FULLSCREEN_WINDOW_HANDLE_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_TOGGLE_FULLSCREEN
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle'].includes(field))) {
      allowed = false;
      reason = 'BROWSER_FULLSCREEN_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_FIND
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_FIND_WINDOW_HANDLE_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_FIND
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !BROWSER_FIND_ALLOWED_FIELDS.has(field))) {
      allowed = false;
      reason = 'BROWSER_FIND_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_FIND
      && (step.text.length === 0 || step.text.trim().length === 0 || step.text.length > 256
        || /[\x00-\x1f\x7f]/.test(step.text))) {
      allowed = false;
      reason = 'BROWSER_FIND_TEXT_INVALID';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_TYPE
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_TYPE_WINDOW_HANDLE_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_TYPE
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle', 'text'].includes(field))) {
      allowed = false;
      reason = 'BROWSER_TYPE_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_TYPE && !step.text.length) {
      allowed = false;
      reason = 'BROWSER_TYPE_TEXT_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.SCROLL
      && (!suppliedSafeInteger(submittedSteps[decisions.length]?.delta_y)
        || Number(submittedSteps[decisions.length].delta_y) === 0)) {
      allowed = false;
      reason = 'SCROLL_DELTA_INVALID';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_PRESS
      && !validBrowserWindowHandle(step.window_handle)) {
      allowed = false;
      reason = 'BROWSER_PRESS_WINDOW_HANDLE_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_PRESS
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'window_handle', 'key'].includes(field))) {
      allowed = false;
      reason = 'BROWSER_PRESS_UNEXPECTED_FIELD';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_PRESS
      && !BROWSER_NAVIGATION_KEYS.has(step.key.toUpperCase())) {
      allowed = false;
      reason = 'BROWSER_PRESS_KEY_NOT_ALLOWED';
    } else if (step.action === COMPUTER_USE_ACTIONS.KEY_PRESS && !step.key) {
      allowed = false;
      reason = 'KEY_REQUIRED';
    } else if (step.action === COMPUTER_USE_ACTIONS.KEY_PRESS && !supportedWindowsKey(step.key)) {
      allowed = false;
      reason = 'KEY_NOT_SUPPORTED';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_NAVIGATE
      && Object.keys(submittedSteps[decisions.length] ?? {}).some(field =>
        !['id', 'action', 'url'].includes(field))) {
      // A browser launch has no HWND, typing, click or alternate target support.
      // Fail closed rather than claiming to have executed ignored owner intent.
      allowed = false;
      reason = 'BROWSER_NAVIGATE_UNEXPECTED_FIELD';
    } else if (!appAllowed(step.app, request.sandbox.allowed_apps)) {
      allowed = false;
      reason = 'APP_OUTSIDE_SANDBOX';
    } else if (step.action === COMPUTER_USE_ACTIONS.BROWSER_NAVIGATE && !step.url) {
      allowed = false;
      reason = 'NAVIGATION_URL_REQUIRED';
    } else if (!originAllowed(step.url, request.sandbox.allowed_origins)) {
      allowed = false;
      reason = 'ORIGIN_OUTSIDE_SANDBOX';
    } else if ((step.action === COMPUTER_USE_ACTIONS.OPEN_FILE || step.action === COMPUTER_USE_ACTIONS.CLOSE_FILE)
      && !step.path) {
      allowed = false;
      reason = 'FILE_PATH_REQUIRED';
    } else if (!pathAllowed(step.path, request.sandbox.allowed_paths)) {
      allowed = false;
      reason = 'PATH_OUTSIDE_SANDBOX';
    } else if (risk === COMPUTER_USE_RISK.SENSITIVE
      && !stepApprovalMatches(request.approvals, request.session_id, step)) {
      allowed = false;
      reason = 'EXPLICIT_STEP_APPROVAL_REQUIRED';
    }

    stepIds.add(step.id);
    decisions.push(Object.freeze({
      step_id: step.id,
      action: step.action,
      risk,
      allowed,
      reason,
    }));
  }

  const denied = decisions.find(row => !row.allowed);
  return denied
    ? result(request, false, denied.reason, decisions)
    : result(request, true, 'PLAN_AUTHORIZED', decisions);
}

export function createComputerUseController({
  adapter,
  authorize = async () => false,
  audit = async () => {},
} = {}) {
  if (!adapter || typeof adapter.perform !== 'function') {
    throw computerUseError('COMPUTER_USE_ADAPTER_REQUIRED');
  }
  if (typeof authorize !== 'function') {
    throw computerUseError('COMPUTER_USE_AUTHORIZER_REQUIRED');
  }
  if (typeof audit !== 'function') {
    throw computerUseError('COMPUTER_USE_AUDIT_REQUIRED');
  }

  return Object.freeze({
    async execute(input = {}, context = {}) {
      const plan = evaluateComputerUsePlan(input);
      const globallyAuthorized = await authorize('computer:use', {
        ...context,
        sessionId: plan.request.session_id,
        deviceId: plan.request.device.id,
      });

      if (!globallyAuthorized) {
        await audit(makeAudit(plan, 'DENIED', 'GLOBAL_PERMISSION_DENIED', []));
        throw computerUseError('GLOBAL_PERMISSION_DENIED');
      }
      if (!plan.allowed) {
        await audit(makeAudit(plan, 'DENIED', plan.reason, []));
        throw computerUseError(plan.reason);
      }

      const outputs = [];
      for (const step of plan.request.steps) {
        try {
          const output = await adapter.perform(structuredClone(step), {
            ...context,
            sessionId: plan.request.session_id,
            deviceId: plan.request.device.id,
            sandbox: structuredClone(plan.request.sandbox),
          });
          outputs.push({ step_id: step.id, ok: true, output: output ?? null });
        } catch (error) {
          const code = boundedText(error?.code || error?.name || 'ADAPTER_FAILURE', 100) || 'ADAPTER_FAILURE';
          outputs.push({ step_id: step.id, ok: false, code });
          await audit(makeAudit(plan, 'FAILED', code, outputs));
          throw computerUseError(code);
        }
      }

      await audit(makeAudit(plan, 'COMPLETED', 'OK', outputs));
      return {
        schema: COMPUTER_USE_SCHEMA,
        ok: true,
        session_id: plan.request.session_id,
        device_id: plan.request.device.id,
        steps_completed: outputs.length,
        outputs,
      };
    },
  });
}

function result(request, allowed, reason, decisions) {
  return Object.freeze({
    schema: COMPUTER_USE_SCHEMA,
    allowed,
    reason,
    request,
    decisions: Object.freeze([...decisions]),
  });
}

function makeAudit(plan, status, reason, outputs) {
  return {
    kind: 'COMPUTER_USE_AUDIT',
    schema: COMPUTER_USE_SCHEMA,
    session_id: plan.request.session_id || null,
    device_id: plan.request.device.id || null,
    status,
    reason,
    step_count: plan.request.steps.length,
    completed_steps: outputs.filter(row => row.ok).length,
    failed_steps: outputs.filter(row => !row.ok).length,
  };
}

function computerUseError(code) {
  const error = new Error(code);
  error.name = 'ComputerUseError';
  error.code = code;
  return error;
}
