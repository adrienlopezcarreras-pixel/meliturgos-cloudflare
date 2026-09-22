import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleComputerApi, COMPUTER_API_BASE } from '../src/devices/computer-companion-api.js';
import { readFile } from 'node:fs/promises';

test('computer companion API uses the canonical namespace',()=>assert.equal(COMPUTER_API_BASE,'/api/computer/v1'));

test('computer handler ignores unrelated requests',async()=>{
  const response=await maybeHandleComputerApi(new Request('https://mel.test/api/other'),{});
  assert.equal(response,null);
});

test('computer pairing stays protected by owner authentication',async()=>{
  const response=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({computer_id:'pc-test'})
  }),{MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret'});
  assert.equal(response.status,401);
  assert.equal((await response.json()).code,'AUTH_REQUIRED');
});


test('owner computer command path delegates to CapabilityBus central approval instead of trusting payload approvals',async()=>{
  const source=await readFile(new URL('../src/devices/computer-companion-api.js',import.meta.url),'utf8');
  assert.match(source,/createDefaultCapabilityBus/);
  assert.match(source,/attachRequestApproval/);
  assert.match(source,/bus\.execute\("computer\.execute"/);
  assert.doesNotMatch(source,/approve_sensitive===true\?approvals/);
});
