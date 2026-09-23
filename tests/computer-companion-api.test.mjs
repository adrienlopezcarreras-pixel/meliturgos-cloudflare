import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleComputerApi, COMPUTER_API_BASE } from '../src/devices/computer-companion-api.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
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


const ownerAuth='Basic '+Buffer.from('adrien:test').toString('base64');

function ownerRequest(path,method='GET',body=null){
  return new Request('https://mel.test'+path,{
    method,
    headers:{
      authorization:ownerAuth,
      ...(body?{'content-type':'application/json'}:{})
    },
    ...(body?{body:JSON.stringify(body)}:{})
  });
}

test('Windows one-use pairing code removes owner credentials from the device pairing request',async()=>{
  const DB=sqliteD1();
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
    const codeResponse=await maybeHandleComputerApi(ownerRequest('/api/computer/v1/pair-code','POST',{}),env);
    assert.equal(codeResponse.status,200);
    const code=(await codeResponse.json()).code;
    assert.equal(typeof code,'string');
    assert.ok(code.length>=8);

    const pairResponse=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        pair_code:code,
        computer_id:'pc-secure',
        name:'PC sécurisé',
        platform:'windows',
        version:'2.0.0'
      })
    }),env);
    assert.equal(pairResponse.status,200);
    const paired=await pairResponse.json();
    assert.equal(paired.computer.id,'pc-secure');
    assert.equal(paired.token_storage,'DPAPI_CURRENT_USER_REQUIRED');
    assert.ok(paired.token.length>=40);

    const replay=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({pair_code:code,computer_id:'pc-replay'})
    }),env);
    assert.equal(replay.status,401);
    assert.equal((await replay.json()).code,'COMPUTER_PAIR_CODE_INVALID_OR_EXPIRED');
  }finally{DB.close();}
});

test('paired Windows device can fetch its companion with device auth and owner can revoke it',async()=>{
  const DB=sqliteD1();
  try{
    const env={
      DB,
      MELITURGOS_USER:'adrien',
      MELITURGOS_PASSWORD:'test',
      ASSETS:{
        async fetch(request){
          const url=new URL(request.url);
          if(url.pathname==='/MEL-Computer-Companion.ps1'){
            return new Response('Write-Host "MEL companion"',{status:200,headers:{'content-type':'text/plain'}});
          }
          return new Response('missing',{status:404});
        }
      }
    };
    const codeRes=await maybeHandleComputerApi(ownerRequest('/api/computer/v1/pair-code','POST',{}),env);
    const code=(await codeRes.json()).code;
    const pairRes=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({pair_code:code,computer_id:'pc-device-auth'})
    }),env);
    const paired=await pairRes.json();
    const deviceHeaders={
      authorization:'Bearer '+paired.token,
      'x-mel-computer-id':'pc-device-auth'
    };

    const companion=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/companion',{headers:deviceHeaders}),env);
    assert.equal(companion.status,200);
    assert.match(await companion.text(),/MEL companion/);

    const revoke=await maybeHandleComputerApi(ownerRequest('/api/computer/v1/revoke','POST',{computer_id:'pc-device-auth'}),env);
    assert.equal(revoke.status,200);
    assert.equal((await revoke.json()).revoked,true);

    const heartbeat=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/heartbeat',{
      method:'POST',
      headers:{...deviceHeaders,'content-type':'application/json'},
      body:'{}'
    }),env);
    assert.equal(heartbeat.status,401);
  }finally{DB.close();}
});

test('Windows installer clears owner password before token-based companion download',async()=>{
  const setup=await readFile(new URL('../dist/MEL-Computer-Setup.ps1',import.meta.url),'utf8');
  assert.match(setup,/\/api\/computer\/v1\/pair-code/);
  assert.match(setup,/pair_code\s*=\s*\$pairCode/);
  assert.match(setup,/\$pass\s*=\s*\$null/);
  assert.match(setup,/Authorization\s*=\s*"Bearer \$\(\[string\]\$pair\.token\)"/);
  assert.match(setup,/X-MEL-Computer-ID/);
});
