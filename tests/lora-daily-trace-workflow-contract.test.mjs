import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/lora-kaggle-free-gpu.yml',import.meta.url),'utf8');
const client=await readFile(new URL('../scripts/lora-daily-trace-client.mjs',import.meta.url),'utf8');
const entry=await readFile(new URL('../src/professor-live-learning-entry.js',import.meta.url),'utf8');

test('daily LoRA workflow owns GitHub OIDC and initializes trace before GPU submission',()=>{
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/Initialize durable LoRA daily trace/);
  assert.match(workflow,/lora-daily-trace-client\.mjs STARTED/);
  assert.match(workflow,/Trace prepared training dataset/);
  assert.match(workflow,/Trace Kaggle training submission/);
  const start=workflow.indexOf('Initialize durable LoRA daily trace');
  const submit=workflow.indexOf('Submit free offline Kaggle T4 training');
  assert.ok(start>=0&&submit>start);
});

test('Kaggle progress is copied incrementally to MEL and trace outage prevents green success',()=>{
  assert.match(workflow,/TRAINING_PROGRESS artifacts\/lora-trace-progress\.json RUNNING/);
  assert.match(workflow,/Durable progress trace failed; this workflow cannot be successful/);
  assert.match(workflow,/exit 70/);
  assert.match(workflow,/TRAINING_RETRY/);
  assert.match(workflow,/TRAINING_ERROR/);
});

test('normal LoRA success is gated by the durable terminal SUCCEEDED write',()=>{
  const continueAt=workflow.indexOf('Continue free UNCENSORED chain');
  const finalAt=workflow.indexOf('Finalize durable LoRA success trace');
  assert.ok(continueAt>=0&&finalAt>continueAt);
  assert.match(workflow,/lora-daily-trace-client\.mjs SUCCEEDED artifacts\/lora-trace-success-final\.json SUCCEEDED/);
  assert.match(workflow,/Finaliz(?:e|ing) interrupted|Finalize interrupted or failed LoRA trace/);
  assert.match(workflow,/failure\(\) \|\| cancelled\(\)/);
  assert.match(workflow,/retention-days: 90/);
});

test('smoke-only is traceable but cannot masquerade as a successful checkpointed training run',()=>{
  assert.match(workflow,/Verify actual Kaggle one-step smoke evidence before recording success/);
  assert.match(workflow,/verify-kaggle-smoke-proof\.mjs/);
  assert.match(workflow,/SMOKE_COMPLETED/);
  assert.ok(!workflow.includes('training:{steps:1,global_step:1,duration_seconds:0,smoke_only:true}'));
  assert.match(workflow,/kaggle kernels output "\$KERNEL_REF" -p artifacts\/kaggle-smoke-output --force/);
});

test('trace client durably journals and spools locally before flushing remote delivery and requires OIDC',()=>{
  const localJournalAt=client.indexOf("journal({direction:'OUT'");
  const spoolWriteAt=client.indexOf("fs.writeFileSync(spoolPath");
  const flushAt=client.indexOf("const flushed=await flushPending()");
  assert.ok(localJournalAt>=0&&spoolWriteAt>localJournalAt&&flushAt>spoolWriteAt);
  assert.match(client,/async function deliver\(file\)/);
  assert.match(client,/fetch\(endpoint/);
  assert.match(client,/ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(client,/audience=meliturgos-worker/);
  assert.match(client,/x-mel-github-oidc/);
  assert.match(client,/LORA_TRACE_WRITE_FAILED_QUEUE_RETAINED/);
});

test('MEL exposes durable trace history and daily status to the authenticated learning API',()=>{
  assert.match(entry,/\/api\/learning\/lora\/traces/);
  assert.match(entry,/\/api\/learning\/lora\/daily-status/);
  assert.match(entry,/markMissingLoraTrainingDay/);
  assert.doesNotMatch(entry,/FREE_LORA_COLLECTOR_WORKFLOW/);
});

test('Kaggle LoRA monitor cannot expire before the configured 3-hour GPU kernel limit',()=> {
  assert.ok(workflow.includes('KAGGLE_KERNEL_TIMEOUT_SECONDS="10800"'), 'normal Kaggle GPU budget remains three hours');
  assert.ok(workflow.includes('-t "$KAGGLE_KERNEL_TIMEOUT_SECONDS"'), 'submission respects the configured kernel time budget');
  assert.ok(workflow.includes('timeout-minutes: 240'), 'GitHub job stays longer than GPU training plus monitoring grace');
  assert.ok(workflow.includes('KAGGLE_KERNEL_TIMEOUT_SECONDS="10800"'));
  assert.ok(workflow.includes('KAGGLE_MONITOR_GRACE_SECONDS="600"'));
  assert.ok(workflow.includes('MONITOR_DEADLINE_EPOCH=$(( $(date +%s) + KAGGLE_KERNEL_TIMEOUT_SECONDS + KAGGLE_MONITOR_GRACE_SECONDS ))'));
  assert.ok(workflow.includes('KAGGLE_MONITOR_DEADLINE_EXHAUSTED'));
  assert.ok(!workflow.includes('for attempt in $(seq 1 300); do'), 'old early cutoff must be gone');
  assert.ok(workflow.includes('KAGGLE_GPU_RUN_TIMEOUT: no terminal success observed'));
});

test('Kaggle RUNNING without optimizer evidence is recorded as a distinct permanent LoRA failure',()=> {
  assert.match(workflow,/LAST_MONITOR_STATUS="\$STATUS"/);
  assert.match(workflow,/PROGRESS_OBSERVATION_COUNT=0/);
  assert.match(workflow,/kernel_status_is_not_training_proof:true/);
  assert.match(workflow,/KAGGLE_GPU_RUN_TIMEOUT_NO_PROGRESS/);
  assert.match(workflow,/KAGGLE_GPU_RUN_TIMEOUT_NO_TERMINAL/);
  assert.match(workflow,/artifacts\/lora-trace-timeout\.json/);
  assert.match(workflow,/lora-daily-trace-client\.mjs TRAINING_ERROR artifacts\/lora-trace-timeout\.json RUNNING/);
  assert.match(workflow,/timeoutError\?\.code\|\|'WORKFLOW_FAILED'/);
  assert.match(workflow,/adapter_validated:false/);
  assert.match(workflow,/benchmark_verified:false/);
  assert.match(workflow,/attempt == 60/);
  assert.ok(workflow.includes('KAGGLE_KERNEL_TIMEOUT_SECONDS="10800"'), 'normal kernel budget is not shortened by smoke diagnostics');
});
