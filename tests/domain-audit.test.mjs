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

// MEL-AUDIT-05: injected clock, exact boundaries, no repair when healthy.
test('an injected clock detects exactly old memory, expired sessions and a missing backup; a healthy state yields nothing', async () => {
  const { auditCore } = await import('../src/diagnostics/domain-audit.js');
  const WEEK = 7 * 24 * H;
  const candidates = [
    ...Array.from({ length: 101 }, (_, i) => ({ status: 'PENDING', created_at: NOW - WEEK - 1 - i })),
    { status: 'PENDING', created_at: NOW - WEEK },
    { status: 'CONSOLIDATED', created_at: NOW - 10 * WEEK },
  ];
  const sessions = { rows: [{ expires_at: NOW - 1 }, { expires_at: NOW }, { expires_at: NOW + H }] };
  const findings = auditCore({ memory: { candidates }, sessions, lastBackupAt: null }, { now: NOW });
  assert.deepEqual(findings.map(f => f.code), ['MEMORY_UNCONSOLIDATED', 'SECURITY_EXPIRED_SESSIONS_KEPT', 'BACKUP_STALE']);
  assert.match(findings[0].detail, /^101 souvenirs/, 'exactly the candidates older than seven days');
  assert.match(findings[1].detail, /^1 sessions/, 'a session expiring at this instant is not yet expired');
  assert.match(findings[2].detail, /aucune sauvegarde/);
  const healthy = auditCore({ memory: { candidates: candidates.slice(100) }, sessions: { rows: [{ expires_at: NOW + H }] }, lastBackupAt: NOW - 3 * 24 * H }, { now: NOW });
  assert.deepEqual(healthy, [], 'a healthy state produces no finding, hence no repair');
});


test('healthy millisecond timestamps serialized as strings never generate repair findings', async () => {
  const { auditCore } = await import('../src/diagnostics/domain-audit.js');
  const candidates = Array.from({length:101}, () => ({status:'PENDING',created_at:String(NOW-H)}));
  const findings = auditCore({memory:{candidates},sessions:{rows:[{expires_at:String(NOW+H)}]},lastBackupAt:String(NOW-H)}, {now:NOW});
  assert.deepEqual(findings, [], 'valid current data stays healthy after JSON/SQL string serialization');
});

test('MEL-AUDIT-03 correlates the three domain findings to durable D1 rows without creating missions',async t=>{
 const {sqliteD1}=await import('./helpers/sqlite-d1.mjs');const db=sqliteD1();t.after(()=>db.close());
 await db.prepare('CREATE TABLE mel_response_quality_events(id TEXT PRIMARY KEY,user_excerpt TEXT,issues_json TEXT,response_excerpt TEXT,created_at INTEGER)').run();
 await db.prepare('CREATE TABLE capability_watch_state(id TEXT PRIMARY KEY,state_json TEXT,updated_at INTEGER)').run();
 await db.prepare('CREATE TABLE mel_work_cycles(id TEXT PRIMARY KEY,state TEXT,updated_at TEXT)').run();
 await db.prepare('CREATE TABLE dev_jobs(id TEXT PRIMARY KEY)').run();
 for(let i=0;i<3;i++)await db.prepare('INSERT INTO mel_response_quality_events VALUES(?,?,?,?,?)')
  .bind('chat-'+i,'private-user-fixture',JSON.stringify(i<2?[{severity:'high'}]:[]),'private-response-fixture',NOW-H).run();
 await db.prepare('INSERT INTO capability_watch_state VALUES(?,?,?)')
  .bind('watch-1',JSON.stringify({last_run_at:NOW-24*H,interval_ms:6*H}),NOW-H).run();
 for(let i=0;i<4;i++)await db.prepare('INSERT INTO mel_work_cycles VALUES(?,?,?)')
  .bind('work-'+i,i<3?'INTERRUPTED':'COMPLETE',new Date(NOW-H).toISOString()).run();
 const report=await runDomainAudit(db,{now:NOW});
 assert.deepEqual(report.findings.map(row=>row.code),['CHAT_OFF_TOPIC_ANSWERS','WATCH_STALLED','WORK_CYCLES_INTERRUPTED']);
 const expected=[['mel_response_quality_events',['chat-0','chat-1']],['capability_watch_state',['watch-1']],['mel_work_cycles',['work-0','work-1','work-2']]];
 for(let i=0;i<expected.length;i++){
  const [table,ids]=expected[i],finding=report.findings[i];
  assert.deepEqual(finding.evidence_refs.map(ref=>ref.id).sort(),ids);
  assert.equal(finding.evidence_refs_omitted,0);
  for(const ref of finding.evidence_refs){
   assert.equal(ref.table,table);assert.equal(ref.at,NOW-H);
   assert.ok(await db.prepare('SELECT id FROM '+table+' WHERE id=?').bind(ref.id).first());
  }
 }
 assert.doesNotMatch(JSON.stringify(report),/private-user-fixture|private-response-fixture/);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM dev_jobs').first()).n,0);
 await db.prepare("UPDATE mel_response_quality_events SET issues_json='[]'").run();
 await db.prepare('UPDATE capability_watch_state SET state_json=?').bind(JSON.stringify({last_run_at:NOW,interval_ms:6*H})).run();
 await db.prepare("UPDATE mel_work_cycles SET state='COMPLETE'").run();
 assert.deepEqual((await runDomainAudit(db,{now:NOW})).findings,[]);
});

test('domain evidence is bounded and never invents a durable id',()=>{
 const rows=Array.from({length:23},(_,i)=>({id:'event-'+i,created_at:NOW-H,issues_json:'[{"severity":"high"}]',response_excerpt:'private-text'}));
 const finding=auditChat(rows,{now:NOW})[0];
 assert.equal(finding.evidence_refs.length,20);assert.equal(finding.evidence_refs_omitted,3);
 const noIds=auditChat(rows.map(({id,...row})=>row),{now:NOW})[0];
 assert.equal(noIds.evidence_refs,undefined);
 assert.doesNotMatch(JSON.stringify(finding),/private-text/);
});
