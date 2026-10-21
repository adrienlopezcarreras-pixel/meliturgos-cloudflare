// VERIFY_EXISTING production proof: before the Council judges "already done",
// MEL runs the read-only capabilities the plan names, through the same
// CapabilityBus as the chat. Only the outcome is kept (ok, error code, item
// count): no mail, event or file content leaves the capability.
import { runtimeCapabilityPermissions } from '../security/runtime-permissions.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const LIVE_READ_CHECKS = Object.freeze({
  'gmail.messages.search': () => ({ query: 'newer_than:7d', limit: 1 }),
  'calendar.events.read': (now) => ({ time_min: new Date(now).toISOString(), time_max: new Date(now + 7 * DAY_MS).toISOString(), limit: 1 }),
  'drive.files.list': () => ({ limit: 1 }),
});

// Reads an objective obliges MEL to prove, whatever the plan claims.
const GOAL_CHECKS = [
  [/\bgmail\b|\be-?mails?\b|\bmails?\b|courriels?/i, 'gmail.messages.search'],
  [/\bagenda\b|\bcalendar\b|calendrier/i, 'calendar.events.read'],
  [/\bdrive\b/i, 'drive.files.list'],
];

/** Objective-derived checks plus the plan's LIVE_CHECKS line. */
export function requiredLiveChecks(goal, planText) {
  const fromGoal = GOAL_CHECKS.filter(([pattern]) => pattern.test(String(goal || ''))).map(([, id]) => id);
  return [...new Set([...fromGoal, ...requestedLiveChecks(planText)])];
}

/**
 * Deterministic gate before any Council review: VERIFY_EXISTING closes only
 * when at least one functional read was required and every one succeeded in
 * production. A green CI or a model's judgement never replaces it.
 */
export function liveProofGate(required, results) {
  if (!Array.isArray(required) || !required.length) return { ok: false, code: 'VERIFY_EXISTING_NO_FUNCTIONAL_PROOF' };
  const byId = new Map((Array.isArray(results) ? results : []).map(row => [row?.capability, row]));
  const failed = required.find(id => byId.get(id)?.ok !== true);
  return failed
    ? { ok: false, code: `VERIFY_EXISTING_LIVE_CHECK_FAILED:${failed}:${byId.get(failed)?.code || 'NOT_RUN'}`.slice(0, 160) }
    : { ok: true, code: null };
}

/** Checks requested by a plan line "LIVE_CHECKS: id, id"; unknown ids are ignored. */
export function requestedLiveChecks(planText) {
  const line = /^LIVE_CHECKS:\s*(.+)$/im.exec(String(planText || ''))?.[1] || '';
  return [...new Set(line.split(/[\s,;]+/).map(id => id.trim()).filter(id => Object.hasOwn(LIVE_READ_CHECKS, id)))];
}

function itemCount(out) {
  const value = out?.result ?? out;
  for (const key of ['messages', 'events', 'files', 'items', 'results']) {
    if (Array.isArray(value?.[key])) return value[key].length;
  }
  return null;
}

export async function runLiveChecks(env, ids, { now = Date.now(), createRuntime = null } = {}) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const runtime = createRuntime
    ? await createRuntime(env)
    : (await import('../core/orchestrator/gen2-runtime.js')).createGen2Runtime({ env });
  const context = { owner: env?.MELITURGOS_USER || 'owner', permissions: runtimeCapabilityPermissions(env), requestId: crypto.randomUUID() };
  const results = [];
  for (const id of ids) {
    try {
      const out = await runtime.bus.execute(id, LIVE_READ_CHECKS[id](now), context);
      results.push({ capability: id, ok: out?.ok !== false, items: itemCount(out), code: out?.ok === false ? String(out?.code || 'CAPABILITY_FAILED').slice(0, 80) : null });
    } catch (error) {
      const code = String(error?.code || error?.message || 'CAPABILITY_FAILED');
      results.push({ capability: id, ok: false, items: null, code: /^[A-Z0-9_:.-]{1,80}$/.test(code) ? code : 'CAPABILITY_FAILED' });
    }
  }
  return results;
}
