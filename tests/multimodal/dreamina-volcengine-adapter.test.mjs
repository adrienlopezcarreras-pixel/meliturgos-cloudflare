import test from 'node:test';
import assert from 'node:assert/strict';
import { DreaminaVolcengineAdapter } from '../../src/multimodal/dreamina-volcengine-adapter.js';
import { normalizeGenerationRequest } from '../../src/multimodal/provider-contract.js';

test('Dreamina adapter is disabled by default and performs no network call', async () => {
  let calls = 0;
  const adapter = new DreaminaVolcengineAdapter({
    apiKey: 'fixture-key',
    fetchImpl: async () => { calls += 1; throw new Error('network must not be reached'); },
  });

  assert.equal(adapter.capability().enabled, false);
  await assert.rejects(
    () => adapter.generate({ prompt: 'A calm portrait of MEL', approvedPaidCall: true }),
    error => error?.code === 'PAID_PROVIDER_NOT_APPROVED:dreamina-volcengine' && error?.status === 403,
  );
  assert.equal(calls, 0);
});

test('Dreamina adapter also requires explicit approval for each paid call', async () => {
  let calls = 0;
  const adapter = new DreaminaVolcengineAdapter({
    apiKey: 'fixture-key',
    paidAccessEnabled: true,
    fetchImpl: async () => { calls += 1; throw new Error('network must not be reached'); },
  });

  await assert.rejects(
    () => adapter.generate({ prompt: 'A calm portrait of MEL' }),
    error => error?.code === 'PAID_PROVIDER_NOT_APPROVED:dreamina-volcengine',
  );
  assert.equal(calls, 0);
});

test('Dreamina adapter fails closed when credential is absent', async () => {
  const adapter = new DreaminaVolcengineAdapter({ paidAccessEnabled: true });
  await assert.rejects(
    () => adapter.generate({ prompt: 'A calm portrait of MEL', approvedPaidCall: true }),
    error => error?.code === 'DREAMINA_API_KEY_MISSING' && error?.status === 503,
  );
});

test('Dreamina adapter sends a normalized Seedream image request after both approvals', async () => {
  let captured;
  const adapter = new DreaminaVolcengineAdapter({
    apiKey: 'fixture-key',
    paidAccessEnabled: true,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        async json() {
          return {
            model: 'fixture-seedream',
            created: 123,
            data: [{ url: 'https://example.invalid/result.png', size: '2048x2048' }],
            usage: { generated_images: 1 },
          };
        },
      };
    },
  });

  const result = await adapter.generate({
    prompt: '  A calm portrait of MEL  ',
    referenceImages: ['https://example.invalid/reference.png'],
    approvedPaidCall: true,
    watermark: false,
  });

  assert.match(captured.url, /images\/generations$/);
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.Authorization, 'Bearer fixture-key');
  const body = JSON.parse(captured.options.body);
  assert.equal(body.prompt, 'A calm portrait of MEL');
  assert.equal(body.image, 'https://example.invalid/reference.png');
  assert.equal(body.response_format, 'url');
  assert.equal(body.watermark, false);
  assert.equal(result.provider, 'dreamina-volcengine');
  assert.deepEqual(result.outputs, [{ url: 'https://example.invalid/result.png', size: '2048x2048' }]);
});

test('multimodal request rejects more than ten reference images', () => {
  assert.throws(
    () => normalizeGenerationRequest({
      prompt: 'fixture',
      referenceImages: Array.from({ length: 11 }, (_, index) => `https://example.invalid/${index}.png`),
    }),
    error => error?.code === 'TOO_MANY_REFERENCE_IMAGES',
  );
});
