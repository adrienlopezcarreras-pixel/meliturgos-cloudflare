import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleComputerApi, COMPUTER_API_BASE } from '../src/devices/computer-companion-api.js';

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
