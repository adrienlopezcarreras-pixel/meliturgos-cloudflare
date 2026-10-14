import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPreviewD1Access } from '../scripts/check-preview-d1-account.mjs';

const accountId = 'a'.repeat(32);
const databaseId = '11111111-2222-3333-4444-555555555555';
const apiToken = 'test-token';
const params = { accountId, databaseId, apiToken };
const reply = (status, value) => ({ status, ok: status >= 200 && status < 300, json: async () => value });

test('read-only GET, no credential exposure and valid database identity', async () => {
  const result = await checkPreviewD1Access({ ...params, fetchImpl: async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.ok(url.endsWith('/d1/database/' + databaseId));
    return reply(200, { success: true, result: { uuid: databaseId } });
  } });
  assert.deepEqual(result, { ok: true, code: 'PREVIEW_D1_READ_ACCESS_VERIFIED' });
});
test('Cloudflare 7403 is rejected without account or token in result', async () => {
  const result = await checkPreviewD1Access({ ...params, fetchImpl: async () =>
    reply(400, { success: false, errors: [{ code: 7403, message: 'Unauthorized' }] }) });
  assert.deepEqual(result, { ok: false, code: 'PREVIEW_D1_ACCOUNT_OR_TOKEN_UNAUTHORIZED' });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(apiToken));
});
test('HTTP authorization denial is rejected', async () => {
  const result = await checkPreviewD1Access({ ...params, fetchImpl: async () =>
    reply(403, { success: false }) });
  assert.equal(result.ok, false);
});
test('mismatched D1 response identity fails closed', async () => {
  const result = await checkPreviewD1Access({ ...params, fetchImpl: async () =>
    reply(200, { success: true, result: { uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } }) });
  assert.equal(result.code, 'PREVIEW_D1_IDENTITY_MISMATCH');
});
test('malformed successful result does not pass', async () => {
  const result = await checkPreviewD1Access({ ...params, fetchImpl: async () =>
    reply(200, { success: true, result: {} }) });
  assert.equal(result.ok, false);
});
test('missing credential fails before network call', async () => {
  const result = await checkPreviewD1Access({ ...params, apiToken: '', fetchImpl: async () => {
    throw Error('must not call');
  } });
  assert.equal(result.code, 'PREVIEW_D1_PREFLIGHT_INPUT_INVALID');
});
