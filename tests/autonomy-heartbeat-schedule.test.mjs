import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const ONE_MINUTE_CRON = '* * * * *';
const HOURLY_MAINTENANCE_CRON = '17 * * * *';

test('production autonomy heartbeat is scheduled every minute while preview cron stays disabled', async () => {
  const raw = await fs.readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const config = JSON.parse(raw);

  assert.deepEqual(config?.triggers?.crons, [ONE_MINUTE_CRON, HOURLY_MAINTENANCE_CRON]);
  assert.deepEqual(config?.env?.preview?.triggers?.crons, []);
});

test('scheduled Worker entry delegates each heartbeat to the bounded autonomy runtime tick', async () => {
  const source = await fs.readFile(new URL('../src/index.js', import.meta.url), 'utf8');

  assert.match(source, /async\s+scheduled\s*\(/);
  assert.match(source, /runAutonomyRuntimeTick\s*\(\s*env\s*\)/);
  assert.match(source, /runLoraTrainingHeartbeat\s*\(\s*env\s*\)/);
  assert.match(source, /runAutonomyMaintenance\s*\(\s*env\s*\)/);
  assert.match(source, /cron\s*===\s*'17 \\* \\* \\* \\*'/);
  assert.match(source, /ctx\?\.waitUntil/);
});
