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

test('MEL reads explicit .agents documentation instead of fabricating a code.read result', () => {
  assert.deepEqual(
    inferNativeCodeCapability('We need to invoke code.read. Attempt code.read. { "path": ".agents/ANDROID_APP_100_CYCLES_20260923.md" }'),
    { id: 'code.read', input: { path: '.agents/ANDROID_APP_100_CYCLES_20260923.md' } }
  );
});


test('explicit source line ranges reach the existing code.read capability',()=>{
 assert.deepEqual(inferNativeCodeCapability('lis src/api/native-chat.js lignes 120 à 150'),{id:'code.read',input:{path:'src/api/native-chat.js',start_line:120,end_line:150}});
 assert.deepEqual(inferNativeCodeCapability('diagnostique src/pages/full-interface-v2.js lignes 400-420'),{id:'code.read',input:{path:'src/pages/full-interface-v2.js',start_line:400,end_line:420}});
});


test('an explicit code-tool protocol example never becomes a real source read',()=>{
 assert.equal(inferNativeCodeCapability('Explique un exemple JSON d’appel code.read pour src/index.js'),null);
 assert.equal(inferNativeCodeCapability('Donne un exemple JSON de l’outil code.integrity'),null);
 assert.deepEqual(inferNativeCodeCapability('Explique un exemple JSON d’appel code.read puis exécute la lecture de src/index.js'),{id:'code.read',input:{path:'src/index.js'}});
});
