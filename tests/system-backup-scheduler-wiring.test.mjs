import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('hourly maintenance cron wires the canonical interval-aware system backup', async () => {
  const source=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
  assert.match(source,/import \{ runScheduledSystemBackup \} from "\.\/backup\/system-backup-runtime\.js";/);
  assert.match(source,/const maintenanceCron = cron === '17 \* \* \* \*';/);
  assert.match(source,/runScheduledSystemBackup\(env\)/);
  assert.doesNotMatch(source,/runScheduledSystemBackup\(env,\s*\{[^}]*force:\s*true/s);
});
