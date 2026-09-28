import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MINI and Android keep the same canonical MEL avatar', async () => {
  const [canonical, android, miniUi] = await Promise.all([
    readFile(new URL('../dist/assets/avatars/mel-full.webp', import.meta.url)),
    readFile(new URL('../android-companion/app/src/main/res/drawable-nodpi/mel_futuristic_new.webp', import.meta.url)),
    readFile(new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url), 'utf8'),
  ]);

  assert.equal(Buffer.compare(canonical, android), 0, 'Android avatar must stay byte-identical to mel-full.webp');
  assert.match(miniUi, /lv_img_set_src\(avatar_obj,\s*&mel_avatar_mode_complet\)/);
});

test('MINI second voice action stops and finalizes an active recording', async () => {
  const source = await readFile(
    new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /if \(g_voice_task_handle\) \{[\s\S]*?g_runtime_state == MEL_TERMINAL_LISTENING[\s\S]*?g_voice_stop_requested = true;[\s\S]*?VOICE STOP requested by second press/
  );
});

test('MINI TTS playback contract remains PCM 16-bit mono at 48 kHz', async () => {
  const [runtime, apiTests] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8'),
    readFile(new URL('./waveshare-terminal-api.test.mjs', import.meta.url), 'utf8'),
  ]);

  assert.match(runtime, /channels != 1/);
  assert.match(runtime, /sample_rate != 48000/);
  assert.match(runtime, /bits_per_sample != 16/);
  assert.match(apiTests, /@cf\/deepgram\/aura-1/);
  assert.match(apiTests, /speaker:'luna'/);
  assert.match(apiTests, /sample_rate:48000/);
});

test('MINI and Android BLE bridge UUIDs stay aligned', async () => {
  const [mini, android] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/mel_mobile_bridge.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelBleBridgeService.kt', import.meta.url), 'utf8'),
  ]);

  assert.match(mini, /MEL_BRIDGE_SERVICE = 0xABF0/);
  assert.match(mini, /MEL_BRIDGE_RX = 0xABF1/);
  assert.match(mini, /MEL_BRIDGE_TX = 0xABF2/);

  assert.match(android, /0000abf0-0000-1000-8000-00805f9b34fb/);
  assert.match(android, /0000abf1-0000-1000-8000-00805f9b34fb/);
  assert.match(android, /0000abf2-0000-1000-8000-00805f9b34fb/);

  assert.doesNotMatch(mini, /7d4b000[123]/i);
  assert.doesNotMatch(android, /7d4b000[123]/i);
});
