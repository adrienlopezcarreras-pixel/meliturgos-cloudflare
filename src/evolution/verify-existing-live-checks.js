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
