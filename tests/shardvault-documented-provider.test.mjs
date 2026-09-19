import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('documented Filebin candidate can be probed without custom MEL policy', () => {
  const source=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  assert.match(source,/id:'filebin-public'/);
  assert.match(source,/adapter:'filebin'/);
  assert.match(source,/evidenceMode:'documented_api'/);
  assert.match(source,/filebin\.net\/api\.yaml/);
  assert.match(source,/candidateRead/);
  assert.match(source,/builtin-documented/);
});

test('runtime preserves Filebin adapter and persistent search state', () => {
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/filebinDownload/);
  assert.match(runtime,/adapter:e\.adapter\|\|null/);
  assert.match(runtime,/search_mode:'MAINTAIN_7_EXTERNAL'/);
  assert.match(runtime,/target_count:Math\.min\(7,c\.n\)/);
  assert.match(runtime,/continue_searching/);
  assert.doesNotMatch(runtime,/redirect:'error'/);
});
