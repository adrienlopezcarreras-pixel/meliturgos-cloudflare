// CODEX: historical metadata repair must never resurrect or erase a failed job.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrate } from '../src/persistence/migrations.js';
import { evaluateFailureHygiene } from '../src/evolution/launch-readiness.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const id = 'self-audit-supervisor-69221d23ba79d5725729497cbb19f87f';
const scope = { source: 'self-audit-supervisor', request_key: 'self-audit:known-anomaly',
  candidate_branch_only: true, zero_added_cost: true, roadmap_id: null, retained: 'evidence' };

async function insert(db, { jobId=id, status='FAILED', context=scope, goal='[MEL-SELF-AUDIT] Corriger une anomalie détectée automatiquement.' }={}) {
  await db.prepare(`INSERT INTO dev_jobs(id,created_at,updated_at,status,requested_by,goal,optional_context,plan_json,files_json,tests_json,result_json,error)
    VALUES(?,100,200,?,'mel-autonomy',?,?,'{"council":"original"}','[]','[]','{"original":"evidence"}','ORIGINAL_FAILURE')`)
    .bind(jobId,status,goal,JSON.stringify(context)).run();
}
const row = (db, jobId=id) => db.prepare('SELECT * FROM dev_jobs WHERE id=?').bind(jobId).first();
const job = r => ({...r, optional_context: JSON.parse(r.optional_context), result_json: JSON.parse(r.result_json)});

test('migration scopes only the identified self-audit failure, preserves every other column and remains idempotent', async () => {
  const db=sqliteD1();
  try {
    await migrate(db,19);
    await insert(db);
    await insert(db,{jobId:'unscoped-unknown',context:{source:'unknown'}});
    const before=await row(db);
    assert.equal(evaluateFailureHygiene([job(before)]).code,'UNSCOPED_FAILED_WORK_REQUIRES_REVIEW');
    const workflow=readFileSync(new URL('../.github/workflows/gen2-42-live-proof.yml',import.meta.url),'utf8');
    const probe=[...workflow.matchAll(/--command "([^"]+)"/g)].map(x=>x[1]).find(x=>x.includes('AS reviewed_self_audit_scope_match'));
    assert.ok(probe,'read-only production probe must identify whether this migration applies');
    const observed=(await db.prepare(probe).all()).results;
    assert.equal(observed.find(x=>x.id===id).reviewed_self_audit_scope_match,1);
    assert.equal(observed.find(x=>x.id==='unscoped-unknown').reviewed_self_audit_scope_match,0);

    await migrate(db);
    const after=await row(db);
    const context=JSON.parse(after.optional_context);
    assert.equal(context.roadmap_id,'MEL-AUDIT-01');
    assert.deepEqual(context.roadmap_scope_reconciliation,{source:'CODEX',migration:20,reason:'SELF_AUDIT_CREATOR_OMITTED_KNOWN_SCOPE',previous_roadmap_id:null});
    assert.deepEqual({...after,optional_context:before.optional_context},{...before});
    assert.deepEqual({...context,roadmap_id:null,roadmap_scope_reconciliation:undefined},{...scope,roadmap_scope_reconciliation:undefined});
    const bounded=evaluateFailureHygiene([job(after)]);
    assert.equal(bounded.ok,true);
    assert.equal(bounded.historical_failed_count,1,'the original failure remains visible');
    assert.equal(evaluateFailureHygiene([job(after),job(await row(db,'unscoped-unknown'))]).ok,false,'an unrelated unscoped failure still blocks launch');
    await migrate(db);
    assert.deepEqual(await row(db),after);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM dev_jobs').first()).n,2);
  } finally { db.close(); }
});

test('migration refuses an unrelated source, pre-existing scope, cancelled work or missing provenance', async () => {
  for (const options of [
    {context:{...scope,source:'unknown'}},
    {context:{...scope,roadmap_id:'MEL-FOUNDER-02'}},
    {status:'CANCELLED'},
    {context:{...scope,request_key:null}},
    {context:{...scope,candidate_branch_only:false}},
    {goal:'unrelated work'},
    {jobId:'self-audit-supervisor-unreviewed'},
  ]) {
    const db=sqliteD1();
    try {
      await migrate(db,19);await insert(db,options);
      const before=await row(db,options.jobId||id);
      await migrate(db);
      assert.deepEqual(await row(db,options.jobId||id),before);
    } finally { db.close(); }
  }
});

test('source-scoped admission experience reaches MEL learning without a duplicate', async () => {
  const { LearningEngine } = await import('../src/learning/learning-engine.js');
  const engine=new LearningEngine({memory:{async recent(){return [];}}});
  const id='codex-source-scoped-autonomy-admission-20261021';
  assert.equal((await engine.corrections({limit:1000})).filter(x=>x.id===id).length,1);
  assert.ok((await engine.trainingBundle({limit:1000,minQuality:0.95})).preference.some(x=>x.id===id));
});
