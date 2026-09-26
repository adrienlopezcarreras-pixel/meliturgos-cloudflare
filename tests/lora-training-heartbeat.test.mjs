import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runLoraTrainingHeartbeat } from '../src/learning/lora-training-heartbeat.js';

const SHA = '1234567890abcdef1234567890abcdef12345678';
const NEW_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
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

test('LoRA heartbeat dispatches cycle zero only when no checkpoint exists', async () => {
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
      if (href.includes('/releases')) {
        return Response.json([]);
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
  assert.equal(result.cycle, 0);
  assert.equal(result.parent_release_tag, '');
  assert.equal(result.resumed_from_checkpoint, false);
  assert.equal(result.shard_size, 750);
  assert.equal(result.max_cycles, 100);

  const dispatch = seen.find((row) => row.href.endsWith('/dispatches'));
  assert.ok(dispatch);
  const payload = JSON.parse(dispatch.body);
  assert.deepEqual(payload.inputs, {
    source_sha: SHA,
    cycle: '0',
    parent_release_tag: '',
    shard_size: '750',
    max_cycles: '100',
    benchmark_preview: 'false',
  });
});

test('LoRA heartbeat resumes from latest immutable checkpoint with current candidate code', async () => {
  const tag = 'mel-lora-kaggle-1234567890ab-c007';
  let dispatchPayload = null;
  const result = await runLoraTrainingHeartbeat(baseEnv, {
    force: true,
    engine: engineWith([]),
    fetchImpl: async (url, options = {}) => {
      const href = String(url);
      if (href.includes('/actions/workflows/') && href.includes('/runs')) {
        return Response.json({ workflow_runs: [] });
      }
      if (href.includes('/releases')) {
        return Response.json([
          {
            tag_name: tag,
            target_commitish: SHA,
            body: 'Local next stage: UNCENSORED_CONTINUE',
            published_at: '2026-09-18T09:00:00Z',
          },
        ]);
      }
      if (href.includes('/git/ref/heads/')) {
        return Response.json({ object: { sha: NEW_SHA } });
      }
      if (href.endsWith('/dispatches')) {
        dispatchPayload = JSON.parse(options.body);
        return new Response(null, { status: 204 });
      }
      return new Response('unexpected', { status: 500 });
    },
  });

  assert.equal(result.status, 'TRAINING_CHAIN_DISPATCHED');
  assert.equal(result.cycle, 8);
  assert.equal(result.parent_release_tag, tag);
  assert.equal(result.resumed_from_checkpoint, true);
  assert.equal(result.source_sha, NEW_SHA);
  assert.equal(dispatchPayload.inputs.source_sha, NEW_SHA);
  assert.equal(dispatchPayload.inputs.cycle, '8');
  assert.equal(dispatchPayload.inputs.parent_release_tag, tag);
});

test('LoRA heartbeat preserves checkpoint and stops when local gate awaits canonical benchmark', async () => {
  let dispatched = false;
  let headRead = false;
  const tag = 'mel-lora-kaggle-1234567890ab-c012';
  const result = await runLoraTrainingHeartbeat(baseEnv, {
    force: true,
    engine: engineWith([]),
    fetchImpl: async (url, options = {}) => {
      const href = String(url);
      if (href.includes('/actions/workflows/') && href.includes('/runs')) {
        return Response.json({ workflow_runs: [] });
      }
      if (href.includes('/releases')) {
        return Response.json([
          {
            tag_name: tag,
            target_commitish: SHA,
            body: 'Local next stage: LOCAL_GATE_READY_FOR_CANONICAL_BENCHMARK',
          },
        ]);
      }
      if (href.includes('/git/ref/heads/')) {
        headRead = true;
        return Response.json({ object: { sha: NEW_SHA } });
      }
      if (href.endsWith('/dispatches')) {
        dispatched = true;
        return new Response(null, { status: 204 });
      }
      return new Response('unexpected', { status: 500 });
    },
  });

  assert.equal(result.status, 'LOCAL_GATE_READY_FOR_CANONICAL_BENCHMARK');
  assert.equal(result.dispatched, false);
  assert.equal(result.checkpoint.tag, tag);
  assert.equal(headRead, false);
  assert.equal(dispatched, false);
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


test('canonical Kaggle collector is dispatch-only and cannot create scheduled/push wait queues', async () => {
  const source = await readFile(new URL('../.github/workflows/lora-kaggle-free-collect.yml', import.meta.url), 'utf8');
  const triggerBlock = source.slice(source.indexOf('on:'), source.indexOf('permissions:'));
  assert.match(triggerBlock, /workflow_dispatch:/);
  assert.doesNotMatch(triggerBlock, /\n\s*push:/);
  assert.doesNotMatch(triggerBlock, /\n\s*schedule:/);
  assert.match(source, /WAIT_FOR_COMPLETION:\s*\$\{\{ inputs\.wait_for_completion \}\}/);
  assert.match(source, /MAX_WAIT_MINUTES:\s*\$\{\{ inputs\.max_wait_minutes \}\}/);
  assert.match(source, /cancel_acknowledged\|cancel acknowledged/);
});


test('canonical Kaggle GPU workflow allows multi-step QLoRA runtime', async () => {
  const source = await readFile(new URL('../.github/workflows/lora-kaggle-free-gpu.yml', import.meta.url), 'utf8');
  assert.match(source, /kaggle kernels push[\s\S]*-t 10800/);
  assert.doesNotMatch(source, /kaggle kernels push[\s\S]*-t 120(?:\s|$)/);
});

test('canonical Kaggle GPU workflow retries one transient cancellation and then fails closed', async () => {
  const source = await readFile(new URL('../.github/workflows/lora-kaggle-free-gpu.yml', import.meta.url), 'utf8');
  assert.match(source, /CANCEL_RETRY_USED=0/);
  assert.match(source, /cancel_acknowledged\|cancel acknowledged/);
  assert.match(source, /Retrying the same immutable cycle once/);
  assert.match(source, /CANCEL_RETRY_USED=1/);
  assert.match(source, /Kaggle GPU run cancelled twice/);
});
