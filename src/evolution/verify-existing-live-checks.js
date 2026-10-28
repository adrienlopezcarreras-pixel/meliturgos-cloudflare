// VERIFY_EXISTING production proof: before the Council judges "already done",
// MEL runs the read-only capabilities the plan names, through the same
// CapabilityBus as the chat. Only the outcome is kept (ok, error code, item
// count): no mail, event or file content leaves the capability.
import { runtimeCapabilityPermissions } from '../security/runtime-permissions.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Only the exact founder objective explicitly permits recording a missing
// authentication as an alternative to a successful read. A transient 5xx,
// network outage, failed permission gate or fabricated result never qualifies.
const FOUNDER_01 = /^\s*\[MEL-FOUNDER-01\]/i;
const AUTH_DIAGNOSTICS = Object.freeze({
  'gmail.messages.search': /^(?:GMAIL_AUTH_REQUIRED|GMAIL_HEALTH_AUTH_REQUIRED|GMAIL_HEALTH_FAILED_AUTH|GMAIL_SEARCH_FAILED_AUTH|GMAIL_SEARCH_AUTH_REQUIRED|PIPEDREAM_GMAIL_ACCOUNT_REQUIRED)$/,
  'calendar.events.read': /^(?:GOOGLE_CALENDAR_AUTH_REQUIRED|GOOGLE_CALENDAR_HEALTH_FAILED_AUTH|CALENDAR_READ_FAILED_AUTH|PIPEDREAM_GOOGLE_CALENDAR_ACCOUNT_REQUIRED)$/,
  'drive.files.list': /^(?:PIPEDREAM_GOOGLE_DRIVE_ACCOUNT_REQUIRED|PIPEDREAM_GOOGLE_DRIVE_AUTH_REQUIRED)$/,
});

function exactAuthDiagnostic(id, ...values) {
  const pattern = AUTH_DIAGNOSTICS[id];
  return values.map(value => String(value || '').trim()).find(value => pattern?.test(value)) || null;
}

function readSucceeded(id, output) {
  const value = output?.result ?? output;
  const collection = ({
    'gmail.messages.search': 'messages',
    'calendar.events.read': 'events',
    'drive.files.list': 'files',
  })[id];
  return output?.ok !== false && Boolean(collection) && Array.isArray(value?.[collection]);
}

function founderAllowsAuthDiagnostic(goal) {
  const text = String(goal || '');
  return FOUNDER_01.test(text) && /erreur d[’']authentification exacte/i.test(text);
}


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

/**
 * A generic successful read (Gmail/Agenda/Drive) is not functional evidence
 * for an unrelated roadmap objective such as MEL-FOUNDER-02 lease persistence.
 * Do not admit a no-code decision unless real goal-derived reads exist.
 * Additional plan reads may not substitute unrelated success for those reads.
 */
export function hasObjectiveBoundVerificationChecks(goal, planText) {
  const relevant = GOAL_CHECKS.filter(([pattern]) => pattern.test(String(goal || ''))).map(([, id]) => id);
  if (!relevant.length) return false;
  return requestedLiveChecks(planText).every((id) => relevant.includes(id));
}

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
export function liveProofGate(required, results, { goal = '' } = {}) {
  if (!Array.isArray(required) || !required.length) return { ok: false, code: 'VERIFY_EXISTING_NO_FUNCTIONAL_PROOF' };
  const byId = new Map((Array.isArray(results) ? results : []).map(row => [row?.capability, row]));
  const permitExactAuth = founderAllowsAuthDiagnostic(goal);
  const satisfied = id => {
    const row = byId.get(id);
    return row?.ok === true && row?.outcome !== 'AUTH_REQUIRED'
      || (permitExactAuth && row?.ok === false && row?.outcome === 'AUTH_REQUIRED'
        && exactAuthDiagnostic(id, row?.code) !== null);
  };
  const failed = required.find(id => !satisfied(id));
  if (failed) return {
    ok: false,
    code: `VERIFY_EXISTING_LIVE_CHECK_FAILED:${failed}:${byId.get(failed)?.code || 'NOT_RUN'}`.slice(0, 160),
  };
  const auth_missing = permitExactAuth ? required.filter(id => byId.get(id)?.outcome === 'AUTH_REQUIRED') : [];
  return { ok: true, code: null, auth_missing,
    proof_status: auth_missing.length ? 'READS_OR_EXACT_AUTH_DIAGNOSTICS' : 'READS_VERIFIED' };
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
      const ok = readSucceeded(id, out);
      results.push({ capability: id, ok, outcome: ok ? 'READ_SUCCEEDED' : 'FAILED',
        items: ok ? itemCount(out) : null,
        code: ok ? null : 'CAPABILITY_READ_RESULT_INVALID' });
    } catch (error) {
      // The bus checks real provider health before execute(). If that health
      // reports unavailable it throws CAPABILITY_UNAVAILABLE; retain the exact
      // safe authorization diagnostic from that already-executed probe.
      let healthCode = null;
      if (String(error?.code || '') === 'CAPABILITY_UNAVAILABLE') {
        try {
          const described = runtime.bus.describe(id);
          if (described?.health === 'UNAVAILABLE') healthCode = described.health_detail;
        } catch {}
      }
      const auth = exactAuthDiagnostic(id, error?.fallback_code, error?.native_code, healthCode, error?.code);
      const raw = auth || String(error?.code || error?.message || 'CAPABILITY_FAILED');
      const code = /^[A-Z0-9_:.\-]{1,80}$/.test(raw) ? raw : 'CAPABILITY_FAILED';
      results.push({ capability: id, ok: false, outcome: auth ? 'AUTH_REQUIRED' : 'FAILED',
        items: null, code });
    }
  }
  return results;
}
