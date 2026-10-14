import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePreviewBindings } from '../scripts/resolve-preview-bindings.mjs';

const production = '11111111-1111-1111-1111-111111111111';
const preview = '22222222-2222-2222-2222-222222222222';
const config = { name: 'meliturgos', env: { preview: { vars: { MEL_PREVIEW_ISOLATED: 'true' } } },
  d1_databases: [{ database_id: production }], r2_buckets: [{ bucket_name: 'production-media' }] };
const env = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'private-token' };
const bindings = [{ type: 'd1', name: 'DB', id: preview }, { type: 'r2_bucket', name: 'MEDIA_BUCKET', bucket_name: 'preview-media' }];
const response = rows => ({ ok: true, json: async () => ({ success: true, result: { bindings: rows } }) });

test('missing preview identities are recovered from exactly one read-only preview settings request', async () => {
  let calls = 0;
  const found = await resolvePreviewBindings({ config, env, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/meliturgos-preview/settings`);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    return response([...bindings, { type: 'secret_text', name: 'PRIVATE', text: 'never-return' }]);
  } });
  assert.equal(calls, 1);
  assert.deepEqual(found, { d1: preview, bucket: 'preview-media' });
});

test('explicit configured identities avoid API access and retain downstream validation', async () => {
  assert.deepEqual(await resolvePreviewBindings({ config, env: { MEL_PREVIEW_D1_DATABASE_ID: preview, MEL_PREVIEW_R2_BUCKET: 'preview-media' },
    fetchImpl: () => { throw Error('unexpected network'); } }), { d1: preview, bucket: 'preview-media' });
});

test('discovery rejects production bindings, duplicates, missing bindings and conflicting database IDs', async () => {
  for (const rows of [[], [...bindings, bindings[0]], [{ ...bindings[0], id: production }, bindings[1]],
    [bindings[0], { ...bindings[1], bucket_name: 'production-media' }],
    [{ ...bindings[0], database_id: production }, bindings[1]]]) {
    await assert.rejects(resolvePreviewBindings({ config, env, fetchImpl: async () => response(rows) }), /PREVIEW_DISCOVERY_/);
  }
});

test('permission and network failures are sanitized and never reveal credentials or API bodies', async () => {
  for (const fetchImpl of [async () => { throw Error('private-token'); }, async () => ({ ok: false, status: 403 }),
    async () => ({ ok: true, json: async () => { throw Error('private-token'); } })]) {
    await assert.rejects(resolvePreviewBindings({ config, env, fetchImpl }), e => e.message.startsWith('PREVIEW_DISCOVERY_') && !e.message.includes('private-token'));
  }
  await assert.rejects(resolvePreviewBindings({ config: { ...config, name: 'production' }, env }), /TARGET_INVALID/);
});
