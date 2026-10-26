import test from 'node:test';
import assert from 'node:assert/strict';
import { toMiniWav } from '../src/devices/mini-wav.js';

function wav16k() {
  return Uint8Array.from([
    0x52,0x49,0x46,0x46,0x28,0x00,0x00,0x00,0x57,0x41,0x56,0x45,
    0x66,0x6d,0x74,0x20,0x10,0x00,0x00,0x00,0x01,0x00,0x01,0x00,
    0x80,0x3e,0x00,0x00,0x00,0x7d,0x00,0x00,0x02,0x00,0x10,0x00,
    0x64,0x61,0x74,0x61,0x04,0x00,0x00,0x00,0x00,0x00,0x00,0x01,
  ]);
}

test('a 16 kHz voice file becomes the 48 kHz mono WAV the MINI accepts', () => {
  const out = toMiniWav(wav16k());
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(out.length, 44 + 6 * 2);
});

test('a file that is not PCM is refused instead of being sent to the MINI', () => {
  assert.equal(toMiniWav(new Uint8Array([1, 2, 3, 4])), null);
});
