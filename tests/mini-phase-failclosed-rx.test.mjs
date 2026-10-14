import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../firmware/waveshare-terminal/main/mel_link_v2_transport.cpp',import.meta.url),'utf8');
test('phase frame explicitly fails closed before audio stream routing',()=>{
  const phase=source.indexOf('if (header.type == MEL_LINK_V2_TRIAD_PHASE)');
  const media=source.indexOf('if (header.type == MEL_LINK_V2_MEDIA_CONFIG)');
  const audio=source.indexOf('const uint16_t active_stream = g_active_stream_id.load()');
  assert.ok(phase > 0 && phase < media && media < audio);
  const block=source.slice(phase,media);
  assert.match(block,/g_session_ready\.load\(\)/);
  assert.match(block,/mel_link_v2_server_ready\(\)/);
  assert.match(block,/header.stream_id != 0/);
  assert.match(block,/capability not negotiated/);
  assert.ok(!block.includes('mel_link_v2_encode('));
  assert.ok(!block.includes('server_send('));
});
