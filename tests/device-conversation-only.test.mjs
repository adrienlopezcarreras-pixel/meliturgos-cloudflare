import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { answerOwnedDeviceConversation } from '../src/devices/waveshare-terminal-api.js';

test('the phone and MINI get a short conversational answer, never a coding model', async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, input) {
        calls.push({ model, tokens: input.max_tokens });
        return { response: 'Je suis là.' };
      },
    },
  };
  const answer = await answerOwnedDeviceConversation('bonjour', env, { voice: true });
  assert.equal(answer.ok, true);
  assert.equal(answer.response_mode, 'device-conversation');
  assert.equal(answer.text, 'Je suis là.');
  assert.equal(calls[0].model, '@cf/meta/llama-3.1-8b-instruct-fast');
  assert.equal(calls[0].tokens, 120);
  assert.equal(await answerOwnedDeviceConversation('va sur wikipedia.org', env, { voice: true }), null);
  assert.equal(await answerOwnedDeviceConversation('montre une photo du pape', env, { voice: true }), null);
  assert.equal(await answerOwnedDeviceConversation('bonjour', env), null);
  assert.equal(calls.length, 1);
});

test('a transcribed hearing check confirms the microphone and avoids all AI inference', async () => {
  const answer = await answerOwnedDeviceConversation("Bonjour MEL, est-ce que tu m’entends ?", {}, { voice: true });
  assert.equal(answer.ok, true);
  assert.equal(answer.response_mode, 'device-conversation');
  assert.equal(answer.model, 'mini-transcription-health');
  assert.match(answer.text, /voix a bien été transcrite/);
  assert.equal((await answerOwnedDeviceConversation("est ce que tu me reçois ?", {}, { voice: true })).ok, true);
});

test('every unavailable AI model fails bounded on direct voice rather than falling into CHAT 504', async () => {
  const calls = [];
  const env = {
    MEL_MINI_VOICE_ATTEMPT_TIMEOUT_MS: 10,
    AI: {
      async run(model) {
        calls.push(model);
        return await new Promise(() => {});
      },
    },
  };
  const started = Date.now();
  const result = await answerOwnedDeviceConversation('Pourquoi le haut-parleur grésille ?', env, { voice: true });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, 'MINI_VOICE_MODELS_UNAVAILABLE');
  assert.equal(result.response_mode, 'device-conversation');
  assert.equal(calls.length, 3);
  assert.ok(Date.now() - started < 1000, 'test-only 10ms limit should cap total delay');
});

test('ordinary speech survives model errors and French possessive "son"', async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model) {
        calls.push(model);
        if (calls.length === 1) throw Object.assign(new Error('OUT_OF_CAPACITY'), { code: '3040' });
        return { response: 'Le haut-parleur a été réglé.' };
      },
    },
  };
  const reply = await answerOwnedDeviceConversation('Pourquoi son haut-parleur grésille ?', env, { voice: true });
  assert.equal(reply.ok, true);
  assert.equal(reply.text, 'Le haut-parleur a été réglé.');
  assert.equal(calls.length, 2);
  assert.equal(await answerOwnedDeviceConversation('montre une photo du pape', env, { voice: true }), null);
});

test('MINI shows a photo before the web page, and the phone renders it', async () => {
  const firmware = await readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8');
  const phone = await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt', import.meta.url), 'utf8');
  const model = await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt', import.meta.url), 'utf8');
  const card = firmware.slice(firmware.indexOf('static bool render_display_item_card'));
  const photo = card.indexOf('!item.image_url.empty()');
  const page = card.indexOf('open_web_page_on_mini(item.url)');
  assert.ok(photo > 0 && page > photo);
  assert.match(model, /messageFromServer\(/);
  assert.match(phone, /RemoteMediaImage/);
  assert.match(phone, /testTag\("media-audio"\)/);
  assert.match(phone, /testTag\("media-video"\)/);
  assert.match(phone, /testTag\("media-page"\)/);
});
