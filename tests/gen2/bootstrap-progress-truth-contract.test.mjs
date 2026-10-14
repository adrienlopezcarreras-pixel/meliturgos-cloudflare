import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('bootstrap top-level advancement includes measured progress evidence',async()=>{
  const source=await readFile(new URL('../../src/evolution/release-launch-bootstrap.js',import.meta.url),'utf8');
  const section=source.split("status: 'GEN2_42_RUNTIME_TICK_EXECUTED'")[1]?.split('bridge_preparation_ready:')[0]||'';
  assert.match(section,/advanced: tick\?\.advanced === true \|\| tick\?\.progress\?\.advanced === true/);
  assert.match(section,/advanced: tick\.progress\.advanced === true/);
  assert.match(section,/waiting_external: tick\.progress\.waiting_external === true/);
  assert.match(section,/block_reason: tick\.progress\.block_reason \|\| null/);
});

test('OWNER_MAX response reflects measured runtime progress without assuming work happened',async()=>{
  const source=await readFile(new URL('../../src/evolution/release-launch-bootstrap.js',import.meta.url),'utf8');
  const section=source.split("status: 'GEN2_42_OWNER_MAX_EXECUTED'")[1]?.split('bridge_preparation_ready:')[0]||'';
  assert.match(section,/advanced: tick\?\.advanced === true \|\| tick\?\.progress\?\.advanced === true/);
  assert.match(section,/advanced: tick\.progress\.advanced === true/);
  assert.match(section,/waiting_external: tick\.progress\.waiting_external === true/);
  assert.match(section,/block_reason: tick\.progress\.block_reason \|\| null/);
});
