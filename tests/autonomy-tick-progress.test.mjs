import test from 'node:test';
import assert from 'node:assert/strict';
import { autonomyTickAdvanced } from '../src/evolution/autonomy-runtime-core.js';

test('a tick advances only when a job actually moves', () => {
  assert.equal(autonomyTickAdvanced(['JOB_CREATED', 'TEACHER_REQUEST_MIRRORED', 'OWNER_MAX_APPROVAL_APPLIED']), false);
  assert.equal(autonomyTickAdvanced(['JOB_STATE_ADVANCED']), true);
  assert.equal(autonomyTickAdvanced(['JOB_COMPLETED']), true);
  assert.equal(autonomyTickAdvanced([]), false);
});
