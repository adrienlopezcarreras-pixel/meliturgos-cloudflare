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

test('MINI prefers local Android fr-FR synthesis and keeps strict WAV server fallback', async () => {
  const android = await readFile(
    new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt', import.meta.url),
    'utf8'
  );
  const synth = await readFile(
    new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelMiniVoiceSynthesizer.kt', import.meta.url),
    'utf8'
  );
  const server = await readFile(
    new URL('../src/devices/waveshare-terminal-api.js', import.meta.url),
    'utf8'
  );

  assert.match(android, /MelMiniVoiceSynthesizer\.synthesizePcm48kMono/);
  assert.match(android, /MINI V2 · VOIX FR LOCALE/);
  assert.match(android, /MelImaAdpcm\.decodePcm16MonoWav\(body, 48_000\)/);
  assert.doesNotMatch(android, /MelImaAdpcm\.decodePcm16Le\(body\)/);

  assert.match(synth, /Locale\.FRANCE/);
  assert.match(synth, /onBeginSynthesis/);
  assert.match(synth, /onAudioAvailable/);
  assert.match(synth, /OUTPUT_RATE = 48_000/);

  assert.match(server, /encoding: "linear16"/);
  assert.match(server, /container: "wav"/);
  assert.match(server, /TTS_WAV_REQUIRED/);
});


test('Android Link V2 synthesizes MINI speech locally in French before server TTS fallback', async () => {
  const [service, synth] = await Promise.all([
    readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt', import.meta.url), 'utf8'),
    readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelMiniVoiceSynthesizer.kt', import.meta.url), 'utf8'),
  ]);
  const requestStart = service.indexOf('private fun executeRequest(request: IncomingRequest)');
  const relayStart = service.indexOf('var connection: java.net.HttpURLConnection?', requestStart);
  const localIndex = service.indexOf('MelMiniVoiceSynthesizer.synthesizePcm48kMono', requestStart);
  assert.ok(requestStart >= 0 && localIndex >= 0 && relayStart >= 0 && localIndex < relayStart);
  assert.match(service, /MINI V2 · VOIX FR LOCALE/);
  assert.match(service, /sendAudioResponse\(request\.streamId, pcm, outputRate = 48_000\)/);
  assert.doesNotMatch(service, /else \{\s*MelImaAdpcm\.decodePcm16Le\(body\)/);
  assert.match(synth, /setLanguage\(Locale\.FRANCE\)/);
  assert.match(synth, /fun warmup\(context: Context\)/);
  assert.match(service, /mel-mini-tts-warmup/);
  assert.match(synth, /onBeginSynthesis/);
  assert.match(synth, /onAudioAvailable/);
  assert.match(synth, /Handler\(Looper\.getMainLooper\(\)\)\.post \{[\s\S]*?val ready = ref\.get\(\)/);
  assert.match(synth, /ENCODING_PCM_16BIT/);
  assert.match(synth, /resampleLinear/);
});


test('MINI local French synthesis does not depend on MINI server token', async () => {
  const service = await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt', import.meta.url), 'utf8');
  const start = service.indexOf('if (method == "POST" && path == "/api/device/v1/voice/tts")');
  const end = service.indexOf('val isPair = path == "/api/device/v1/pair"', start);
  const local = service.slice(start, end);
  assert.match(local, /MelMiniVoiceSynthesizer\.synthesizePcm48kMono/);
  assert.doesNotMatch(local, /MiniTokenVault/);
  assert.match(local, /if \(!sent && !outboundCancelled\(request\.streamId\)\)/);
});
