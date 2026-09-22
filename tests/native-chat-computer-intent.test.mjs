import test from 'node:test';
import assert from 'node:assert/strict';
import { inferNativeComputerCapability } from '../src/api/native-chat.js';

test('native chat recognizes an explicit computer status request',()=>{
  assert.deepEqual(inferNativeComputerCapability('est-ce que mon ordinateur est connecté ?'),{id:'computer.status',input:{}});
});

test('native chat recognizes screenshot request',()=>{
  assert.deepEqual(inferNativeComputerCapability('fais une capture de l’écran de mon ordinateur'),{id:'computer.quick',input:{kind:'screenshot'}});
});

test('native chat maps allowed apps without embedding a self-approval flag',()=>{
  assert.deepEqual(inferNativeComputerCapability('ouvre le bloc-notes'),{id:'computer.quick',input:{kind:'open_app',app:'notepad'}});
  assert.deepEqual(inferNativeComputerCapability('lance la calculatrice'),{id:'computer.quick',input:{kind:'open_app',app:'calculator'}});
});

test('native chat does not type unless the current request explicitly targets the computer',()=>{
  assert.equal(inferNativeComputerCapability('écris un poème sur la mer'),null);
  assert.deepEqual(inferNativeComputerCapability('écris bonjour sur mon ordinateur'),{id:'computer.quick',input:{kind:'type_text',text:'bonjour'}});
});
