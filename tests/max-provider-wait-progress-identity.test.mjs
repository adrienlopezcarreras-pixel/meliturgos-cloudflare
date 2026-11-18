import test from 'node:test';
import assert from 'node:assert/strict';
import { providerWaitProgressIdentity } from '../src/evolution/autonomy-progress-identity.js';

test('deferred provider wait keeps the persisted mission ID without inventing an executable job', () => {
  const result = providerWaitProgressIdentity(null, {
    job_id: 'mel-autonomy-mel-ui-audit-03-1',
    status: 'DEFERRED_PROVIDER_RETRY_PENDING',
    reason: 'PROVIDER_EXHAUSTED_CONTEXT_REQUIRED',
    retry_after: null,
  });
  assert.deepEqual(result, {
    job_id: 'mel-autonomy-mel-ui-audit-03-1',
    provider_wait_reason: 'PROVIDER_EXHAUSTED_CONTEXT_REQUIRED',
  });
});

test('active job ID takes precedence over the external wait identity', () => {
  assert.deepEqual(providerWaitProgressIdentity({ id: 'current-job' }, {
    job_id: 'stale-job', retry_after: 1795000000000, reason: 'PROVIDER_RETRY_COOLDOWN',
  }), {
    job_id: 'current-job',
    provider_wait_reason: 'PROVIDER_RETRY_COOLDOWN',
    provider_retry_after: 1795000000000,
  });
});

test('preserves only valid bounded provider round metadata', () => {
  const result = providerWaitProgressIdentity(null, {
    job_id: 'blocked-job', phase: 'bridge', attempts: 3, max_attempts: 3,
  });
  assert.deepEqual(result, {
    job_id: 'blocked-job', provider_wait_phase: 'bridge',
    provider_wait_attempts: 3, provider_wait_max_attempts: 3,
  });
  assert.deepEqual(providerWaitProgressIdentity(null, {
    phase: 'owner-stop', attempts: -1, max_attempts: '3',
  }), { job_id: null });
});

test('empty and malformed waits never fabricate IDs, reasons or zero-millisecond retries', () => {
  assert.deepEqual(providerWaitProgressIdentity(null, { retry_after: null, reason: '' }), { job_id: null });
  assert.deepEqual(providerWaitProgressIdentity(null, { job_id: '  ', retry_after: '0' }), { job_id: null });
  assert.deepEqual(providerWaitProgressIdentity(null, { retry_after: Number.POSITIVE_INFINITY }), { job_id: null });
});
