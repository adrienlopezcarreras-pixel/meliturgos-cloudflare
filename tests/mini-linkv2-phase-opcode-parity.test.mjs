// Contract guard for the future read-only MINI phase opcode.
// Does not allocate an opcode or change the BLE protocol.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const android = await readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2Protocol.kt', root), 'utf8');
const firmware = await readFile(new URL('firmware/waveshare-terminal/main/mel_link_v2_protocol.h', root), 'utf8');
const extract = (source, regex) => [...source.matchAll(regex)].map((match) => [match[1], Number.parseInt(match[2], 16)]);
const androidFrames = new Map(extract(android, /const val (\w+)\s*=\s*(0x[0-9a-fA-F]+)/g));
const firmwareFrames = new Map(extract(firmware, /MEL_LINK_V2_(\w+)\s*=\s*(0x[0-9a-fA-F]+)/g));
test('Android and MINI retain identical Link V2 frame assignments', () => {
  for (const [name, opcode] of firmwareFrames) {
    assert.equal(androidFrames.get(name), opcode, `Frame ${name} drifted between Android and MINI`);
  }
});
test('No duplicate opcode aliases may silently collide with audio, session or ACK', () => {
  const entries = [...firmwareFrames];
  assert.equal(new Set(entries.map(([, code]) => code)).size, entries.length);
  for (const name of ['SESSION', 'RESPONSE_BEGIN', 'RESPONSE_DATA', 'RESPONSE_END', 'AUDIO_BEGIN', 'AUDIO_DATA', 'AUDIO_END', 'CREDIT', 'ACK']) {
    assert.ok(firmwareFrames.has(name), `Missing established frame ${name}`);
  }
});
test('Transport must never claim phase support unless both endpoints define it', () => {
  const a = [...androidFrames.keys()].filter((x) => /PHASE|TRIAD_ACTIVITY/.test(x));
  const f = [...firmwareFrames.keys()].filter((x) => /PHASE|TRIAD_ACTIVITY/.test(x));
  assert.deepEqual(a.sort(), f.sort(), 'Phase opcode exists on only one endpoint');
});
