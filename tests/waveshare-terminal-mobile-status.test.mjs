import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
// Fresh-head guard: run this contract against the current PR merge ref.

test('MINI 0.4.22 reports the real mobile link independently from Wi-Fi', async () => {
  const [runtime, main, header, workflow] = await Promise.all([
    readFile(new URL('firmware/waveshare-terminal/main/mel_terminal.cpp', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/main.cpp', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_terminal.h', root), 'utf8'),
    readFile(new URL('.github/workflows/waveshare-terminal-firmware.yml', root), 'utf8'),
  ]);

  assert.match(header, /MEL_FW_VERSION "0\.4\.22-camera-online-recovery"/);
  assert.match(workflow, /"version": "0\.4\.22-camera-online-recovery"/);

  assert.match(runtime, /void mel_terminal_set_mobile_connected\(bool connected\)/);
  assert.match(runtime, /ui_status\(g_online \? "MEL MOBILE CONNECTE" : "MOBILE CONNECTE"\)/);
  assert.match(runtime, /bool mel_terminal_mobile_connected\(void\)/);
  assert.match(runtime, /return g_mobile_connected && mel_mobile_bridge_ready\(\)/);
  assert.match(runtime, /g_online = true;[\s\S]*ui_status\(mel_terminal_mobile_connected\(\) \? "MEL MOBILE CONNECTE" : ""\)/);

  assert.match(main, /Mobile: %s/);
  assert.match(main, /mel_terminal_mobile_connected\(\) \? "CONNECTE" : "OFF"/);

  // A mobile disconnect while Wi-Fi is still associated must clear the stale
  // mobile label instead of leaving MINI falsely shown as connected.
  assert.match(runtime, /else \{\s*ui_status\(g_online \? "" : "WI-FI CONNECTE"\);\s*\}/);
});
