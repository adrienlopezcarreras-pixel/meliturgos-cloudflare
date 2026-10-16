import test from 'node:test';
import assert from 'node:assert/strict';
import { ComputeCache } from '../src/augmentio/compute-cache.js';

test('Augmentio cache evicts least-recently-used responses instead of growing without bound', async () => {
  const cache = new ComputeCache({ maxEntries: 2, ttlMs: 60_000 });
  await cache.set({ prompt: 'a' }, { answer: 'a' });
  await cache.set({ prompt: 'b' }, { answer: 'b' });
  assert.deepEqual(await cache.get({ prompt: 'a' }), { answer: 'a' });
  await cache.set({ prompt: 'c' }, { answer: 'c' });
  assert.equal(cache.entries.size, 2);
  assert.equal(await cache.get({ prompt: 'b' }), null);
  assert.deepEqual(await cache.get({ prompt: 'a' }), { answer: 'a' });
  assert.deepEqual(await cache.get({ prompt: 'c' }), { answer: 'c' });
});

test('Augmentio cache removes expired entries on unrelated writes and skips disabled TTL', async () => {
  const cache = new ComputeCache({ maxEntries: 2, ttlMs: 60_000 });
  const oldKey = await cache.set('old', { text: 'stale' });
  cache.entries.get(oldKey).expiresAt = Date.now() - 1;
  await cache.set('new', { text: 'fresh' });
  assert.equal(cache.entries.has(oldKey), false);
  assert.equal(await cache.get('old'), null);
  await cache.set('disabled', { text: 'do not retain' }, 0);
  assert.equal(await cache.get('disabled'), null);
  assert.equal(cache.entries.size, 1);
});

test('Augmentio cache stores isolated copies and caps invalid size settings', async () => {
  const cache = new ComputeCache({ maxEntries: Infinity, ttlMs: 60_000 });
  assert.equal(cache.maxEntries, 256);
  const input = { nested: 'key' };
  const value = { nested: { text: 'original' } };
  await cache.set(input, value);
  value.nested.text = 'changed';
  const cached = await cache.get(input);
  assert.equal(cached.nested.text, 'original');
  cached.nested.text = 'mutated';
  assert.equal((await cache.get(input)).nested.text, 'original');
  assert.equal(new ComputeCache({ maxEntries: 100000 }).maxEntries, 1024);
});

test('Augmentio cache keys distinguish empty, undefined, sparse and null arrays', async () => {
  const cache = new ComputeCache();
  const keys = await Promise.all([
    [],
    [undefined],
    Array(1),
    [null],
    [NaN],
    [Infinity],
    [-Infinity],
    [0],
    [-0],
  ].map(value => cache.key({ input: value })));
  assert.equal(new Set(keys).size, keys.length,
    'distinct AI request shapes must never retrieve each other\'s cached answer');
  await cache.set({ input: [] }, { text: 'only for empty input' });
  assert.equal(await cache.get({ input: [undefined] }), null);
  assert.equal(await cache.get({ input: Array(1) }), null);
  assert.equal(await cache.get({ input: [null] }), null);
});

test('Augmentio cache preserves canonical plain-object key ordering', async () => {
  const cache = new ComputeCache();
  assert.equal(
    await cache.key({ context: { b: 2, a: 1 }, input: 'question' }),
    await cache.key({ input: 'question', context: { a: 1, b: 2 } }),
  );
  assert.notEqual(await cache.key({ context: { a: undefined } }),
    await cache.key({ context: {} }));
});

test('Augmentio cache keys distinguish special objects from empty objects', async () => {
  const cache = new ComputeCache();
  const keys = await Promise.all([
    {},
    new Date('2026-10-16T00:00:00Z'),
    new URL('https://example.invalid/a'),
    new Map([['key', 'value']]),
    new Set(['key']),
  ].map(value => cache.key({ context: value })));
  assert.equal(new Set(keys).size, keys.length);
});

test('Augmentio cache refuses cyclic and unsupported non-data inputs rather than aliasing requests', async () => {
  const cache = new ComputeCache();
  const circular = {};
  circular.self = circular;
  await assert.rejects(cache.key({ input: circular }), { name: 'TypeError', message: 'AUGMENTIO_CACHE_KEY_UNSUPPORTED' });
  await assert.rejects(cache.key({ input: () => 'not a cache key' }), { name: 'TypeError', message: 'AUGMENTIO_CACHE_KEY_UNSUPPORTED' });
  await assert.rejects(cache.key({ input: Symbol('ambiguous') }), { name: 'TypeError', message: 'AUGMENTIO_CACHE_KEY_UNSUPPORTED' });
});
