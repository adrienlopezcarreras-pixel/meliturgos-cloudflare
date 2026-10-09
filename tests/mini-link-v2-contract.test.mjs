import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mini = fs.readFileSync('firmware/waveshare-terminal/main/mel_link_v2_protocol.h','utf8');
const android = fs.readFileSync('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2Protocol.kt','utf8');

test('MINI and Android expose MEL Link protocol v2', () => {
  assert.match(mini, /MEL_LINK_V2_PROTOCOL_VERSION 2/);
  assert.match(android, /const val VERSION = 2/);
  assert.match(mini, /MEL_LINK_V2_HEADER_SIZE 13/);
  assert.match(android, /const val HEADER_SIZE = 13/);
  assert.match(mini, /MEL_LINK_V2_DEFAULT_MTU 185/);
  assert.match(android, /const val DEFAULT_MTU = 185/);
  assert.match(mini, /MEL_LINK_V2_CREDIT_WINDOW 6/);
  assert.match(android, /const val CREDIT_WINDOW = 6/);
});

test('V2 has one explicit transport frame vocabulary', () => {
  for (const name of ['HELLO','SESSION','CLOCK','REQUEST_BEGIN','REQUEST_DATA','REQUEST_END','RESPONSE_BEGIN','RESPONSE_DATA','RESPONSE_END','AUDIO_BEGIN','AUDIO_DATA','AUDIO_END','CREDIT','ACK','ERROR','PING','PONG']) {
    assert.ok(mini.includes('MEL_LINK_V2_' + name), 'MINI missing ' + name);
    assert.match(android, new RegExp('const val ' + name + ' ='));
  }
});

test('Android V2 rejects corrupt framing instead of silently resynchronizing', () => {
  assert.match(android, /bad magic/);
  assert.match(android, /bad protocol/);
  assert.match(android, /length mismatch/);
  assert.match(android, /crc mismatch/);
});
