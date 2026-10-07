import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('Android voice playback uses media routing and avoids communication-mode barge-in capture', async () => {
  const [player, barge] = await Promise.all([
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelVoicePlayer.kt', root), 'utf8'),
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelBargeInDetector.kt', root), 'utf8'),
  ]);
  assert.match(player, /AudioAttributes\.USAGE_MEDIA/);
  assert.match(player, /AudioManager\.STREAM_MUSIC/);
  assert.doesNotMatch(player, /AudioAttributes\.USAGE_ASSISTANT/);
  assert.match(barge, /MediaRecorder\.AudioSource\.VOICE_RECOGNITION/);
  assert.doesNotMatch(barge, /MediaRecorder\.AudioSource\.VOICE_COMMUNICATION/);
});

test('Android has deterministic PCM48 fallback before MP3 compatibility playback', async () => {
  const vm = await readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt', root), 'utf8');
  assert.match(vm, /client\.tts\(answer, speaker = "luna", format = "pcm"\)/);
  assert.match(vm, /MelVoicePlayer\.playPcm48kMono\(pcm\)/);
  assert.match(vm, /client\.tts\(answer, speaker = "luna", format = "mp3"\)/);
});

test('MINI TTS server constructs a deterministic 48 kHz PCM WAV and Android accepts WAV or raw PCM16', async () => {
  const [server, link, codec] = await Promise.all([
    readFile(new URL('src/devices/waveshare-terminal-api.js', root), 'utf8'),
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt', root), 'utf8'),
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelImaAdpcm.kt', root), 'utf8'),
  ]);
  assert.match(server, /encoding: "linear16"/);
  assert.match(server, /container: "none"/);
  assert.match(server, /wrapPcm16MonoWav\(source, 48000\)/);
  assert.match(server, /"content-type": "audio\/wav"/);
  assert.match(link, /MelImaAdpcm\.decodePcm16Le\(body\)/);
  assert.match(codec, /fun decodePcm16Le\(bytes: ByteArray\): ShortArray/);
});
