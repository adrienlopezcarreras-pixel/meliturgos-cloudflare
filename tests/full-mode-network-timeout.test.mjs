import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/full-interface-v5.js', import.meta.url), 'utf8');
const base = await readFile(new URL('../src/pages/full-interface-v5-base.js', import.meta.url), 'utf8');

assert.match(source, /AbortController/);
assert.match(source, /8000/);
assert.match(source, /Connexion partielle · réessayer/);
assert.match(source, /FULL_MODE_TIMEOUT_PATCH_NOT_APPLIED/);
assert.match(base, /id=\"liveText\">Vérification…/);
console.log('full-mode network timeout guard: ok');
