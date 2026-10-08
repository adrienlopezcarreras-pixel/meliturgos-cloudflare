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
  assert.match(workflow,/Finalize durable LoRA smoke trace/);
  assert.match(workflow,/SMOKE_COMPLETED/);
  assert.match(workflow,/Aucun checkpoint ni adaptateur n’est déclaré comme entraînement réussi/);
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
