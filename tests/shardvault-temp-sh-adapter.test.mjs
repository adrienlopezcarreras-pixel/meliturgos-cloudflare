import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('temp.sh documented candidate is supported as dynamic upload URL storage', () => {
  const discovery=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  assert.match(discovery,/id:'temp-sh-public'/);
  assert.match(discovery,/adapter:'temp_sh'/);
  assert.match(discovery,/candidateWrite/);
  assert.match(discovery,/TEMP_SH_READ/);

  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/adapter==='temp_sh'/);
  assert.match(runtime,/remoteUrl:locator\?\.remoteUrl\|\|null/);
  assert.match(runtime,/REMOTE_URL_MISSING/);
});
