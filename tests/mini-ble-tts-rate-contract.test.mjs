import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Android TTS transport uses 16 kHz ADPCM, max sized MTU-safe frames, and reports 48 kHz DAC output', async () => {
  const service = await read('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt');
  const protocol = await read('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2Protocol.kt');
  assert.match(service, /MelImaAdpcm\.decimate48kTo16k\(pcm\)/);
  assert.match(service, /sendAudioResponse\(request\.streamId, compactPcm, outputRate = 16_000/);
  assert.match(service, /val audioBlockSamples = MelImaAdpcm\.BLOCK_SAMPLES/);
  assert.match(service, /\.put\("output_rate", 48_000\)/);
  assert.match(protocol, /const val MIN_AUDIO_MTU = 148/);
});

test('MINI decodes compact 16 kHz frames as native 48 kHz PCM with no duplicate speech fallback', async () => {
  const rx = await read('../firmware/waveshare-terminal/main/mel_link_v2_transport.cpp');
  const terminal = await read('../firmware/waveshare-terminal/main/mel_terminal.cpp');
  assert.match(rx, /audio_input_rate = 48000/);
  assert.match(rx, /rate->valueint == 16000 \|\| rate->valueint == 48000/);
  assert.match(rx, /encoded_rate == 16000/);
  assert.match(rx, /deliver_audio_48k_native\(decoded, decoded_samples, g_active\.audio_input_rate\)/);
  assert.match(rx, /output_rate->valueint == 48000/);
  assert.match(terminal, /if \(!ctx\.first_audio\)\s*\{[\s\S]*?suppressing duplicate fallback/);
  assert.match(terminal, /return false;/);
});
