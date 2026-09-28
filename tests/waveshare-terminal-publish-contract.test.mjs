import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MINI OTA publish manifest derives version from firmware header', async () => {
  const [workflow, header] = await Promise.all([
    readFile(new URL('../.github/workflows/publish-waveshare-firmware.yml', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.h', import.meta.url), 'utf8'),
  ]);

  const version = header.match(/^#define MEL_FW_VERSION "([^"]+)"/m)?.[1];
  assert.ok(version, 'MEL_FW_VERSION must exist');

  assert.match(
    workflow,
    /FW_VERSION="\$\(sed -n 's\/\^#define MEL_FW_VERSION/
  );
  assert.match(workflow, /test -n "\$FW_VERSION"/);
  assert.match(workflow, /"version": "\$\{FW_VERSION\}"/);

  assert.doesNotMatch(
    workflow,
    /"version": "0\.4\.8-mobile-internet"/,
    'publish workflow must not keep a stale hard-coded firmware version'
  );
});
