import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const [contract, kotlin, firmware] = await Promise.all([
  'docs/mini-linkv2-triad-phase-v1-contract.md',
  'android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2Protocol.kt',
  'firmware/waveshare-terminal/main/mel_link_v2_protocol.h',
].map(path => readFile(new URL(path, root), 'utf8')));
test('phase extension remains symmetric and opt-in', () => {
  assert.match(kotlin,/const val TRIAD_PHASE\s*=\s*0x50/);
  assert.match(firmware,/MEL_LINK_V2_TRIAD_PHASE\s*=\s*0x50/);
  assert.match(contract,/triad_phase_v1/);
  assert.match(contract,/MUST NOT be sent/);
});
test('payload defines bounded non-sensitive fields', () => {
  for (const field of ['schema_version','phase','freshness_ms','session_generation','phase_nonce','validity_ms']) {
    assert.match(contract,new RegExp('\\|[^\\n]*\\|[^\\n]*'+field+'[^\\n]*\\|'));
  }
  assert.match(contract,/14 bytes/);
  assert.match(contract,/30000/);
  assert.match(contract,/no streaming on the audio channel/i);
});

test('triad capability negotiation opcode is symmetric but remains reserved', () => {
  assert.match(kotlin, /const val TRIAD_CAPABILITY\s*=\s*0x51/);
  assert.match(firmware, /MEL_LINK_V2_TRIAD_CAPABILITY\s*=\s*0x51/);
});
