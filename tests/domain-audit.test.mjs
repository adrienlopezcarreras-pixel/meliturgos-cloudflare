import test from 'node:test';
import assert from 'node:assert/strict';
import { auditChat, auditWatch, auditWork, runDomainAudit } from '../src/diagnostics/domain-audit.js';

const NOW = Date.parse('2026-10-24T10:00:00Z');
const H = 3_600_000;

test('chat audit flags off-topic answers and raw tool calls shown to the owner', () => {
  const off = { created_at: NOW - H, issues_json: '[{"code":"POSSIBLE_OFF_TOPIC","severity":"high"}]', response_excerpt: 'Je n’ai pas obtenu de résultat exploitable' };
  const leak = { created_at: NOW - H, issues_json: '[]', response_excerpt: '{"name":"d1.query","arguments":{}}' };
  const codes = auditChat([off, off, leak], { now: NOW }).map(f => f.code);
  assert.deepEqual(codes, ['CHAT_OFF_TOPIC_ANSWERS', 'CHAT_RAW_TOOL_CALL_SHOWN']);
  assert.deepEqual(auditChat([{ created_at: NOW - H, issues_json: '[{"severity":"low"}]', response_excerpt: 'ok' }], { now: NOW }), []);
});

test('watch audit flags a watch that stopped running', () => {
  const stalled = { id: 'ecosystem-canonical', state_json: JSON.stringify({ interval_ms: 6 * H, last_run_at: NOW - 5 * 24 * H }) };
  const fresh = { id: 'dependency-longevity-canonical', state_json: JSON.stringify({ last_run_at: NOW - 2 * H }) };
  const findings = auditWatch([stalled, fresh], { now: NOW });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /ecosystem-canonical sans passage depuis 120 h/);
});

test('WORK audit flags weeks without completed cycles and frequent interruptions', () => {
  const at = new Date(NOW - H).toISOString();
  const cycles = [...Array(4).fill({ state: 'INTERRUPTED', updated_at: at }), { state: 'COMPLETE', updated_at: at }];
  assert.deepEqual(auditWork(cycles, { now: NOW }).map(f => f.code), ['WORK_CYCLES_INTERRUPTED']);
  assert.deepEqual(auditWork([{ state: 'INTERRUPTED', updated_at: at }], { now: NOW }).map(f => f.code), ['WORK_NO_COMPLETED_CYCLE']);
});

test('the domain audit reads production tables and survives a missing table', async () => {
  const db = { prepare: sql => ({ all: async () => {
    if (sql.includes('capability_watch_state')) return { results: [{ id: 'ecosystem-canonical', state_json: JSON.stringify({ interval_ms: 6 * H, last_run_at: NOW - 48 * H }) }] };
    throw new Error('no such table');
  } }) };
  const report = await runDomainAudit(db, { now: NOW });
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings.map(f => f.code), ['WATCH_STALLED']);
});

test('one failing watch source no longer voids the whole pass', async () => {
  const { runCapabilityWatch } = await import('../src/evaluation/capability-watch.js');
  const targets = [{ id: 'ok_source', mode: 'observe' }, { id: 'down_source', mode: 'observe' }];
  const evaluator = async ({ capability_id }) => { if (capability_id === 'down_source') throw new Error('FETCH_FAILED'); return { evidence: { summary: 'ok' } }; };
  const ran = await runCapabilityWatch({ now: NOW, intervalMs: 6 * H, targets, evaluator, force: true });
  assert.equal(ran.status, 'RAN');
  assert.equal(ran.state.last_run_at, NOW);
  assert.deepEqual(ran.failures.map(f => f.id), ['down_source']);
  const allDown = await runCapabilityWatch({ now: NOW, intervalMs: 6 * H, targets, evaluator: async () => { throw new Error('OFFLINE'); }, force: true });
  assert.equal(allDown.status, 'FAILED');
});

test('core audit (MEL-AUDIT-05) flags recurring errors, unconsolidated memory, expired sessions and stale backups', async () => {
  const { auditCore } = await import('../src/diagnostics/domain-audit.js');
  const codes = auditCore({
    errors: [{ path: '/api/chat', status: 500, error: 'boom', n: 12 }, { path: '/api/x', status: 500, error: 'rare', n: 2 }],
    memory: { pending: 3571, pending_old: 3303 },
    sessions: { expired: 7 },
    lastBackupAt: NOW - 4 * 24 * H,
  }, { now: NOW }).map(f => f.code);
  assert.deepEqual(codes, ['CORE_RECURRING_ERROR', 'MEMORY_UNCONSOLIDATED', 'SECURITY_EXPIRED_SESSIONS_KEPT', 'BACKUP_STALE']);
  assert.deepEqual(auditCore({ memory: { pending_old: 5 }, sessions: { expired: 0 }, lastBackupAt: NOW - H }, { now: NOW }), []);
  assert.deepEqual(auditCore({}, { now: NOW }), [], 'an unmeasured backup table is not a finding');
});


test('MEL-AUDIT-03: off-topic chat, expired watch and interrupted WORK give three findings tied to durable evidence', async () => {
  const { auditChat, auditWatch, auditWork } = await import('../src/diagnostics/domain-audit.js');
  const now = Date.parse('2026-11-01T08:00:00Z');
  const hour = 3600_000;
  const events = [1, 2, 3].map(id => ({ id, created_at: now - hour, issues_json: JSON.stringify([{ severity: 'high' }]), user_excerpt: 'q', response_excerpt: 'r' }));
  const states = [{ id: 'veille-ia', state_json: JSON.stringify({ last_run_at: new Date(now - 72 * hour).toISOString(), interval_ms: 24 * hour }) }];
  const cycles = [1, 2, 3, 4].map(id => ({ id: 'cycle-' + id, state: 'INTERRUPTED', updated_at: now - hour }));
  const findings = [...auditChat(events, { now }), ...auditWatch(states, { now }), ...auditWork(cycles, { now })];
  const byCode = Object.fromEntries(findings.map(f => [f.code, f]));
  assert.deepEqual(byCode.CHAT_OFF_TOPIC_ANSWERS.evidence, { table: 'mel_response_quality_events', refs: [1, 2, 3] });
  assert.equal(byCode.WATCH_STALLED.evidence.table, 'capability_watch_state');
  assert.deepEqual(byCode.WATCH_STALLED.evidence.refs, ['veille-ia']);
  assert.equal(byCode.WORK_CYCLES_INTERRUPTED.evidence.table, 'mel_work_cycles');
  assert.deepEqual(byCode.WORK_CYCLES_INTERRUPTED.evidence.refs, ['cycle-1', 'cycle-2', 'cycle-3', 'cycle-4']);
});
