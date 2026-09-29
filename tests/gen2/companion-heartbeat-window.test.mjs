import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  '../../src/portability/companion-source-control-prevalidation-runtime.js',
  '../../src/portability/companion-infrastructure-prevalidation-runtime.js',
  '../../src/portability/companion-sovereignty-executor.js',
  '../../src/devices/computer-companion-api.js',
];

test('Companion online window tolerates real 10s/15s heartbeat cadence', async () => {
  for (const rel of files) {
    const source = await readFile(new URL(rel, import.meta.url), 'utf8');
    assert.match(source, /35000/, rel + ' must use the 35s online window');
    assert.doesNotMatch(source, /onlineWithinMs\s*=\s*15000|<15000/, rel + ' still contains the stale 15s threshold');
  }
});
