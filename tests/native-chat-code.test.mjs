import test from 'node:test';
import assert from 'node:assert/strict';
import { inferNativeCodeCapability } from '../src/api/native-chat.js';

test('self code access question proves access by reading router', () => {
  assert.deepEqual(
    inferNativeCodeCapability('et maintenant tu peux lire ton code ?'),
    { id: 'code.read', input: { path: 'src/router.js' } }
  );
});

test('explicit source path is read directly', () => {
  assert.deepEqual(
    inferNativeCodeCapability('lis src/index.js dans ton code'),
    { id: 'code.read', input: { path: 'src/index.js' } }
  );
});

test('ordinary conversation does not trigger code tools', () => {
  assert.equal(inferNativeCodeCapability('bonjour, comment vas-tu ?'), null);
});
