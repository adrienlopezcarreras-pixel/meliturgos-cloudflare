import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const contract = JSON.parse(await read('contracts/mel-link-v2.json'));

test('canonical Link V2 contract agrees with firmware and Android frame ABI', async () => {
  const [miniProtocol, androidProtocol] = await Promise.all([
    read('firmware/waveshare-terminal/main/mel_link_v2_protocol.h'),
    read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2Protocol.kt'),
  ]);
  assert.equal(contract.schema, 'mel.link-v2.contract.v1');
  assert.match(miniProtocol, new RegExp('MEL_LINK_V2_PROTOCOL_VERSION\\s+' + contract.protocol.version));
  assert.match(androidProtocol, new RegExp('const val VERSION = ' + contract.protocol.version));
  assert.match(miniProtocol, /MEL_LINK_V2_MAGIC0\s+0x4d/);
  assert.match(miniProtocol, /MEL_LINK_V2_MAGIC1\s+0x32/);
  assert.match(androidProtocol, /const val MAGIC0: Int = 0x4d/);
  assert.match(androidProtocol, /const val MAGIC1: Int = 0x32/);
  assert.match(miniProtocol, new RegExp('MEL_LINK_V2_HEADER_SIZE\\s+' + contract.protocol.headerBytes));
  assert.match(androidProtocol, new RegExp('const val HEADER_SIZE = ' + contract.protocol.headerBytes));
  assert.equal(contract.protocol.headerFields.reduce((n, field) => n + field.bytes, 0), contract.protocol.headerBytes);
  assert.match(miniProtocol, /uint16_t payload_len/);
  assert.match(androidProtocol, /payload.size <= 0xffff/);
  assert.match(androidProtocol, /ByteOrder.LITTLE_ENDIAN/);
  assert.match(miniProtocol, /MEL_LINK_V2_DEFAULT_MTU\s+185/);
  assert.match(androidProtocol, /const val DEFAULT_MTU = 185/);
  assert.match(androidProtocol, /const val MIN_AUDIO_MTU = 148/);
  assert.match(miniProtocol, /MEL_LINK_V2_CREDIT_WINDOW\s+6/);
  assert.match(androidProtocol, /const val CREDIT_WINDOW = 6/);

  for (const frame of contract.protocol.frames) {
    assert.match(miniProtocol, new RegExp('MEL_LINK_V2_' + frame.name + '\\s*=\\s*' + frame.hex),
      'firmware opcode must match contract: ' + frame.name);
    assert.match(androidProtocol, new RegExp('const val ' + frame.name + '\\s*=\\s*' + frame.hex),
      'Android opcode must match contract: ' + frame.name);
  }
});

test('canonical Link V2 audio, timing, credit and cancellation values agree with implementation', async () => {
  const [miniAudio, miniTransport, miniAdpcm, androidSynth, androidAdpcm, androidClient] = await Promise.all([
    read('firmware/waveshare-terminal/main/mel_terminal.cpp'),
    read('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp'),
    read('firmware/waveshare-terminal/main/mel_ima_adpcm.h'),
    read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelMiniVoiceSynthesizer.kt'),
    read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelImaAdpcm.kt'),
    read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt'),
  ]);
  assert.match(miniAudio, new RegExp('VOICE_CAPTURE_RATE\\s*=\\s*' + contract.audio.microphoneCaptureRateHz));
  assert.match(miniAudio, new RegExp('VOICE_STT_RATE\\s*=\\s*' + contract.audio.sttInputRateHz));
  assert.match(miniAudio, /decimate_48k_to_16k/);
  assert.match(miniAudio, new RegExp('sample_rate != ' + contract.audio.physicalPlaybackRateHz));
  assert.match(miniAudio, new RegExp('bits_per_sample != ' + contract.audio.pcmBitsPerSample));
  assert.match(miniTransport, new RegExp('rate->valueint == ' + contract.audio.audioMetadataRateHz));
  assert.match(miniTransport, new RegExp('output_rate->valueint == ' + contract.audio.audioMetadataRateHz));
  assert.match(androidSynth, /OUTPUT_RATE = 48_000/);
  assert.match(miniAdpcm, new RegExp('MEL_IMA_ADPCM_BLOCK_SAMPLES\\s+' + contract.audio.imaAdpcmMaximumBlockSamples));
  assert.match(androidAdpcm, new RegExp('BLOCK_SAMPLES = ' + contract.audio.imaAdpcmMaximumBlockSamples));
  assert.match(miniAdpcm, new RegExp('MEL_IMA_ADPCM_MAX_ENCODED_BYTES\\s+' + contract.audio.imaAdpcmMaximumEncodedBytes));
  assert.match(androidAdpcm, new RegExp('MAX_ENCODED_BYTES = ' + contract.audio.imaAdpcmMaximumEncodedBytes));
  assert.match(androidClient, new RegExp('audioBlockSamples = ' + contract.audio.androidTtsBlockSamples));
  assert.match(androidClient, /sessionAckTimeoutArmed[\s\S]*?10_000L/);
  assert.match(androidClient, /BLE_HANDSHAKE_TIMEOUT[\s\S]*?90_000L/);
  assert.match(androidClient, /outboundTransferActive\(streamId, credits, intendedGatt\)/);
  assert.match(androidClient, /!cancelledOutbound\.contains\(streamId\)/);
  assert.match(androidClient, /gatt === intendedGatt/);
  assert.match(androidClient, /awaitOutboundCredit\(streamId, credits\)/);
  assert.equal(contract.audio.imaAdpcmMaximumEncodedBytes + contract.protocol.headerBytes + contract.protocol.gattAttOverheadBytes,
    contract.protocol.minimumAudioMtu);
});

test('Windows Companion stays protocol-neutral and reads authenticated triad/backend state', async () => {
  const windows = await read('windows-companion/MEL-Companion.cs');
  assert.match(windows, /\/api\/computer\/v1\/companion/);
  assert.match(windows, /\/api\/computer\/v1\/triad-activity/);
  assert.match(windows, /mel\.triad\.android-presence\.v1/);
  assert.doesNotMatch(windows, /MEL_LINK_V2_HEADER_SIZE|MelLinkV2Protocol|SESSION_OK/,
    'Windows is not a BLE peer and must not synthesize a MINI Link V2 session');
});
