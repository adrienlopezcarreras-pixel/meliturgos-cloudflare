import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/full-interface-v5.js', import.meta.url), 'utf8');

assert.match(source, /const FULL_MODE_HTML/);
assert.match(source, /AbortController/);
assert.match(source, /8000/);
assert.match(source, /30000/);
assert.match(source, /Connexion partielle · réessayer/);
assert.match(source, /\/api\/gen2\/mentor\/chat/);
assert.doesNotMatch(source, /full-interface-v5-base/);
console.log('full-mode network timeout guard: ok');
