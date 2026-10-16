import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI GATT refuses corrupt Link V2 CRC before acknowledging writes', async () => {
  const src=await readFile(new URL('../firmware/waveshare-terminal/main/mel_link_v2_server.cpp',import.meta.url),'utf8');
  const begin=src.indexOf('static bool frame_header_valid(');
  const end=src.indexOf('static const struct ble_gatt_svc_def',begin);
  assert.ok(begin>=0&&end>begin);
  const ingress=src.slice(begin,end);
  assert.match(ingress,/return mel_link_v2_decode\(data, len, nullptr, nullptr\)/);
  assert.doesNotMatch(ingress,/reinterpret_cast<const MelLinkV2Header/);
  const verify=ingress.indexOf('if (!frame_header_valid(frame, len))');
  const callback=ingress.indexOf('if (g_rx_cb) g_rx_cb(frame, len, g_rx_ctx)');
  const success=ingress.lastIndexOf('return 0;');
  assert.ok(verify>=0&&callback>verify&&success>callback);
  const stress=await readFile(new URL('./mini-triad-protocol-stress.cpp',import.meta.url),'utf8');
  assert.match(stress,/bad\[MEL_LINK_V2_HEADER_SIZE\] \^= 0x80; \/\/ CRC integrity/);
  assert.match(stress,/assert\(!mel_link_v2_decode\(bad, written, nullptr, nullptr\)\)/);
});
