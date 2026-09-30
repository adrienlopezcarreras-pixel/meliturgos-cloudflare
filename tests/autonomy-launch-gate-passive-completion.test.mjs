import test from 'node:test';
import assert from 'node:assert/strict';

import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';
import { setAutonomyControl } from '../src/evolution/autonomy-control.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

test('stale launch SHA blocks new autonomy work but still ingests already verified completions', async () => {
  const DB = sqliteD1();
  const approvedSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const deployedSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  let reconcileCalls = 0;
  try {
    await setAutonomyControl(DB, {
      paused: false,
      max_autonomy: true,
      source: 'test-owner-max',
      launch_approved_sha: approvedSha,
      launch_approved_at: '2026-09-27T21:00:00.000Z',
    });

    const result = await runAutonomyRuntimeTick({
      DB,
      MEL_DEPLOYED_GIT_SHA: deployedSha,
      MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
      MEL_TEACHER_BRANCH: 'candidate/mel-clean-autonomy',
    }, {
      repository: {},
      completionReconciler: async () => {
        reconcileCalls += 1;
        return {
          ok: true,
          records: 1,
          completed: [{ job_id: 'verified-job', candidate_sha: approvedSha, ci_run_id: 42 }],
          rejected: [],
        };
      },
    });

    assert.equal(reconcileCalls, 1, 'verified completion reconciliation must run even behind a stale launch gate');
    assert.equal(result.status, 'LAUNCH_GATE_REQUIRED');
    assert.equal(result.advanced, false, 'stale launch approval must still block new autonomous execution');
    assert.equal(result.launch_gate.approved_sha, approvedSha);
    assert.equal(result.launch_gate.deployed_sha, deployedSha);
    assert.equal(result.passive_completions.ok, true);
    assert.equal(result.passive_completions.completed[0].job_id, 'verified-job');
  } finally {
    DB.close();
  }
});
