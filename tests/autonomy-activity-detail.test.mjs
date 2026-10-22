import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAutonomyActivity, jobPipeline, foldLedger, describeJob } from '../src/evolution/autonomy-activity.js';

const now = 1_792_325_000_000;
const approved = {
  id: 'ecosystem-watch-1', status: 'TEACHER_APPROVED', requested_by: 'mel-autonomy', goal: 'Débloquer media.image.analyze',
  created_at: now - 86_400_000, updated_at: now - 600_000, files_json: ['src/a.js'], tests_json: ['tests/a.test.mjs'],
  result_json: { teacher_bridge: { review: { verdict: 'APPROVE_PLAN', owner_override: true } }, implementation_proposal: { status: 'READY' }, bridge_preparation: { status: 'READY', candidate_branch: 'candidate/mel-clean-autonomy', candidate_sha: 'a'.repeat(40) } },
};

test('pipeline shows where a MAX job stands', () => {
  const steps = jobPipeline(approved);
  assert.deepEqual(steps.map(s => s.state), ['done', 'done', 'done', 'done', 'current', 'todo', 'todo']);
  assert.match(steps[1].label, /par MAX/);
  const failed = jobPipeline({ status: 'FAILED', result_json: {} });
  assert.ok(failed.some(s => s.state === 'blocked'));
  const job = describeJob(approved, now);
  assert.equal(job.origin, 'veille des capacités');
  assert.equal(job.idle_minutes, 10);
  assert.equal(job.candidate.branch, 'candidate/mel-clean-autonomy');
});

test('repeated identical ledger updates are folded', () => {
  const ev = i => ({ evolution_id: 'j', stage: 'JOB_UPDATED', status: 'TEACHER_APPROVED', occurred_at: now - i, evidence_json: '{"bridge_status":"READY"}' });
  const rows = foldLedger([ev(1), ev(2), ev(3), { evolution_id: 'j', stage: 'JOB_CREATED', status: 'QUEUED', occurred_at: now - 9 }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].repeat, 3);
  assert.equal(rows[0].stage_text, 'Travail mis à jour');
});

test('activity report gathers jobs, ledger, dispatches and WORK from D1', async () => {
  const db = { prepare(sql) { const st = { bind() { return st; }, async run() { return {}; },
    async all() {
      if (/FROM dev_jobs/.test(sql)) return { results: [{ ...approved, result_json: JSON.stringify(approved.result_json), files_json: '["src/a.js"]', tests_json: '["tests/a.test.mjs"]' }] };
      if (/cloud-bridge-dispatch/.test(sql)) return { results: [{ bridge_id: 'cloud-bridge-dispatch:ecosystem-watch-1', status: 'DISPATCHED', last_seen: now, metadata_json: '{"relay_job_id":"r1"}' }] };
      if (/github_action_relay_jobs/.test(sql)) return { results: [{ id: 'r1', status: 'DISPATCHED', workflow: 'gen2-42-apply-ready-bridge.yml', result_json: '{"relay_run_id":7}', created_at: now }] };
      if (/mel_work_cycles/.test(sql)) return { results: [{ state: 'DONE', result: '{"status":"NO_ELIGIBLE_MISSION"}', updated_at: '2026-10-18T12:00:00Z' }] };
      return { results: [] };
    },
    async first() { return null; } }; return st; } };
  const a = await buildAutonomyActivity({ DB: db }, { now });
  assert.equal(a.ok, true);
  assert.equal(a.jobs[0].status, 'TEACHER_APPROVED');
  assert.equal(a.cloud_bridge_dispatches[0].relay_job_id, 'r1');
  assert.equal(a.workflow_dispatches[0].run_id, 7);
  assert.equal(a.work_cycles[0].status, 'NO_ELIGIBLE_MISSION');
});

test('the Activité panel reads the detailed feed and the top buttons report their result', async () => {
  const page = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  assert.match(page, /jfetch\('\/api\/gen2\/autonomy\/activity'\)/);
  assert.match(page, /id="melFullFeedback"/);
  for (const label of ['MAX 100 %', 'Cycle MEL']) assert.ok(page.includes("'" + label + "',qs('#melFullFeedback'))"), label);
  const api = await readFile(new URL('../src/evolution/autonomy-api.js', import.meta.url), 'utf8');
  assert.match(api, /'\/api\/gen2\/autonomy\/activity'/);
});

test('header buttons follow the real control state and never act during a release pause', async () => {
  const page = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  assert.match(page, /'MAX en attente \(pause\)'/);
  assert.match(page, /max\.disabled=releasePause/);
  assert.match(page, /pause\.disabled=releasePause/);
  assert.match(page, /NEW_RELEASE_AWAITING_OWNER_LAUNCH/);
  assert.match(page, /!awaitingOwnerLaunch&&/);
  assert.match(page, /b\.disabled=autonomyControl\.paused===true/);
  assert.match(page, /setInterval\(\(\)=>\{if\(!document\.hidden\)loadAutonomy\(\)/);
});

test('an activity reset hides older jobs and cancels only the active supervised ones', async () => {
  const { resetAutonomyActivityList, buildAutonomyActivity } = await import('../src/evolution/autonomy-activity.js');
  const calls = [];
  const now = 1_800_000_000_000;
  const db = {
    prepare(sql) {
      let bound = [];
      const st = {
        bind(...args) { bound = args; return st; },
        async run() { calls.push(sql); return { meta: { changes: 4 } }; },
        async all() {
          if (/FROM dev_jobs/.test(sql)) return { results: [
            { id: 'old', status: 'FAILED', requested_by: 'mel-autonomy', goal: 'ancien', created_at: now - 10_000, updated_at: now - 10_000, result_json: '{}' },
            { id: 'new', status: 'QUEUED', requested_by: 'mel-autonomy', goal: 'nouveau', created_at: now + 1000, updated_at: now + 1000, result_json: '{}' },
          ] };
          return { results: [] };
        },
        async first() { return bound[0] === 'activity-list-epoch' ? { last_seen: now } : null; },
      };
      return st;
    },
  };
  const reset = await resetAutonomyActivityList(db, { now });
  assert.equal(reset.cancelled_active, 4);
  assert.match(calls[0], /UPDATE dev_jobs/);
  assert.match(calls[1], /INSERT INTO dev_bridge_state/);
  const view = await buildAutonomyActivity({ DB: db }, { now: now + 5000 });
  assert.deepEqual(view.jobs.map(job => job.id), ['new']);
  assert.equal(view.activity_list_epoch, now);
});

// GPT6: a committed candidate still awaits CI/promotion and must not disappear from active counts.
test('COMMITTED supervised job remains active until COMPLETED', async () => {
  const { buildAutonomyActivity } = await import('../src/evolution/autonomy-activity.js');
  const now = Date.now();
  const db = { prepare(sql) {
    const st = {
      bind() { return st; },
      async all() {
        if (/FROM dev_jobs/.test(sql)) return { results: [
          { id: 'commit-1', status: 'COMMITTED', requested_by: 'mel-autonomy', goal: 'CI pending', created_at: now, updated_at: now, result_json: '{}' },
          { id: 'done-1', status: 'COMPLETED', requested_by: 'mel-autonomy', goal: 'Released', created_at: now, updated_at: now, result_json: '{}' },
        ] };
        return { results: [] };
      },
      async first() { return null; },
    };
    return st;
  } };
  const view = await buildAutonomyActivity({ DB: db }, { now });
  assert.equal(view.counts.active, 1);
  assert.equal(view.counts.by_status.COMMITTED, 1);
  assert.equal(view.jobs.find(job => job.id === 'commit-1').pipeline.at(-1).done, false);
});
