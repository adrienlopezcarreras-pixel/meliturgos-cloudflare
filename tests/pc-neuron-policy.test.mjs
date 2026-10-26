import test from 'node:test';
import assert from 'node:assert/strict';
import { pcCanHandle } from '../src/models/pc-neuron-policy.js';

test('the PC takes ordinary text and leaves the rest on neurons', () => {
  assert.equal(pcCanHandle('@cf/openai/gpt-oss-120b', { messages: [{ role: 'user', content: 'bonjour' }], stream: true }), true);
  assert.equal(pcCanHandle('@cf/openai/gpt-oss-120b', { neuron_reserve: true, messages: [{ role: 'user', content: 'vote' }] }), false);
  assert.equal(pcCanHandle('@cf/openai/gpt-oss-120b', { lora: 'uncensored', messages: [{ role: 'user', content: 'x' }] }), false);
  assert.equal(pcCanHandle('@cf/bytedance/stable-diffusion-xl-lightning', { prompt: 'cercle' }), false);
  assert.equal(pcCanHandle('@cf/deepgram/aura-1', { messages: [{ role: 'user', content: 'bonjour' }] }), false);
  assert.equal(pcCanHandle('@cf/openai/whisper-large-v3-turbo', { audio: new Uint8Array() }), false);
});
