import { roadmapCodeContract } from '../roadmap/roadmap-code-contracts.js';
import { objectiveVerificationProfile, isFounderVerificationGoal } from './objective-verification-profiles.js';
// VERIFY_EXISTING production proof: before the Council judges "already done",
// MEL runs the read-only capabilities the plan names, through the same
// CapabilityBus as the chat. Only the outcome is kept (ok, error code, item
// count): no mail, event or file content leaves the capability.
import { ROADMAP_STATUSES } from '../roadmap/master-roadmap.js';
import { MANIFEST_01_FOUNDATION } from '../roadmap/manifest-01-acceptance.js';
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

// Verify the accounting behavior, never the completion of its reported tasks.
export function validManifestReport(value) {
  const report = value?.manifest_01;
  if (value?.schema !== 'mel.autonomy-readiness' || value?.version !== 3
    || report?.schema !== 'mel.manifest-01-foundation-prerequisites.v2'
    || report?.roadmap_id !== 'MEL-MANIFEST-01'
    || report?.source !== 'src/roadmap/master-roadmap.js' || report?.reportable !== true
    || !Array.isArray(report.priorities) || report.priorities.length !== 5) return false;
  if (!report.priorities.every((row, index) => {
    const expected = MANIFEST_01_FOUNDATION[index];
    return row?.priority === expected.priority && row?.roadmap_id === expected.roadmap_id
      && row?.blocking === expected.blocking && row?.proof === expected.proof
      && typeof row.verified === 'boolean'
      && [...Object.values(ROADMAP_STATUSES), 'REGRESSED'].includes(row.status)
      && (index !== 4 || !row.verified || row.status === ROADMAP_STATUSES.VERIFIED);
  })) return false;
  const pending = report.priorities.filter(row => !row.verified);
  const matches = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
    && actual.every((row, index) => row?.roadmap_id === expected[index].roadmap_id
      && row?.priority === expected[index].priority && row?.reason === expected[index].reason);
  return report.required_count === 5 && report.blocking_required_count === 4
    && report.verified_count === 5 - pending.length
    && report.ready === !pending.some(row => row.blocking)
    && report.all_verified === (pending.length === 0)
    && report.account_status === (pending.length ? 'ACCOUNT_RECORDED_PENDING_PRIORITIES' : 'ALL_PRIORITIES_VERIFIED')
    && matches(report.pending, pending)
    && matches(report.blocking_pending, pending.filter(row => row.blocking))
    && matches(report.nonblocking_pending, pending.filter(row => !row.blocking))
    && Array.isArray(report.business_indicators) && report.business_indicators.length <= 5
    && report.business_indicators.every(row => row?.kind === 'REPORT_DATA');
}

function readSucceeded(id, output) {
  const value = output?.result ?? output;
  if (id === 'autonomy.status') return output?.ok !== false && validManifestReport(value);
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
  'autonomy.status': () => ({}),
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

export function objectiveLiveChecks(goal) {
  const profile = objectiveVerificationProfile(goal);
  if (profile) return [profile.capability];
  return GOAL_CHECKS.filter(([pattern]) => pattern.test(String(goal || ''))).map(([, id]) => id);
}

/**
 * A generic successful read (Gmail/Agenda/Drive) is not functional evidence
 * for an unrelated roadmap objective such as MEL-FOUNDER-02 lease persistence.
 * Do not admit a no-code decision unless real goal-derived reads exist.
 * Additional plan reads may not substitute unrelated success for those reads.
 */
export function hasObjectiveBoundVerificationChecks(goal, planText) {
  const id = /^\s*\[([A-Z0-9-]+)\]/i.exec(String(goal || ''))?.[1]?.toUpperCase();
  if (roadmapCodeContract(id || '') && !isFounderVerificationGoal(goal) && !objectiveVerificationProfile(goal)) return false;
  const relevant = objectiveLiveChecks(goal);
  if (!relevant.length) return false;
  return requestedLiveChecks(planText).every((id) => relevant.includes(id));
}

/** Objective-derived checks plus the plan's LIVE_CHECKS line. */
export function requiredLiveChecks(goal, planText) {
  const fromGoal = objectiveLiveChecks(goal);
  return [...new Set([...fromGoal, ...requestedLiveChecks(planText)])];
}

/**
 * Deterministic gate before any Council review: VERIFY_EXISTING closes only
 * when at least one functional read was required and every one succeeded in
 * production. A green CI or a model's judgement never replaces it.
 */
export function liveProofGate(required, results, { goal = '', candidateSha = null } = {}) {
  if (!Array.isArray(required) || !required.length) return { ok: false, code: 'VERIFY_EXISTING_NO_FUNCTIONAL_PROOF' };
  const byId = new Map((Array.isArray(results) ? results : []).map(row => [row?.capability, row]));
  const permitExactAuth = founderAllowsAuthDiagnostic(goal);
  const profile = objectiveVerificationProfile(goal);
  if (profile) {
    const proof = byId.get(profile.capability)?.functional_evidence;
    if (proof?.schema !== 'mel.objective-functional-evidence/v1' || proof.revision !== profile.revision
      || proof.roadmap_id !== profile.id || !/^[a-f0-9]{40}$/.test(String(proof.deployed_sha || ''))
      || (candidateSha && proof.deployed_sha !== candidateSha))
      return { ok: false, code: 'VERIFY_EXISTING_OBJECTIVE_RECEIPT_REQUIRED' };
  }
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
  if (validManifestReport(value)) return value.manifest_01.required_count;
  for (const key of ['messages', 'events', 'files', 'items', 'results']) {
    if (Array.isArray(value?.[key])) return value[key].length;
  }
  return null;
}

export function manifestFunctionalEvidence(env, output) {
  const value = output?.result ?? output;
  if (!validManifestReport(value)) return null;
  const compiled = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA || '') : '';
  const sha = String(compiled || env?.MEL_DEPLOYED_GIT_SHA || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) return null;
  const report = value.manifest_01, profile = objectiveVerificationProfile('[MEL-MANIFEST-01]');
  return { schema: 'mel.objective-functional-evidence/v1', revision: profile.revision,
    roadmap_id: profile.id, deployed_sha: sha, report_schema: report.schema,
    required_count: report.required_count, verified_count: report.verified_count,
    reportable: report.reportable, ready: report.ready, all_verified: report.all_verified,
    priorities: report.priorities.map(row => ({ priority: row.priority, roadmap_id: row.roadmap_id,
      status: row.status, verified: row.verified, blocking: row.blocking })),
    pending_ids: report.pending.map(row => row.roadmap_id),
    external_pending_ids: report.nonblocking_pending.map(row => row.roadmap_id),
    business_indicators: { count: report.business_indicators.length, max_count: 5, kind: 'REPORT_DATA', values_included: false },
    external_acceptance_verified: false };
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
        code: ok ? null : 'CAPABILITY_READ_RESULT_INVALID',
        ...(ok && id === 'autonomy.status' ? { functional_evidence: manifestFunctionalEvidence(env, out) } : {}) });
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
