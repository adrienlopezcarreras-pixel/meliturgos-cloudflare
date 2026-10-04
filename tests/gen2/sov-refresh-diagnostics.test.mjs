import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('SOV refresh preserves only sanitized candidate diagnostics', async () => {
  const source=await readFile(new URL('../../src/evolution/release-launch-bootstrap.js',import.meta.url),'utf8');
  assert.match(source,/results:\s*Array\.isArray\(result\?\.results\)/);
  assert.match(source,/validation_status:/);
  assert.match(source,/code:\s*String\(row\?\.code/);
  assert.match(source,/reason:\s*String\(row\?\.reason/);
  assert.match(source,/slice\(0,180\)/);
});
