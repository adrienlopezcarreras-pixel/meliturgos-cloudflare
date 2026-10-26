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
  const answer = await answerOwnedDeviceConversation('bonjour', env);
  assert.equal(answer.ok, true);
  assert.equal(answer.response_mode, 'device-conversation');
  assert.equal(answer.text, 'Je suis là.');
  assert.equal(calls[0].model, '@cf/zai-org/glm-4.7-flash');
  assert.equal(calls[0].tokens, 120);
  assert.equal(await answerOwnedDeviceConversation('va sur wikipedia.org', env), null);
  assert.equal(await answerOwnedDeviceConversation('montre une photo du pape', env), null);
  assert.equal(calls.length, 1);
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
