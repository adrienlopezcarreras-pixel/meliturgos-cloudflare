import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runNativeInference } from '../src/api/native-chat.js';

function envWithAI() {
  const calls = [];
  return {
    calls,
    AI: {
      async run(model, payload) {
        calls.push({ model, payload });
        return { response: `reply:${model}` };
      }
    }
  };
}

test('native inference uses Augmentio fan-out through CapabilityBus when parallel is enabled', async () => {
  const env = envWithAI();
  const messages = [
    { role: 'system', content: 'system-policy' },
    { role: 'user', content: 'bonjour' }
  ];
  const result = await runNativeInference({ env, messages, text: 'bonjour', parallel: true, maxCandidates: 3 });

  assert.equal(result.augmentio_used, true);
  assert.equal(env.calls.length, 3);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.provider, 'workers-ai');
  assert.equal(result.provenance.provider, 'workers-ai');
  assert.deepEqual(env.calls[0].payload.messages, messages);
});

test('native inference preserves single-route behavior by default', async () => {
  const env = envWithAI();
  const messages = [{ role: 'user', content: 'bonjour' }];
  const result = await runNativeInference({ env, messages, text: 'bonjour' });

  assert.notEqual(result.augmentio_used, true);
  assert.equal(env.calls.length, 1);
  assert.equal(result.provider, 'workers-ai');
  assert.equal(result.text.startsWith('reply:'), true);
});

test('native chat cannot construct a private Augmentio path outside CapabilityBus', async () => {
  const source = await readFile(new URL('../src/api/native-chat.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"]\.\.\/augmentio\/augmentio\.js['"]/);
  assert.doesNotMatch(source, /createDefaultAugmentioPool/);
  assert.match(source, /bus\.execute\(['"]augmentio\.fanout['"]/);
});
