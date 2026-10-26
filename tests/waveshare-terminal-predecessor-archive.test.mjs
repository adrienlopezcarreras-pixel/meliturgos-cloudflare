import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const verifier = new URL('../tools/mini-updater/verify-previous-release.mjs', import.meta.url);
const sha = (value) => createHash('sha256').update(value).digest('hex');

test('MINI predecessor recovery checker accepts matching archived bytes and rejects tampering', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mel-mini-prev-'));
  try {
    const ota = Buffer.from('ota prior release');
    const usb = Buffer.from('usb prior release');
    const manifest = {
      model: 'waveshare-esp32-s3-touch-lcd-3.5-c',
      firmware: { version: '0.6.17-stable', available: true, key: 'devices/waveshare-esp32-s3-touch-lcd-3.5-c/mel-terminal.bin', sha256: sha(ota), size: ota.length },
      installer: { available: true, key: 'devices/waveshare-esp32-s3-touch-lcd-3.5-c/mini-first-install.bin', sha256: sha(usb), size: usb.length },
    };
    const manifestPath = join(dir, 'manifest.json');
    const otaPath = join(dir, 'mel-terminal.bin');
    const installerPath = join(dir, 'mini-first-install.bin');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    writeFileSync(otaPath, ota);
    writeFileSync(installerPath, usb);
    const check = () => spawnSync(process.execPath, [verifier.pathname, manifestPath, otaPath, installerPath, '0.6.17'], { encoding: 'utf8' });
    assert.equal(check().status, 0, 'valid prior release must pass');
    writeFileSync(otaPath, Buffer.from('ota prior releasE'));
    assert.notEqual(check().status, 0, 'same-size corrupted OTA must fail');
    writeFileSync(otaPath, ota);
    manifest.firmware.version = '0.6.18';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.notEqual(check().status, 0, 'wrong predecessor must fail');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
