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

test('paired Windows device can read MINI and Android companion status without owner password',async()=>{
  const DB=sqliteD1();
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
    await DB.prepare('CREATE TABLE device_tokens(device_id TEXT PRIMARY KEY,model TEXT,last_seen_at INTEGER,revoked_at INTEGER)').run();
    await DB.prepare('CREATE TABLE device_status(device_id TEXT PRIMARY KEY,payload_json TEXT,updated_at INTEGER)').run();
    const now=Date.now();
    await DB.prepare('INSERT INTO device_tokens(device_id,model,last_seen_at,revoked_at) VALUES(?,?,?,NULL)')
      .bind('mini-1','waveshare-terminal',now).run();
    await DB.prepare('INSERT INTO device_status(device_id,payload_json,updated_at) VALUES(?,?,?)')
      .bind('mini-1',JSON.stringify({name:'MEL MINI',phase:'ONLINE',camera:true,microphone:true,speaker:true,battery:82}),now).run();

    const codeRes=await maybeHandleComputerApi(ownerRequest('/api/computer/v1/pair-code','POST',{}),env);
    const code=(await codeRes.json()).code;
    const pairRes=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({pair_code:code,computer_id:'pc-device-list'})
    }),env);
    const paired=await pairRes.json();
    const response=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/companions',{headers:{
      authorization:'Bearer '+paired.token,
      'x-mel-computer-id':'pc-device-list'
    }}),env);
    assert.equal(response.status,200);
    const payload=await response.json();
    assert.equal(payload.devices.length,1);
    assert.equal(payload.devices[0].name,'MEL MINI');
    assert.equal(payload.devices[0].kind,'mini');
    assert.equal(payload.devices[0].camera,true);
    assert.equal(payload.devices[0].live_stream,false);
  }finally{DB.close();}
});

test('Windows desktop v2 keeps tray UI, headless engine, and packaged EXE contracts',async()=>{
  const desktop=await readFile(new URL('../windows-companion/MEL-Companion.cs',import.meta.url),'utf8');
  const companion=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  const build=await readFile(new URL('../scripts/build-windows-release.ps1',import.meta.url),'utf8');
  const sign=await readFile(new URL('../scripts/sign-windows-release.ps1',import.meta.url),'utf8');
  const verify=await readFile(new URL('../scripts/verify-windows-release.ps1',import.meta.url),'utf8');

  assert.match(desktop,/NotifyIcon/);
  assert.match(desktop,/MEL-Companion\.exe/);
  assert.match(desktop,/MEL_COMPANION_HEADLESS/);
  assert.match(desktop,/\/api\/computer\/v1\/companions/);
  assert.match(desktop,/Lancer MEL Companion avec Windows/);
  assert.match(desktop,/RÉAPPAIRER/);
  assert.match(desktop,/DÉSINSTALLER/);
  assert.match(companion,/MEL_COMPANION_HEADLESS/);
  assert.match(build,/MEL-Companion\.exe/);
  assert.match(build,/System\.Web\.Extensions\.dll/);
  assert.match(sign,/Filter \*\.exe/);
  assert.match(verify,/WINDOWS_DESKTOP_EXE_MISSING/);
});

test('Windows installer clears owner password before token-based companion download',async()=>{
  const setup=await readFile(new URL('../dist/MEL-Computer-Setup.ps1',import.meta.url),'utf8');
  assert.match(setup,/\/api\/computer\/v1\/pair-code/);
  assert.match(setup,/pair_code\s*=\s*\$pairCode/);
  assert.match(setup,/\$pass\s*=\s*\$null/);
  assert.match(setup,/Authorization\s*=\s*"Bearer \$\(\[string\]\$pair\.token\)"/);
  assert.match(setup,/X-MEL-Computer-ID/);
});
