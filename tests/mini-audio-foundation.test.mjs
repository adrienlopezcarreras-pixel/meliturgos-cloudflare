import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('MINI 0.6.0 pins the physical ES8311/I2S boundary to 48 kHz', async () => {
  const [workflow, terminal] = await Promise.all([
    readFile(new URL('.github/workflows/waveshare-terminal-firmware.yml', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_terminal.cpp', root), 'utf8'),
  ]);

  assert.match(workflow, /I2S_STD_CLK_DEFAULT_CONFIG\(16000\)/);
  assert.match(workflow, /I2S_STD_CLK_DEFAULT_CONFIG\(48000\)/);
  assert.match(workflow, /fs\.sample_rate = 48000;/);
  assert.match(workflow, /0\.6\.0-audio-foundation/);
  assert.match(terminal, /VOICE_CAPTURE_RATE = 48000/);
  assert.match(terminal, /VOICE_STT_RATE = 16000/);
});

test('MINI STT and wake use an explicit anti-alias decimator instead of average-of-three', async () => {
  const terminal = await readFile(
    new URL('firmware/waveshare-terminal/main/mel_terminal.cpp', root),
    'utf8'
  );

  assert.match(terminal, /VOICE_DECIMATOR_TAPS = 31/);
  assert.match(terminal, /VOICE_DECIMATOR_Q15/);
  assert.match(terminal, /decimate_48k_to_16k\(/);
  assert.doesNotMatch(
    terminal,
    /capture\[j\]\s*\+\s*capture\[j\s*\+\s*1\]\s*\+\s*capture\[j\s*\+\s*2\]/
  );
  assert.doesNotMatch(
    terminal,
    /raw\[j\]\s*\+\s*raw\[j\s*\+\s*1\]\s*\+\s*raw\[j\s*\+\s*2\]/
  );
});

test('MINI explicitly drives NS4150B PA_CTRL on TCA9554 P2', async () => {
  const [main, terminal] = await Promise.all([
    readFile(new URL('firmware/waveshare-terminal/main/main.cpp', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_terminal.cpp', root), 'utf8'),
  ]);

  assert.match(main, /mini_speaker_amp_set\(bool enabled\)/);
  assert.match(main, /IO_EXPANDER_PIN_NUM_2/);
  assert.match(main, /PA_CTRL=%s/);
  assert.match(terminal, /mini_speaker_amp_set\(true\)/);
  assert.match(terminal, /mini_speaker_amp_set\(false\)/);
});

test('legacy TTS service now matches the canonical 48 kHz playback boundary', async () => {
  const api = await readFile(
    new URL('src/devices/waveshare-terminal-api.js', root),
    'utf8'
  );

  assert.match(api, /sample_rate:\s*48000/);
  assert.match(api, /x-mel-audio-rate", "48000"/);
  assert.doesNotMatch(api, /sample_rate:\s*16000/);
});
