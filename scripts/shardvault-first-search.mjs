import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { discoverAutonomousRepositories } from '../src/continuity/autonomous-repositories.js';

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const env = { ...(config.vars || {}) };
const report = await discoverAutonomousRepositories(env, {
  masterKey: randomBytes(32),
  vaultId: env.MEL_VAULT_ID || 'mel-primary',
  requiredBytes: 256,
  selectionCount: Number(env.MEL_TOTAL_SHARDS || 7),
});
console.log('SHARDVAULT_FIRST_SEARCH_RESULT=' + JSON.stringify(report));
