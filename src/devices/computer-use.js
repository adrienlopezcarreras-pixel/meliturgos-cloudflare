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
  CLIPBOARD_READ: 'clipboard.read',
  CLIPBOARD_WRITE: 'clipboard.write',
});

const ACTION_RISK = new Map([
  [COMPUTER_USE_ACTIONS.SCREENSHOT, COMPUTER_USE_RISK.OBSERVE],
  [COMPUTER_USE_ACTIONS.CURSOR_MOVE, COMPUTER_USE_RISK.INTERACT],
  [COMPUTER_USE_ACTIONS.CLICK, COMPUTER_USE_RISK.INTERACT],
  [COMPUTER_USE_ACTIONS.SCROLL, COMPUTER_USE_RISK.INTERACT],
  [COMPUTER_USE_ACTIONS.KEY_PRESS, COMPUTER_USE_RISK.INTERACT],
  [COMPUTER_USE_ACTIONS.TYPE_TEXT, COMPUTER_USE_RISK.SENSITIVE],
  [COMPUTER_USE_ACTIONS.OPEN_APP, COMPUTER_USE_RISK.SENSITIVE],
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

function normalizeOrigin(value) {
  const raw = boundedText(value, 2048);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.origin : '';
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

export function classifyComputerUseAction(action) {
  const normalized = boundedText(action, 160);
  if (!normalized || RAW_EXECUTION_ACTIONS.has(normalized)) return COMPUTER_USE_RISK.DENY;
  return ACTION_RISK.get(normalized) || COMPUTER_USE_RISK.DENY;
}

export function normalizeComputerUseRequest(input = {}) {
  const rawSandbox = input.sandbox && typeof input.sandbox === 'object' ? input.sandbox : {};
  const maxSteps = Math.max(1, Math.min(MAX_STEPS, Math.trunc(numeric(rawSandbox.max_steps, 20)) || 20));
  const allowedApps = uniqueTexts(rawSandbox.allowed_apps);
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
      allowed_origins: allowedOrigins,
      max_steps: maxSteps,
    },
    approvals: normalizeStepApprovals(input.approvals, MAX_STEPS),
    steps: rawSteps.map((step, index) => ({
      id: boundedText(step?.id) || `step-${index + 1}`,
      action: boundedText(step?.action, 160),
      app: boundedText(step?.app, MAX_APP),
      url: boundedText(step?.url, 2048),
      text: typeof step?.text === 'string' ? step.text.slice(0, MAX_TEXT) : '',
      x: numeric(step?.x),
      y: numeric(step?.y),
      delta_x: numeric(step?.delta_x),
      delta_y: numeric(step?.delta_y),
      key: boundedText(step?.key, 80),
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
    } else if (!appAllowed(step.app, request.sandbox.allowed_apps)) {
      allowed = false;
      reason = 'APP_OUTSIDE_SANDBOX';
    } else if (!originAllowed(step.url, request.sandbox.allowed_origins)) {
      allowed = false;
      reason = 'ORIGIN_OUTSIDE_SANDBOX';
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
