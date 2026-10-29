import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runLoraTrainingHeartbeat, selectLatestCheckpointRelease } from '../src/learning/lora-training-heartbeat.js';

const SHA = '1234567890abcdef1234567890abcdef12345678';
const NEW_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const publishedAssets = [
  { name: 'kaggle-run.json', size: 100 },
  { name: 'mel-lora-bundle.tar.gz', size: 1024 },
];

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

test('LoRA source stays on canonical main even when MAX develops on candidate', async () => {
  const seen=[];
  const result = await runLoraTrainingHeartbeat(baseEnv, {
    force: true, engine: engineWith([]),
    fetchImpl: async (url, options={}) => {
      const href=String(url); seen.push(href);
      if (href.includes('/actions/workflows/') && href.includes('/runs')) return Response.json({ workflow_runs: [] });
      if (href.includes('/releases')) return Response.json([]);
      if (href.includes('/git/ref/heads/main')) return Response.json({ object: { sha: SHA } });
      if (href.endsWith('/dispatches')) {
        const body=JSON.parse(options.body);
        assert.equal(body.ref,'main');
        assert.equal(body.inputs.source_sha,SHA);
        return new Response(null,{ status:204 });
      }
      throw new Error('unexpected training URL: '+href);
    },
  });
  assert.equal(result.dispatched,true);
  assert.equal(result.branch,'main');
  assert.ok(seen.some(href=>href.includes('/git/ref/heads/main')));
  assert.ok(seen.every(href=>!href.includes('/git/ref/heads/candidate')));
});

test('Kaggle push does not auto-restart cycle zero or cancel active GPU training', async () => {
  const source=await readFile(new URL('../.github/workflows/lora-kaggle-free-gpu.yml',import.meta.url),'utf8');
  assert.ok(source.includes("if: ${{ github.event_name == 'workflow_dispatch' }}"));
  assert.ok(source.includes("cancel-in-progress: ${{ github.event_name == 'push' && contains(github.event.head_commit.message, '[cancel-only]') }}"));
  assert.ok(source.includes("if: ${{ contains(github.event.head_commit.message, '[cancel-only]') }}"));
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
            draft: false,
            assets: publishedAssets,
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
            draft: false,
            assets: publishedAssets,
            published_at: '2026-09-18T09:00:00Z',
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

test('checkpoint selector ignores a draft c000 above a real published c003 and older c013 lineages', () => {
  const pub = (tag, sha, date, cycleBody='Free offline Kaggle GPU checkpoint') => ({
    tag_name: tag, target_commitish: sha, published_at: date, draft: false,
    assets: publishedAssets, body: cycleBody,
  });
  const fresh = 'defdfb84b307da1b11a4926b7d6e86aaded878a0';
  const old = '8806969aad34e41a2bfdcdb2fc91c20824775e8a';
  const draft = '635c4786b39b9c3a5458126d64ec7bb726a282e7';
  const chosen = selectLatestCheckpointRelease([
    { ...pub('mel-lora-kaggle-635c4786b39b-c000', draft, '2026-10-22T11:00:00Z'), draft: true },
    pub('mel-lora-kaggle-8806969aad34-c013', old, '2026-10-13T14:20:46Z'),
    pub('mel-lora-kaggle-defdfb84b307-c002', fresh, '2026-10-18T10:46:33Z'),
    pub('mel-lora-kaggle-defdfb84b307-c003', fresh, '2026-10-18T11:53:20Z'),
  ]);
  assert.equal(chosen?.tag, 'mel-lora-kaggle-defdfb84b307-c003');
  assert.equal(chosen?.cycle, 3);
});

test('checkpoint selector refuses invalid provenance and incomplete unpublished artifacts', () => {
  const sha = SHA;
  const record = {
    tag_name: 'mel-lora-kaggle-1234567890ab-c003', target_commitish: sha,
    published_at: '2026-10-18T12:00:00Z', draft: false, assets: publishedAssets,
  };
  assert.equal(selectLatestCheckpointRelease([{ ...record, draft: true }]), null);
  assert.equal(selectLatestCheckpointRelease([{ ...record, published_at: null }]), null);
  assert.equal(selectLatestCheckpointRelease([{ ...record, target_commitish: NEW_SHA }]), null);
  assert.equal(selectLatestCheckpointRelease([{ ...record, assets: [{ name:'mel-lora-bundle.tar.gz', size: 1024 }] }]), null);
  assert.equal(selectLatestCheckpointRelease([{ ...record, assets: [{ name:'kaggle-run.json', size: 0 }, { name:'mel-lora-bundle.tar.gz', size: 1024 }] }]), null);
});

test('LoRA heartbeat never restarts cycle zero when only draft or unverified checkpoints exist', async () => {
  let dispatched = false;
  const result = await runLoraTrainingHeartbeat(baseEnv, {
    force: true,
    engine: engineWith([]),
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes('/actions/workflows/') && href.includes('/runs')) return Response.json({ workflow_runs: [] });
      if (href.includes('/releases')) return Response.json([{
        tag_name: 'mel-lora-kaggle-1234567890ab-c000',
        target_commitish: SHA,
        draft: true,
        published_at: null,
        assets: [{ name:'mel-lora-bundle.tar.gz', size: 1024 }],
      }]);
      if (href.endsWith('/dispatches')) { dispatched = true; return new Response(null, { status: 204 }); }
      throw new Error('No GitHub branch read or dispatch allowed when checkpoint is ambiguous');
    },
  });
  assert.equal(result.status, 'HEARTBEAT_ERROR');
  assert.equal(result.error, 'LORA_CHECKPOINT_CHAIN_UNVERIFIED');
  assert.equal(result.dispatched, false);
  assert.equal(dispatched, false);
});

