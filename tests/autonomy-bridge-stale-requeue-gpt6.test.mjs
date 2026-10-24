import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('[GPT6] stale Teacher approvals from Bridge preparation requeue for fresh review', () => {
  const source = readFileSync('src/evolution/autonomy-runtime-core.js', 'utf8');
  const start = source.indexOf('bridgePreparation = await prepareApprovedBridgePackage(');
  const end = source.indexOf('const state = await supervisor.state();', start);
  assert.ok(start > 0 && end > start);
  const bridge = source.slice(start, end);
  assert.match(bridge, /STALE_TEACHER_APPROVAL_CODES\.has\(bridgePreparation\.code\)/);
  assert.match(bridge, /requeueStaleTeacherApproval\(jobRepository, job\.id, bridgePreparation\.code, error\)/);
  assert.match(bridge, /else \{\s*await persistBridgePreparationDiagnostic/);
});

test('[GPT6] recognizes Bridge preparer real stale SHA diagnostics', () => {
  const runtime = readFileSync('src/evolution/autonomy-runtime-core.js', 'utf8');
  const preparer = readFileSync('src/evolution/autonomy-bridge-preparer.js', 'utf8');
  for (const code of ['BRIDGE_PREPARATION_CANDIDATE_STALE', 'CANDIDATE_HEAD_CHANGED_DURING_INSPECTION']) {
    assert.ok(preparer.includes(code), code + ' emitted by Bridge preparer');
    assert.match(runtime.slice(runtime.indexOf('const STALE_TEACHER_APPROVAL_CODES'),runtime.indexOf('const DIAGNOSTIC_REFRESH_MS')),new RegExp(code));
  }
});

test('[GPT6] SHA drift evidence survives Teacher requeue for diagnosis', () => {
  const runtime = readFileSync('src/evolution/autonomy-runtime-core.js', 'utf8');
  const start = runtime.indexOf('async function requeueStaleTeacherApproval(');
  const end = runtime.indexOf('export async function persistBridgePreparationDiagnostic(', start);
  const requeue = runtime.slice(start, end);
  assert.match(requeue, /staleError\?\.approved_candidate_sha/);
  assert.match(requeue, /staleError\?\.observed_sha/);
  assert.match(requeue, /approved_candidate_sha: expectedSha/);
  assert.match(requeue, /observed_candidate_sha: observedSha/);
  assert.match(requeue, /result\.teacher_bridge = null/);
});

test('[GPT6] direct Bridge head mismatch carries both SHAs into durable recovery', () => {
  const source = readFileSync('src/evolution/autonomy-bridge-preparer.js', 'utf8');
  const mismatch = source.slice(source.indexOf('if (!SHA40.test(String(headBefore'));
  assert.match(mismatch, /expected_sha: approvedSha/);
  assert.match(mismatch, /observed_sha: SHA40\.test\(String\(headBefore\?\.sha/);
  assert.match(mismatch, /observed_sha: SHA40\.test\(String\(headAfter\?\.sha/);
});

test('[GPT6] Bridge immutable source inspection is opt-in and preserves strict default', () => {
  const source = readFileSync('src/evolution/autonomy-bridge-preparer.js','utf8');
  const inspect = source.slice(source.indexOf('async function inspectSources('), source.indexOf('function normalizeTests(',source.indexOf('async function inspectSources(')));
  assert.match(inspect,/MEL_IMMUTABLE_PLANNING_ENABLED !== 'true'/);
  assert.match(inspect,/return await reader\.approvedSnapshot\(\)/);
  assert.match(inspect,/CODE_APPROVED_SNAPSHOT_UNAVAILABLE/);
  assert.match(inspect,/return reader\.head\(\)/);
  assert.match(inspect,/BRIDGE_PREPARATION_CANDIDATE_STALE/);
  assert.match(inspect,/CANDIDATE_HEAD_CHANGED_DURING_INSPECTION/);
});
