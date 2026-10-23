import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('runtime tick dispatches READY work to cloud without local executor admission', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /bridge_preparation_ready/);
  assert.doesNotMatch(source, /\[ \"\$ONLINE\" = \"true\" \]/);
  assert.doesNotMatch(source, /MAX_BLOCKED_WAITING_EXTERNAL_WITHOUT_EXECUTOR/);
  assert.match(source, /gen2-42-apply-ready-bridge\.yml\/dispatches/);
  assert.match(source, /CLOUD_BRIDGE_DISPATCHED/);
  assert.match(source, /actions:\s*write/);
});

test('cloud bridge workflow claims exact job, reconciles main, and reports result back to D1', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  assert.match(source, /Claim exact READY bridge package atomically/);
  assert.match(source, /"job_id":process\.env\.JOB_ID|job_id:process\.env\.JOB_ID/);
  assert.match(source, /ALREADY_SATISFIED_ON_MAIN/);
  assert.match(source, /\/api\/dev-bridge\/result/);
  assert.match(source, /SKIPPED_NOT_CLAIMABLE/);
  assert.match(source, /GITHUB_CLOUD_BRIDGE/);
  assert.match(source, /Prepare GitHub OIDC bridge identity/);
  assert.doesNotMatch(source, /MEL_CLOUD_BRIDGE_TOKEN/);
  assert.match(source, /gen2-42-cloud-bridge\n/);
  assert.doesNotMatch(source, /secrets\.MEL_DEV_BRIDGE_TOKEN/);
});


test('cloud bridge keeps runtime payloads outside the Git worktree before candidate checkout', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  assert.match(source, /BRIDGE_JOB_FILE=.*RUNNER_TEMP/);
  assert.match(source, /--output "\$BRIDGE_JOB_FILE"/);
  assert.match(source, /git clean -fd/);
  assert.doesNotMatch(source, /--output bridge-job\.json/);
  assert.doesNotMatch(source, /readFileSync\(['"]bridge-job\.json/);
});


test('cloud bridge persists candidate hygiene failures instead of crashing the claimed job', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  assert.match(source, /candidate hygiene/);
  assert.match(source, /git\.diff\.cached\.check/);
  assert.match(source, /CANDIDATE_HYGIENE_FAILED/);
  assert.match(source, /candidate_ready=false/);
  assert.match(source, /status:'REPAIR_REQUIRED'/);
});

test('cloud bridge retries transient D1 result authorization and has an emergency claimed-job report', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  assert.match(source, /Cloud bridge result propagation attempt/);
  assert.match(source, /Persist claimed bridge failure before exit/);
  assert.match(source, /id: report_emergency/);
  assert.match(source, /Emergency bridge result attempt/);
  assert.match(source, /steps\.report_emergency\.outcome == 'success'/);
  assert.match(source, /REPORT_READY=0/);
});

test('cloud bridge normalizes trailing whitespace before hygiene and tests', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  assert.match(source, /CANDIDATE_TRAILING_WHITESPACE_NORMALIZED/);
  assert.match(source, /body\.replace\(\/\[ \\t\]\+\(\?=\\r\?\\n\|\$\)\/g,''\)/);
  const normalizePos = source.indexOf('CANDIDATE_TRAILING_WHITESPACE_NORMALIZED');
  const hygienePos = source.indexOf('git diff --check');
  const testStepPos = source.indexOf('- name: Run exact bounded requested tests');
  assert.ok(normalizePos >= 0 && hygienePos > normalizePos && testStepPos > hygienePos);
});


test('bridge cancels as already satisfied only when the candidate also matches the package', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  const reconcile = source.slice(source.indexOf('Reconcile package already satisfied on main'), source.indexOf('bridge-main-exact.txt'));
  assert.match(reconcile, /git',\['show',`\$\{process\.env\.CANDIDATE_SHA\}:\$\{rel\}`\]/);
});
