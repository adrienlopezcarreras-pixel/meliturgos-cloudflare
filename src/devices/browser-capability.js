import { normalizeStepApprovals, stepApprovalMatches } from '../security/approval-gates.js';
export const BROWSER_CAPABILITY_SCHEMA = 'mel.devices.browser-capability.v1';

export const BROWSER_RISK = Object.freeze({
  OBSERVE: 'OBSERVE',
  INTERACT: 'INTERACT',
  SENSITIVE: 'SENSITIVE',
  DENY: 'DENY',
});

export const BROWSER_ACTIONS = Object.freeze({
  NAVIGATE: 'browser.navigate',
  READ_TEXT: 'browser.read-text',
  SCREENSHOT: 'browser.screenshot',
  CLICK: 'browser.click',
  SCROLL: 'browser.scroll',
  TYPE: 'browser.type',
  SUBMIT: 'browser.submit',
  DOWNLOAD: 'browser.download',
});

const ACTION_RISK = new Map([
  [BROWSER_ACTIONS.NAVIGATE, BROWSER_RISK.OBSERVE],
  [BROWSER_ACTIONS.READ_TEXT, BROWSER_RISK.OBSERVE],
  [BROWSER_ACTIONS.SCREENSHOT, BROWSER_RISK.OBSERVE],
  [BROWSER_ACTIONS.CLICK, BROWSER_RISK.INTERACT],
  [BROWSER_ACTIONS.SCROLL, BROWSER_RISK.INTERACT],
  [BROWSER_ACTIONS.TYPE, BROWSER_RISK.SENSITIVE],
  [BROWSER_ACTIONS.SUBMIT, BROWSER_RISK.SENSITIVE],
  [BROWSER_ACTIONS.DOWNLOAD, BROWSER_RISK.SENSITIVE],
]);

const RAW_ACTIONS = new Set([
  'javascript.eval',
  'devtools.command',
  'browser.exec-script',
  'shell.exec',
  'process.spawn',
  'file.write',
  'file.delete',
]);

const MAX_STEPS = 64;
const MAX_ID = 200;
const MAX_URL = 4096;
const MAX_SELECTOR = 1000;
const MAX_TEXT = 8192;

function boundedText(value, max = MAX_ID) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeHttpsUrl(value) {
  const raw = boundedText(value, MAX_URL);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeOrigin(value) {
  const url = normalizeHttpsUrl(value);
  if (!url) return '';
  return new URL(url).origin;
}

function uniqueOrigins(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeOrigin).filter(Boolean))].slice(0, 64);
}

function uniqueCapabilities(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => boundedText(item, 160)).filter(Boolean))].slice(0, 64);
}

function actionNeedsUrl(action) {
  return action === BROWSER_ACTIONS.NAVIGATE;
}

function browserError(code) {
  const error = new Error(code);
  error.name = 'BrowserCapabilityError';
  error.code = code;
  return error;
}

export function classifyBrowserAction(action) {
  const normalized = boundedText(action, 160);
  if (!normalized || RAW_ACTIONS.has(normalized)) return BROWSER_RISK.DENY;
  return ACTION_RISK.get(normalized) || BROWSER_RISK.DENY;
}

export function normalizeBrowserRequest(input = {}) {
  const sandbox = input.sandbox && typeof input.sandbox === 'object' ? input.sandbox : {};
  const maxSteps = Math.max(1, Math.min(MAX_STEPS, Math.trunc(numeric(sandbox.max_steps, 20)) || 20));
  const steps = (Array.isArray(input.steps) ? input.steps : []).slice(0, maxSteps).map((step, index) => {
    const rawUrl = boundedText(step?.url, MAX_URL);
    return {
      id: boundedText(step?.id) || `step-${index + 1}`,
      action: boundedText(step?.action, 160),
      url: normalizeHttpsUrl(rawUrl),
      url_supplied: Boolean(rawUrl),
      selector: boundedText(step?.selector, MAX_SELECTOR),
      text: typeof step?.text === 'string' ? step.text.slice(0, MAX_TEXT) : '',
      delta_x: numeric(step?.delta_x),
      delta_y: numeric(step?.delta_y),
    };
  });

  return {
    schema: BROWSER_CAPABILITY_SCHEMA,
    session_id: boundedText(input.session_id),
    owner_halt: input.owner_halt === true,
    device: {
      id: boundedText(input.device?.id),
      capabilities: uniqueCapabilities(input.device?.capabilities),
    },
    sandbox: {
      allowed_origins: uniqueOrigins(sandbox.allowed_origins),
      max_steps: maxSteps,
    },
    approvals: normalizeStepApprovals(input.approvals, MAX_STEPS),
    steps,
  };
}

/**
 * GEN2-31 provider-neutral browser policy.
 *
 * The browser adapter may live in a companion, Work runtime, or another
 * explicitly authorized executor. This layer never evaluates arbitrary script,
 * never accepts non-HTTPS navigation, keeps navigation inside an origin
 * allowlist, and requires exact per-step approval for sensitive actions.
 */
