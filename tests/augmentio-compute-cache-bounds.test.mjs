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
