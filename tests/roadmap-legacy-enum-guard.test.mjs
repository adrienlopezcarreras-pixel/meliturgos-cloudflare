// [GPT6] Protect the roadmap registry against legacy terminal status restoration.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('[GPT6] roadmap registry validates enum itself, not only its entries',()=>{
 const source=fs.readFileSync('src/roadmap/master-roadmap.js','utf8');
 assert.match(source,/validStatuses\.has\('DONE'\)/);
 assert.match(source,/LEGACY_DONE_ENUM_FORBIDDEN/);
});