export function evaluateBrowserPlan(input = {}) {
  const request = normalizeBrowserRequest(input);
  const decisions = [];

  if (request.owner_halt) return result(request, false, 'OWNER_HALT_ACTIVE', decisions);
  if (!request.session_id || !request.device.id) return result(request, false, 'SESSION_AND_DEVICE_REQUIRED', decisions);
  if (!request.device.capabilities.includes('browser.control')) return result(request, false, 'BROWSER_CONTROL_CAPABILITY_REQUIRED', decisions);
  if (request.sandbox.allowed_origins.length === 0) return result(request, false, 'BROWSER_ALLOWED_ORIGINS_REQUIRED', decisions);
  if (request.steps.length === 0) return result(request, false, 'BROWSER_STEPS_REQUIRED', decisions);

  const stepIds = new Set();
  for (const step of request.steps) {
    const risk = classifyBrowserAction(step.action);
    let allowed = true;
    let reason = 'AUTHORIZED';

    if (stepIds.has(step.id)) {
      allowed = false;
      reason = 'DUPLICATE_STEP_ID';
    } else if (risk === BROWSER_RISK.DENY) {
      allowed = false;
      reason = 'ACTION_NOT_ALLOWED';
    } else if (step.url_supplied && !step.url) {
      allowed = false;
      reason = 'HTTPS_URL_REQUIRED';
    } else if (actionNeedsUrl(step.action) && !step.url) {
      allowed = false;
      reason = 'NAVIGATION_URL_REQUIRED';
    } else if (step.url && !request.sandbox.allowed_origins.includes(new URL(step.url).origin)) {
      allowed = false;
      reason = 'ORIGIN_OUTSIDE_SANDBOX';
    } else if (risk === BROWSER_RISK.SENSITIVE
      && !stepApprovalMatches(request.approvals, request.session_id, step)) {
      allowed = false;
      reason = 'EXPLICIT_STEP_APPROVAL_REQUIRED';
    }

    stepIds.add(step.id);
    decisions.push(Object.freeze({ step_id: step.id, action: step.action, risk, allowed, reason }));
  }

  const denied = decisions.find(row => !row.allowed);
  return denied ? result(request, false, denied.reason, decisions) : result(request, true, 'PLAN_AUTHORIZED', decisions);
}

export function createBrowserController({ adapter, authorize = async () => false, audit = async () => {} } = {}) {
  if (!adapter || typeof adapter.perform !== 'function') throw browserError('BROWSER_ADAPTER_REQUIRED');
  if (typeof authorize !== 'function') throw browserError('BROWSER_AUTHORIZER_REQUIRED');
  if (typeof audit !== 'function') throw browserError('BROWSER_AUDIT_REQUIRED');

  return Object.freeze({
    async execute(input = {}, context = {}) {
      const plan = evaluateBrowserPlan(input);
      const globallyAuthorized = await authorize('browser:control', {
        ...context,
        sessionId: plan.request.session_id,
        deviceId: plan.request.device.id,
      });

      if (!globallyAuthorized) {
        await audit(makeAudit(plan, 'DENIED', 'GLOBAL_PERMISSION_DENIED', []));
        throw browserError('GLOBAL_PERMISSION_DENIED');
      }
      if (!plan.allowed) {
        await audit(makeAudit(plan, 'DENIED', plan.reason, []));
        throw browserError(plan.reason);
      }

      const outputs = [];
      for (const step of plan.request.steps) {
        try {
          const output = await adapter.perform(structuredClone(step), {
            ...context,
            sessionId: plan.request.session_id,
            deviceId: plan.request.device.id,
            allowedOrigins: [...plan.request.sandbox.allowed_origins],
          });
          outputs.push({ step_id: step.id, ok: true, output: output ?? null });
        } catch (error) {
          const code = boundedText(error?.code || error?.name || 'BROWSER_ADAPTER_FAILURE', 100) || 'BROWSER_ADAPTER_FAILURE';
          outputs.push({ step_id: step.id, ok: false, code });
          await audit(makeAudit(plan, 'FAILED', code, outputs));
          throw browserError(code);
        }
      }

      await audit(makeAudit(plan, 'COMPLETED', 'OK', outputs));
      return {
        schema: BROWSER_CAPABILITY_SCHEMA,
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
    schema: BROWSER_CAPABILITY_SCHEMA,
    allowed,
    reason,
    request,
    decisions: Object.freeze([...decisions]),
  });
}

function makeAudit(plan, status, reason, outputs) {
  return {
    kind: 'BROWSER_CAPABILITY_AUDIT',
    schema: BROWSER_CAPABILITY_SCHEMA,
    session_id: plan.request.session_id || null,
    device_id: plan.request.device.id || null,
    status,
    reason,
    step_count: plan.request.steps.length,
    completed_steps: outputs.filter(row => row.ok).length,
    failed_steps: outputs.filter(row => !row.ok).length,
  };
}
