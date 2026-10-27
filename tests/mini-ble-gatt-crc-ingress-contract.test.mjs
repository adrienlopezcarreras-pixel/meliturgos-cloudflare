import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI GATT refuses corrupt Link V2 CRC before acknowledging writes', async () => {
  const src=await readFile(new URL('../firmware/waveshare-terminal/main/mel_link_v2_server.cpp',import.meta.url),'utf8');
  const begin=src.indexOf('static int access_cb(');
  const end=src.indexOf('static const struct ble_gatt_svc_def',begin);
  assert.ok(begin>=0&&end>begin);
  const ingress=src.slice(begin,end);
  assert.match(src,/return mel_link_v2_decode\(data, len, nullptr, nullptr\)/);
  assert.doesNotMatch(ingress,/reinterpret_cast<const MelLinkV2Header/);
  const verify=ingress.indexOf('if (!frame_header_valid(frame.data, len))');
  const enqueue=ingress.indexOf('xQueueSend(g_rx_queue, &frame, 0)');
  const success=ingress.lastIndexOf('return 0;');
  assert.ok(verify>=0&&enqueue>verify&&success>enqueue);
  assert.match(src, /if \(frame\.generation != g_link_generation\.load\(\)\) continue/);
  assert.match(src, /if \(g_rx_cb\) g_rx_cb\(frame\.data, frame\.length, g_rx_ctx\)/);
  assert.match(src, /LINK RX QUEUE FULL/);
  assert.ok(!ingress.includes('g_rx_cb(frame.data, frame.length, g_rx_ctx)'));
  const stress=await readFile(new URL('./mini-triad-protocol-stress.cpp',import.meta.url),'utf8');
  assert.match(stress,/bad\[MEL_LINK_V2_HEADER_SIZE\] \^= 0x80; \/\/ CRC integrity/);
  assert.match(stress,/assert\(!mel_link_v2_decode\(bad, written, nullptr, nullptr\)\)/);
});
