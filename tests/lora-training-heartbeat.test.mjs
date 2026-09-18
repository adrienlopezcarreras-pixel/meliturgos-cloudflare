import test from 'node:test';
import assert from 'node:assert/strict';
import { runLoraTrainingHeartbeat } from '../src/learning/lora-training-heartbeat.js';

const SHA = '1234567890abcdef1234567890abcdef12345678';
const baseEnv = {
  MEL_GITHUB_TOKEN: 'token-for-test',
  MEL_GITHUB_REPOSITORY: 'owner/repo',
  MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
  MEL_LORA_KAGGLE_WORKFLOW: 'lora-kaggle-free-gpu.yml',
  MEL_LORA_CONTINUOUS_TRAINING: 'true',
};

function engineWith(rows = []) {
  return { benchmarks: async () => rows };
}

test('LoRA heartbeat does not duplicate an active Kaggle training chain', async () => {
  let calls = 0;
  const result = await runLoraTrainingHeartbeat(baseEnv, {
    force: true,
    engine: engineWith([]),
    fetchImpl: async (url) => {
      calls += 1;
      assert.match(String(url), /actions\/workflows\/lora-kaggle-free-gpu\.yml\/runs/);
      return Response.json({ workflow_runs: [{ id: 77, status: 'in_progress', conclusion: null }] });
    },
  });

  assert.equal(result.status, 'TRAINING_CHAIN_ACTIVE');
  assert.equal(result.dispatched, false);
  assert.equal(result.workflow_run_id, 77);
  assert.equal(calls, 1);
});

test('LoRA heartbeat dispatches cycle zero when the free training chain is idle', async () => {
  const seen = [];
  const result = await runLoraTrainingHeartbeat(baseEnv, {
    force: true,
    engine: engineWith([]),
    now: () => new Date('2026-09-18T10:00:00Z'),
    fetchImpl: async (url, options = {}) => {
      const href = String(url);
      seen.push({ href, method: options.method || 'GET', body: options.body || '' });
      if (href.includes('/actions/workflows/') && href.includes('/runs')) {
        return Response.json({ workflow_runs: [] });
      }
      if (href.includes('/git/ref/heads/')) {
        return Response.json({ object: { sha: SHA } });
      }
      if (href.endsWith('/dispatches')) {
        return new Response(null, { status: 204 });
      }
      return new Response('unexpected', { status: 500 });
    },
  });

  assert.equal(result.status, 'TRAINING_CHAIN_DISPATCHED');
  assert.equal(result.dispatched, true);
  assert.equal(result.source_sha, SHA);
  assert.equal(result.shard_size, 750);
  assert.equal(result.max_cycles, 100);
  const dispatch = seen.find((row) => row.href.endsWith('/dispatches'));
  assert.ok(dispatch);
  const payload = JSON.parse(dispatch.body);
  assert.equal(payload.ref, 'candidate/mel-clean-autonomy');
  assert.deepEqual(payload.inputs, {
    source_sha: SHA,
    cycle: '0',
    parent_release_tag: '',
    shard_size: '750',
    max_cycles: '100',
  });
});

test('LoRA heartbeat stops UNCENSORED relaunches once AGENTIC_READY is measured', async () => {
  let fetchCalled = false;
  const result = await runLoraTrainingHeartbeat(baseEnv, {
    force: true,
    engine: engineWith([
      {
        kind: 'lora-impact-candidate',
        adapter_id: 'adapter-1',
        metadata: {
          next_stage: 'AGENTIC_READY',
          uncensored_gate: true,
          canonical_gate_passed: true,
        },
      },
    ]),
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('should not fetch');
    },
  });

  assert.equal(result.status, 'AGENTIC_READY');
  assert.equal(result.dispatched, false);
  assert.equal(fetchCalled, false);
});

test('LoRA heartbeat fails closed when MEL GitHub token is unavailable', async () => {
  const result = await runLoraTrainingHeartbeat({
    ...baseEnv,
    MEL_GITHUB_TOKEN: '',
  }, {
    force: true,
    engine: engineWith([]),
  });
  assert.equal(result.status, 'SKIPPED_NO_GITHUB_TOKEN');
  assert.equal(result.dispatched, false);
});

test('LoRA heartbeat respects its cadence between supervision windows', async () => {
  const result = await runLoraTrainingHeartbeat(baseEnv, {
    force: false,
    now: () => new Date('2026-09-18T10:07:00Z'),
    engine: engineWith([]),
  });
  assert.equal(result.status, 'SKIPPED_CADENCE');
  assert.equal(result.interval_minutes, 15);
});
