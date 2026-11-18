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

test('empty and malformed waits never fabricate IDs, reasons or zero-millisecond retries', () => {
  assert.deepEqual(providerWaitProgressIdentity(null, { retry_after: null, reason: '' }), { job_id: null });
  assert.deepEqual(providerWaitProgressIdentity(null, { job_id: '  ', retry_after: '0' }), { job_id: null });
  assert.deepEqual(providerWaitProgressIdentity(null, { retry_after: Number.POSITIVE_INFINITY }), { job_id: null });
});
