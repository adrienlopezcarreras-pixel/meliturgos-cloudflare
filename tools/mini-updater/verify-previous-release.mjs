#!/usr/bin/env node
// Validate the previously published MINI release before any destructive replacement.
// Usage: node tools/mini-updater/verify-previous-release.mjs <manifest> <ota> <installer> <expected-version>
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [manifestPath, otaPath, installerPath, expectedVersion] = process.argv.slice(2);
assert.ok(manifestPath && otaPath && installerPath && expectedVersion, 'Missing required arguments');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.model, 'waveshare-esp32-s3-touch-lcd-3.5-c');
assert.ok(typeof manifest.firmware?.version === 'string' && (manifest.firmware.version === expectedVersion || manifest.firmware.version.startsWith(expectedVersion + '-')), 'Published predecessor is not the expected release');
assert.equal(manifest.firmware?.available, true);
assert.equal(manifest.installer?.available, true);
assert.equal(manifest.firmware?.key, 'devices/waveshare-esp32-s3-touch-lcd-3.5-c/mel-terminal.bin');
assert.equal(manifest.installer?.key, 'devices/waveshare-esp32-s3-touch-lcd-3.5-c/mini-first-install.bin');
for (const [entry, path] of [[manifest.firmware, otaPath], [manifest.installer, installerPath]]) {
  const data = readFileSync(path);
  assert.ok(data.length > 0);
  assert.equal(data.length, entry.size, 'Published size mismatch');
  assert.match(entry.sha256, /^[a-fA-F0-9]{64}$/);
  assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256.toLowerCase(), 'Published hash mismatch');
}
console.log('Previous MINI firmware manifest and two binary SHA-256 values verified');
