import test from 'node:test';
import assert from 'node:assert/strict';
import { hasDistinctProviderAttempts } from '../src/evolution/autonomy-provider-attempts.js';

test('autonomous implementation provider attempts require two distinct nonempty identities', () => {
  assert.equal(hasDistinctProviderAttempts(['workers-ai:llama', 'workers-ai:qwen']), true);
  for (const attempts of [
    [],
    ['workers-ai:a'],
    ['workers-ai:a', 'workers-ai:a'],
    ['workers-ai:a', ''],
    ['workers-ai:a', ' workers-ai:b '],
    ['workers-ai:a', null],
    ['workers-ai:a', 12],
    'workers-ai:a;workers-ai:b',
  ]) {
    assert.equal(hasDistinctProviderAttempts(attempts), false, String(attempts));
  }
});
