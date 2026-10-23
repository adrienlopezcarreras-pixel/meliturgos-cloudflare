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
  assert.match(bridge, /requeueStaleTeacherApproval\(jobRepository, job\.id, bridgePreparation\.code\)/);
  assert.match(bridge, /else \{\s*await persistBridgePreparationDiagnostic/);
});
