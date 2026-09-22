import test from 'node:test';
import assert from 'node:assert/strict';
import { inferNativeCodeCapability } from '../src/api/native-chat.js';

test('self code access question does not invent a default read target', () => {
  assert.equal(
    inferNativeCodeCapability('et maintenant tu peux lire ton code ?'),
    null
  );
});

test('explicit source path is read directly', () => {
  assert.deepEqual(
    inferNativeCodeCapability('lis src/index.js dans ton code'),
    { id: 'code.read', input: { path: 'src/index.js' } }
  );
});

test('natural deployed-code verification routes to code.integrity', () => {
  assert.deepEqual(
    inferNativeCodeCapability('vérifie quelle branche de code est réellement déployée'),
    { id: 'code.integrity', input: {} }
  );
});

test('ordinary conversation does not trigger code tools', () => {
  assert.equal(inferNativeCodeCapability('bonjour, comment vas-tu ?'), null);
});


test('natural source search routes to code.search with extracted symbol', () => {
  assert.deepEqual(
    inferNativeCodeCapability('cherche dans ton code où est utilisée createDefaultCapabilityBus'),
    { id: 'code.search', input: { query: 'createDefaultCapabilityBus' } }
  );
});

test('source search keeps an explicit file scope instead of scanning an arbitrary repository window', () => {
  assert.deepEqual(
    inferNativeCodeCapability('cherche dans ton code "createDefaultCapabilityBus" dans src/capabilities/default-bus.js'),
    {
      id: 'code.search',
      input: {
        query: 'createDefaultCapabilityBus',
        path: 'src/capabilities/default-bus.js',
      },
    }
  );
});