test('LoRA heartbeat stops UNCENSORED relaunches once AGENTIC_READY is measured and keeps observing', async () => {
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

  // AGENTIC_READY is no longer terminal: MEL keeps observing its objectives.
  assert.equal(result.status, 'AGENTIC_OBSERVING');
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

test('canonical Kaggle collector allows scoped main-push recovery and remains bounded', async () => {
  const source = await readFile(new URL('../.github/workflows/lora-kaggle-free-collect.yml', import.meta.url), 'utf8');
  const triggerBlock = source.slice(source.indexOf('on:'), source.indexOf('permissions:'));
  assert.match(triggerBlock, /workflow_dispatch:/);
  assert.match(triggerBlock, /\n\s*push:/);
  assert.match(triggerBlock, /branches:\s*\n\s*- main/);
  assert.match(triggerBlock, /\.github\/workflows\/lora-kaggle-free-collect\.yml/);
  assert.match(triggerBlock, /scripts\/finalize-lora\.mjs/);
  assert.doesNotMatch(triggerBlock, /\n\s*schedule:/);
  assert.match(source, /WAIT_FOR_COMPLETION:\s*\$\{\{ github\.event_name == 'push' && 'false' \|\| inputs\.wait_for_completion \}\}/);
  assert.match(source, /MAX_WAIT_MINUTES:\s*\$\{\{ github\.event_name == 'push' && '1' \|\| inputs\.max_wait_minutes \}\}/);
  assert.match(source, /cancel_acknowledged\|cancel acknowledged/);
});

test('canonical Kaggle GPU workflow allows multi-step QLoRA runtime', async () => {
  const source = await readFile(new URL('../.github/workflows/lora-kaggle-free-gpu.yml', import.meta.url), 'utf8');
  assert.ok(source.includes('KAGGLE_KERNEL_TIMEOUT_SECONDS="10800"'), 'normal training has its full 3-hour budget');
  assert.ok(source.includes('KAGGLE_KERNEL_TIMEOUT_SECONDS="1800"'), 'one-step Kaggle smoke is bounded to 30min');
  assert.ok(source.includes('-t "$KAGGLE_KERNEL_TIMEOUT_SECONDS"'), 'submission respects selected budget');
  assert.doesNotMatch(source, /kaggle kernels push[^\n]*-t 120(?:\s|$)/);
});

test('canonical Kaggle GPU workflow retries one transient cancellation and then fails closed', async () => {
  const source = await readFile(new URL('../.github/workflows/lora-kaggle-free-gpu.yml', import.meta.url), 'utf8');
  assert.match(source, /CANCEL_RETRY_USED=0/);
  assert.match(source, /cancel_acknowledged\|cancel acknowledged/);
  assert.match(source, /Retrying the same immutable cycle once/);
  assert.match(source, /CANCEL_RETRY_USED=1/);
  assert.match(source, /Kaggle GPU run cancelled twice/);
});

test('LoRA heartbeat trains the agentic lane on the pinned public sets MEL discovered', async () => {
  const weak = { kind: 'lora-impact-candidate', metadata: { next_stage: 'AGENTIC_READY', candidate: { agentic_execution: 0.3, over_refusal_rate: 0.1, technical_depth: 0.9 } } };
  const hf = (id) => ({ id, sha: SHA, downloads: 5000, tags: ['license:apache-2.0', 'language:en'] });
  let dispatchPayload = null;
  const result = await runLoraTrainingHeartbeat(baseEnv, {
    force: true,
    engine: engineWith([weak, weak]),
    fetchImpl: async (url, options = {}) => {
      const href = String(url);
      if (href.startsWith('https://huggingface.co/api/datasets')) {
        return Response.json(href.includes('leaderboard') || href.includes('bfcl') || href.includes('benchmark') ? [hf('org/bfcl-eval')] : [hf('org/tool-calls')]);
      }
      if (href.includes('/actions/workflows/') && href.includes('/runs')) return Response.json({ workflow_runs: [] });
      if (href.includes('/releases')) return Response.json([]);
      if (href.includes('/git/ref/heads/')) return Response.json({ object: { sha: NEW_SHA } });
      if (href.endsWith('/dispatches')) { dispatchPayload = JSON.parse(options.body); return new Response(null, { status: 204 }); }
      return Response.json([]);
    },
  });
  assert.equal(result.status, 'TRAINING_CHAIN_DISPATCHED');
  assert.equal(dispatchPayload.inputs.objective, 'agentic');
  const sources = JSON.parse(dispatchPayload.inputs.agentic_sources);
  assert.deepEqual(sources, [{ id: 'org/tool-calls', revision: SHA }]);
});

test('Kaggle chain carries the agentic objective and never stops it at AGENTIC_READY', async () => {
  const workflow = await readFile(new URL('../.github/workflows/lora-kaggle-free-gpu.yml', import.meta.url), 'utf8');
  assert.match(workflow, /--objective "\$OBJECTIVE"/);
  assert.match(workflow, /NEXT_STAGE" == "AGENTIC_READY" && "\$OBJECTIVE" != "agentic"/);
  assert.match(workflow, /-f objective="\$OBJECTIVE"\s+-f agentic_sources="\$AGENTIC_SOURCES"/);
  const shard = await readFile(new URL('../scripts/prepare-kaggle-lora-shard.py', import.meta.url), 'utf8');
  assert.match(shard, /revision=revision/);
  assert.match(shard, /risky=mod\.is_high_risk_operational/);
});

test('a pipeline-caused gap becomes a MAX code mission instead of a training run', async () => {
  const ok = { kind: 'lora-impact-candidate', metadata: { next_stage: 'AGENTIC_READY', candidate: { agentic_execution: 0.9, over_refusal_rate: 0.1, technical_depth: 0.9 } } };
  const failed = Array.from({ length: 5 }, (_, i) => ({ id: 'j' + i, status: 'FAILED', result_json: { bridge_preparation_diagnostic: { mentor_failure_codes: [{ code: 'MENTOR_PROVIDER_TIMEOUT' }] } } }));
  let enqueued = null, fetched = false;
  const result = await runLoraTrainingHeartbeat({ ...baseEnv, DB: {} }, {
    force: true, engine: engineWith([ok, ok]),
    jobs: failed,
    enqueueDevelopment: async (request) => { enqueued = request; return { job: { id: 'lora-fix-1' } }; },
    fetchImpl: async () => { fetched = true; return Response.json([]); },
  });
  assert.equal(result.status, 'CODE_FIX_REQUIRED');
  assert.equal(result.mission.queued, true);
  assert.equal(enqueued.source, 'lora-objective-observer');
  assert.match(enqueued.goal, /MEL-LORA-CODE-FIX/);
  assert.equal(fetched, false);
});

test('manual training continues the verified checkpoint for one cycle without automatic activation', async () => {
  let payload;
  const result = await runLoraTrainingHeartbeat(baseEnv, {
    force:true, manualSingleCycle:true, engine:engineWith([]),
    fetchImpl:async(url,options={})=>{
      const href=String(url);
      if(href.includes('/runs'))return Response.json({workflow_runs:[]});
      if(href.includes('/releases'))return Response.json([{tag_name:'mel-lora-kaggle-1234567890ab-c008',target_commitish:SHA,published_at:'2026-09-18T09:00:00Z',assets:publishedAssets,body:'Local next stage: LOCAL_GATE_READY_FOR_CANONICAL_BENCHMARK'}]);
      if(href.endsWith('/dispatches')){payload=JSON.parse(options.body);return new Response(null,{status:204});}
      throw Error('Unexpected external call '+href);
    },
  });
  assert.equal(result.dispatched,true);assert.equal(result.cycle,9);
  assert.equal(payload.inputs.source_sha,SHA);assert.equal(payload.inputs.max_cycles,'10');
  assert.equal(payload.inputs.parent_release_tag,'mel-lora-kaggle-1234567890ab-c008');
  assert.equal(payload.inputs.benchmark_preview,'false');assert.equal(payload.inputs.activate,undefined);
});

test('manual launch retains active-run deduplication',async()=>{
  let calls=0;
  const result=await runLoraTrainingHeartbeat(baseEnv,{force:true,manualSingleCycle:true,engine:engineWith([]),fetchImpl:async()=>{calls++;return Response.json({workflow_runs:[{id:99,status:'in_progress'}]});}});
  assert.equal(result.status,'TRAINING_CHAIN_ACTIVE');assert.equal(result.dispatched,false);assert.equal(calls,1);
});

test('Dolphin source is pinned automatically without weakening the existing launch gate', async () => {
  const expectedSha='a'.repeat(40);
  let payload=null;
  const result=await runLoraTrainingHeartbeat(baseEnv,{
    force:true,engine:engineWith([]),
    fetchImpl:async(url,options={})=>{
      const href=String(url);
      if(href.includes('/actions/workflows/') && href.includes('/runs'))return Response.json({workflow_runs:[]});
      if(href.includes('/releases'))return Response.json([]);
      if(href.includes('/git/ref/heads/'))return Response.json({object:{sha:SHA}});
      if(href==='https://huggingface.co/api/datasets/QuixiAI/dolphin')return Response.json({
        id:'QuixiAI/dolphin',sha:expectedSha,tags:['license:apache-2.0'],gated:false,private:false,
      });
      if(href.endsWith('/dispatches')){payload=JSON.parse(options.body);return new Response(null,{status:204});}
      throw Error('Unexpected: '+href);
    },
  });
  assert.equal(result.dispatched,true);
  assert.equal(result.experimental_source.status,'PINNED');
  assert.deepEqual(JSON.parse(payload.inputs.uncensored_sources),[{id:'QuixiAI/dolphin',revision:expectedSha}]);
});

test('Unverified external dataset falls back to baseline rather than blocking training', async () => {
  let payload=null;
  const result=await runLoraTrainingHeartbeat(baseEnv,{
    force:true,engine:engineWith([]),
    fetchImpl:async(url,options={})=>{
      const href=String(url);
      if(href.includes('/actions/workflows/') && href.includes('/runs'))return Response.json({workflow_runs:[]});
      if(href.includes('/releases'))return Response.json([]);
      if(href.includes('/git/ref/heads/'))return Response.json({object:{sha:SHA}});
      if(href==='https://huggingface.co/api/datasets/QuixiAI/dolphin')return Response.json({
        id:'QuixiAI/dolphin',sha:'bad',tags:['license:apache-2.0'],
      });
      if(href.endsWith('/dispatches')){payload=JSON.parse(options.body);return new Response(null,{status:204});}
      throw Error('Unexpected: '+href);
    },
  });
  assert.equal(result.dispatched,true);
  assert.equal(result.experimental_source.status,'SOURCE_NOT_ELIGIBLE');
  assert.equal(Object.hasOwn(payload.inputs,'uncensored_sources'),false);
});
