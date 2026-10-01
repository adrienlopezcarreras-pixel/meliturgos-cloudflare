import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const retiredProvider = ['round','cube'].join('');
const retiredConnectorId = ['generic','imap','smtp'].join('-');
const roots = ['src','.github/workflows','scripts','tests'];
const extraFiles = ['wrangler.jsonc','package.json','README.md'];
const textExtensions = new Set(['.js','.mjs','.cjs','.ts','.tsx','.json','.jsonc','.yml','.yaml','.md','.html','.css']);

function walk(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes:true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === '.git') return [];
    return walk(path.join(target, entry.name));
  });
}

test('retired mail provider has no active source, UI, workflow, test or roadmap references', () => {
  const files = [
    ...roots.flatMap(walk),
    ...extraFiles.filter(fs.existsSync),
  ].filter(file => textExtensions.has(path.extname(file)) || extraFiles.includes(file));

  const offenders = [];
  for (const file of files) {
    if (file.endsWith('retired-mail-provider.test.mjs')) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (text.toLowerCase().includes(retiredProvider)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('retired connector implementation is absent and schema cleanup is fail-safe', async () => {
  assert.equal(fs.existsSync('src/connectors/' + retiredConnectorId + '.js'), false);
  const config = await import('../../src/core/config.js');
  assert.ok(config.DB_SCHEMA_VERSION >= 15);

  const migrations = fs.readFileSync('src/persistence/migrations.js','utf8');
  assert.match(migrations, /retire_direct_mail_connector/);
  assert.match(migrations, /DELETE FROM mel_oauth_tokens WHERE connector_id='generic-imap-smtp'/);
  assert.match(migrations, /DELETE FROM mel_oauth_transactions WHERE connector_id='generic-imap-smtp'/);
});

test('Yahoo/Ymail direct and Pipedream IMAP support remain present', () => {
  const api = fs.readFileSync('src/api/connection-settings-api.js','utf8');
  assert.match(api, /yahoo-imap/);
  assert.match(api, /imap\.mail\.yahoo\.com/);
  assert.match(api, /smtp\.mail\.yahoo\.com/);
  assert.match(api, /PIPEDREAM_ALLOWED_APPS/);
});
