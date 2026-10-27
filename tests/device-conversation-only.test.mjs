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
  assert.equal(result.code, 'MINI_VOICE_PROVIDER_TIMEOUT');
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


test('a spent Workers AI neuron budget is reported immediately without trying other models', async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, input) {
        calls.push({model, input});
        throw Object.assign(new Error('WORKERS_AI_DAILY_NEURON_BUDGET_EXHAUSTED:9000/9000'), {
          code: 'WORKERS_AI_DAILY_NEURON_BUDGET_EXHAUSTED',
          status: 429
        });
      },
    },
  };
  const answer = await answerOwnedDeviceConversation('Raconte-moi une histoire courte', env, { voice: true });
  assert.equal(answer.ok, false);
  assert.equal(answer.code, 'MINI_VOICE_DAILY_BUDGET_EXHAUSTED');
  assert.equal(answer.status, 429);
  assert.equal(answer.detail, 'WORKERS_AI_DAILY_NEURON_BUDGET_EXHAUSTED');
  assert.match(answer.retry_after_utc, /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  assert.equal(calls.length, 1, 'account-wide quota is not retried on alternate models');
  assert.equal(calls[0].input.neuron_reserve, true, 'must bypass long PC fallback via budget wrapper');
});

test('Cloudflare free allocation error 3036 inside message is not retried', async () => {
  let calls = 0;
  const response = await answerOwnedDeviceConversation('Raconte une blague', {
    AI: {run: async () => {calls++; throw new Error('Workers AI error 3036: you have used up your daily free allocation');}},
  }, {voice:true});
  assert.equal(response.code,'MINI_VOICE_DAILY_BUDGET_EXHAUSTED');
  assert.equal(response.status,429);
  assert.equal(calls,1);
});

test('budget D1 outage is reported rather than hidden as a provider model failure', async () => {
  let calls = 0;
  const result = await answerOwnedDeviceConversation('Bonjour tout le monde', {
    AI: {run: async () => { calls++; throw Object.assign(new Error('database unavailable'), {code:'WORKERS_AI_NEURON_BUDGET_UNAVAILABLE'}); }},
  }, {voice:true});
  assert.equal(result.code, 'MINI_VOICE_BUDGET_CHECK_UNAVAILABLE');
  assert.equal(result.detail, 'WORKERS_AI_NEURON_BUDGET_UNAVAILABLE');
  assert.equal(result.status, 503);
  assert.equal(calls, 1);
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

test('MINI public-photo requests have a dedicated sourced display path before native chat', async () => {
  const source = await readFile(new URL('../src/devices/waveshare-terminal-api.js', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf('async function deviceChat('), source.indexOf('async function deviceVoice('));
  assert.match(handler, /inferChatMediaCapability\(text\)/);
  assert.match(handler, /pictureIntent\?\.id === "web\.images\.search"/);
  assert.match(handler, /runtime\.bus\.execute\("web\.images\.search"/);
  assert.match(handler, /display: \{ title: "Photos", items \}/);
  assert.ok(handler.indexOf('pictureIntent?.id') < handler.indexOf('handleNativeChat('),
    'photo search must finish before the legacy chat inference route');
  assert.match(handler, /MINI_IMAGE_SEARCH_FAILED/);
});
