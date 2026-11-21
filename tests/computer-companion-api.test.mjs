import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleComputerApi, COMPUTER_API_BASE } from '../src/devices/computer-companion-api.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

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

test('Windows heartbeats merge telemetry instead of erasing richer engine metadata',async()=>{
  const DB=sqliteD1();
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
    const codeRes=await maybeHandleComputerApi(ownerRequest('/api/computer/v1/pair-code','POST',{}),env);
    const code=(await codeRes.json()).code;
    const pairRes=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({pair_code:code,computer_id:'pc-heartbeat'})
    }),env);
    const paired=await pairRes.json();
    const headers={authorization:'Bearer '+paired.token,'x-mel-computer-id':'pc-heartbeat','content-type':'application/json'};

    let response=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/heartbeat',{
      method:'POST',headers,
      body:JSON.stringify({version:'2.3.2',hostname:'PC',user:'adrien',screen:{x:0,y:0,width:2560,height:1440}})
    }),env);
    assert.equal(response.status,200);

    response=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/heartbeat',{
      method:'POST',headers,
      body:JSON.stringify({engine_version:'1.2.0',active_window:'MEL_INPUT_READY'})
    }),env);
    assert.equal(response.status,200);

    const row=await DB.prepare('SELECT metadata FROM computer_devices WHERE id=?').bind('pc-heartbeat').first();
    const metadata=JSON.parse(row.metadata);
    assert.equal(metadata.version,'2.3.2');
    assert.equal(metadata.engine_version,'1.2.0');
    assert.equal(metadata.hostname,'PC');
    assert.equal(metadata.screen.width,2560);
    assert.equal(metadata.screen.height,1440);
    assert.equal(metadata.active_window,'MEL_INPUT_READY');
  }finally{DB.close();}
});

test('paired Windows device can read MINI and Android companion status without owner password',async()=>{
  const DB=sqliteD1();
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
    await DB.prepare('CREATE TABLE device_tokens(device_id TEXT PRIMARY KEY,model TEXT,last_seen_at INTEGER,revoked_at INTEGER)').run();
    await DB.prepare('CREATE TABLE device_status(device_id TEXT PRIMARY KEY,payload_json TEXT,updated_at INTEGER)').run();
    await DB.prepare('CREATE TABLE android_device_tokens(device_id TEXT PRIMARY KEY,token_hash TEXT,name TEXT,app_version TEXT,created_at INTEGER,last_seen_at INTEGER,revoked_at INTEGER)').run();
    await DB.prepare('CREATE TABLE android_device_status(device_id TEXT PRIMARY KEY,payload_json TEXT,updated_at INTEGER)').run();
    const now=Date.now();
    await DB.prepare('INSERT INTO device_tokens(device_id,model,last_seen_at,revoked_at) VALUES(?,?,?,NULL)')
      .bind('mini-1','waveshare-terminal',now).run();
    await DB.prepare('INSERT INTO device_status(device_id,payload_json,updated_at) VALUES(?,?,?)')
      .bind('mini-1',JSON.stringify({name:'MEL MINI',phase:'ONLINE',camera:true,microphone:true,speaker:true,battery:82}),now).run();
    await DB.prepare('INSERT INTO android_device_tokens(device_id,token_hash,name,app_version,created_at,last_seen_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
      .bind('android-1','hash','Téléphone MEL','0.6.24',now-20*60*1000,now-20*60*1000).run();
    await DB.prepare('INSERT INTO android_device_status(device_id,payload_json,updated_at) VALUES(?,?,?)')
      .bind('android-1',JSON.stringify({phase:'ONLINE',battery:61,charging:true,network:'wifi'}),now).run();
    await DB.prepare('INSERT INTO android_device_tokens(device_id,token_hash,name,app_version,created_at,last_seen_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
      .bind('android-old','hash-old','Ancien Android','0.6.10',now-86400000,now-86400000).run();
    await DB.prepare('INSERT INTO android_device_status(device_id,payload_json,updated_at) VALUES(?,?,?)')
      .bind('android-old',JSON.stringify({phase:'ONLINE',battery:20}),now-86400000).run();

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
    assert.equal(payload.devices.length,2);
    const mini=payload.devices.find(device=>device.kind==='mini');
    const android=payload.devices.find(device=>device.kind==='android');
    assert.equal(mini.name,'MEL MINI');
    assert.equal(mini.camera,true);
    assert.equal(mini.live_stream,false);
    assert.equal(android.name,'Téléphone MEL');
    assert.equal(android.online,true);
    assert.equal(android.firmware,'0.6.24');
    assert.equal(android.battery,61);
    assert.equal(android.charging,true);
    assert.equal(android.live_stream,false);
    assert.equal(payload.devices.filter(device=>device.kind==='android').length,1);
    assert.equal(payload.devices.some(device=>device.device_id==='android-old'),false);
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
  assert.match(desktop,/MEL_COMPANION_PARENT_PID/);
  assert.match(desktop,/SetProcessDpiAwarenessContext/);
  assert.match(desktop,/"screen",screen/);
  assert.match(desktop,/--self-test/);
  assert.match(desktop,/self-test\.json/);
  assert.match(desktop,/\/api\/computer\/v1\/companions/);
  assert.match(desktop,/Lancer MEL Companion avec Windows/);
  assert.match(desktop,/Réappairer/i);
  assert.match(desktop,/Désinstaller/i);
  assert.match(desktop,/RegisterHotKey/);
  assert.match(desktop,/UnregisterHotKey/);
  assert.match(desktop,/Ctrl\+Alt\+M/);
  assert.match(desktop,/WM_HOTKEY/);
  assert.match(desktop,/class PermissionsForm/);
  assert.match(desktop,/Autorisations locales/i);
  assert.match(desktop,/SavePermissions/);
  assert.match(desktop,/RestartCompanion/);
  assert.match(desktop,/allowed_app_count/);
  assert.match(desktop,/allowed_path_count/);
  assert.match(companion,/MEL_COMPANION_HEADLESS/);
  assert.match(companion,/MEL_COMPANION_PARENT_PID/);
  assert.match(companion,/SetProcessDpiAwarenessContext/);
  assert.match(companion,/engine_version/);
  assert.match(companion,/function Ensure-ShutdownEnvironment/);
  assert.match(companion,/\[Environment\]::SetEnvironmentVariable/);
  assert.match(companion,/function Invoke-ShutdownCommand/);
  assert.match(companion,/POWER_SCHEDULE_FAILED/);
  assert.match(companion,/& \$exe @arguments/);
  assert.match(companion,/\$LASTEXITCODE/);
  assert.match(companion,/Close-ForegroundFile/);
  assert.match(companion,/FILE_NOT_FOREGROUND/);
  assert.match(companion,/SendKeys\]::SendWait\("\%\{F4\}"\)/);
  assert.match(build,/MEL-Companion\.exe/);
  assert.match(build,/unicodeEscape/);
  assert.match(build,/asciiDesktop/);
  assert.match(build,/Text\.Encoding\]::ASCII/);
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


test('native supervisor heartbeat does not count as the PowerShell engine',async()=>{
  const DB=sqliteD1();
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
    const codeRes=await maybeHandleComputerApi(ownerRequest('/api/computer/v1/pair-code','POST',{}),env);
    const code=(await codeRes.json()).code;
    const pairRes=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({pair_code:code,computer_id:'pc-native-supervisor'})
    }),env);
    const paired=await pairRes.json();
    const headers={authorization:'Bearer '+paired.token,'x-mel-computer-id':'pc-native-supervisor','content-type':'application/json'};
    const before=Date.now();
    const response=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/heartbeat',{
      method:'POST',headers,
      body:JSON.stringify({
        version:'2.3.7',hostname:'PC',user:'adrien',screen:{x:0,y:0,width:1920,height:1080},
        engine_heartbeat_at:Date.now()+120000,
        heartbeat_diag:{last_error_code:'WebException',http_ms:40,engine_process_running:true,consecutive_failures:1}
      })
    }),env);
    const payload=await response.json();
    assert.equal(payload.ok,true);
    assert.equal(payload.presence.pc_online,true);
    assert.equal(payload.presence.engine_online,false);
    assert.equal(payload.presence.local_ai_ready,false);
    assert.equal(payload.engine_online,false);
    const source=await DB.prepare('SELECT last_seen_at,metadata FROM computer_devices WHERE id=?').bind('pc-native-supervisor').first();
    const metadata=JSON.parse(source.metadata);
    assert.equal(metadata.engine_direct_heartbeat_at,undefined);
    assert.equal(metadata.engine_heartbeat_at,undefined);
    assert.ok(Number(metadata.supervisor_heartbeat_at)>=before);
    assert.ok(Number(source.last_seen_at)>=before);
    assert.equal(metadata.heartbeat_diag.last_error_code,'WEBEXCEPTION');
    assert.equal(metadata.heartbeat_diag.source,'windows');
  }finally{DB.close();}
});

test('Windows command engine heartbeat is independently fresh from the desktop UI heartbeat',async()=>{
  const DB=sqliteD1();
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
    const codeRes=await maybeHandleComputerApi(ownerRequest('/api/computer/v1/pair-code','POST',{}),env);
    const code=(await codeRes.json()).code;
    const pairRes=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({pair_code:code,computer_id:'pc-engine-heartbeat'})
    }),env);
    const paired=await pairRes.json();
    const headers={authorization:'Bearer '+paired.token,'x-mel-computer-id':'pc-engine-heartbeat','content-type':'application/json'};

    let response=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/heartbeat',{
      method:'POST',headers,body:JSON.stringify({version:'2.3.7'})
    }),env);
    let payload=await response.json();
    assert.equal(payload.ok,true);
    assert.equal(payload.engine_online,false);

    const seenBefore=await DB.prepare('SELECT last_seen_at FROM computer_devices WHERE id=?').bind('pc-engine-heartbeat').first();
    const engineHeartbeatAt=Date.now()+60000;
    response=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/heartbeat',{
      method:'POST',headers,
      body:JSON.stringify({engine_version:'1.3.0',engine_heartbeat_at:engineHeartbeatAt,active_window:'MEL_TEST',local_compute_enabled:false,dev_executor:{status:'RUNNING',heartbeat_at:Date.now()}})
    }),env);
    payload=await response.json();
    assert.equal(payload.engine_online,true);
    assert.equal(payload.presence.pc_online,true);
    assert.equal(payload.presence.local_ai_ready,false);
    assert.equal(payload.engine_version,'1.3.0');
    assert.ok(Number(payload.engine_last_seen_at)>=Date.now()-2000);
    assert.notEqual(payload.engine_last_seen_at,engineHeartbeatAt);
    const direct=await DB.prepare('SELECT last_seen_at,metadata FROM computer_devices WHERE id=?').bind('pc-engine-heartbeat').first();
    const directSeen=Number(JSON.parse(direct.metadata).engine_direct_heartbeat_at);
    assert.ok(directSeen>=Date.now()-2000 && directSeen<=Date.now(),
      'PowerShell heartbeat must be recorded independently from native supervisor');
    assert.equal(Number(direct.last_seen_at),Number(seenBefore.last_seen_at));
    assert.equal(JSON.parse(direct.metadata).dev_executor_status,'RUNNING');
    response=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/heartbeat',{
      method:'POST',headers,body:JSON.stringify({version:'2.3.17'})
    }),env);
    assert.equal(response.status,200);
    const afterUi=await DB.prepare('SELECT metadata FROM computer_devices WHERE id=?').bind('pc-engine-heartbeat').first();
    assert.equal(JSON.parse(afterUi.metadata).dev_executor_status,'RUNNING','native heartbeat cannot erase independent executor evidence');
    response=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/heartbeat',{
      method:'POST',headers,body:JSON.stringify({engine_version:'1.5.2',dev_executor:{status:'RUNNING',heartbeat_at:Date.now()-120000}})
    }),env);
    assert.equal(response.status,200);
    const expired=await DB.prepare('SELECT metadata FROM computer_devices WHERE id=?').bind('pc-engine-heartbeat').first();
    assert.equal(JSON.parse(expired.metadata).dev_executor_status,'UNAVAILABLE','process alive is not a confirmed cloud heartbeat');
  }finally{DB.close();}
});

test('Windows Companion 2.3.17 preserves interactive desktop geometry and engine self-refresh',async()=>{
  const desktop=await readFile(new URL('../windows-companion/MEL-Companion.cs',import.meta.url),'utf8');
  const companion=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.match(desktop,/Version = "2\.3\.17"/);
  assert.match(desktop,/EnsureCompanion/);
  assert.match(desktop,/CompanionRunning/);
  assert.match(desktop,/StartBackgroundSupervisor/);
  assert.match(desktop,/System\.Threading\.Timer/);
  assert.match(companion,/\$Version = "1\.5\.3"/);
  // Heartbeat must report the current on-disk owner switch, not a cached startup flag.
  assert.match(companion,/remote_access_enabled\s*=\s*\$remoteEnabled/);
  assert.match(companion,/try \{ Assert-LocalRemoteAccess; \$remoteEnabled = \$true \} catch \{\}/);
  assert.match(companion,/engine_heartbeat_at/);
  assert.match(companion,/function Perform-SovereigntyRuntime/);
  assert.match(companion,/sovereignty\.runtime\./);
  assert.match(companion,/SOVEREIGNTY_RUNTIME_SOURCE_SHA_MISMATCH/);
});


test('scoped OIDC MINI USB inspection maps only serial.inspect to a fixed local system probe',async()=>{
  const api=await readFile(new URL('../src/devices/computer-companion-api.js',import.meta.url),'utf8');
  const relay=await readFile(new URL('../scripts/cloudflare-api-relay-runner.mjs',import.meta.url),'utf8');
  assert.ok(api.includes('"mini.readonly.discover","process.list","mini.readonly.backup.audit"'));
  assert.match(api,/action==="serial\.inspect"/);
  assert.match(api,/effectiveAction="system\.exec"/);
  assert.match(api,/Get-CimInstance Win32_PnPEntity/);
  assert.match(api,/Get-CimInstance Win32_SerialPort/);
  assert.match(api,/SERIAL_PORT_INVALID/);
  assert.match(relay,/MINI_USB_INSPECT=/);
  assert.match(relay,/action:'serial\.inspect'/);
});


test('scheduled OIDC diagnostics cannot reset MINI even with a legacy environment flag', async () => {
  const source = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  const relay = await readFile(new URL('../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  const allowed = source.split('const PC_CONTROL_PROOF_ACTIONS=new Set(')[1]?.split(';')[0] || '';
  assert.ok(allowed.includes('"serial.inspect"'));
  assert.ok(allowed.includes('"mini.readonly.discover"'));
  assert.ok(!allowed.includes('"mini.readonly.security"'));
  assert.ok(!allowed.includes('"mini.readonly.backup"'));
  assert.ok(!allowed.includes('"serial.hard_reset"'));
  assert.ok(source.includes('device.metadata?.remote_access_enabled!==true&&a.kind!=="github-oidc"'));
  assert.ok(!relay.includes("action:'serial.hard_reset'"));
  assert.ok(!relay.includes("MEL_MINI_RESET_APPROVED"));
  assert.ok(relay.includes('automatic_reset_allowed:false'));
});


test('native Companion implements read-only serial.inspect for PC Control', () => {
  const companion = readFileSync(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  assert.ok(companion.includes('function PcControl-SerialInspect($payload)'));
  assert.ok(companion.includes('"serial.inspect" { return PcControl-SerialInspect $payload }'));
  assert.ok(companion.includes('flash_performed=$false'));
  assert.ok(companion.includes('SERIAL_PORT_INVALID'));
});


function companionCanonical(value){
  if(Array.isArray(value))return '['+value.map(companionCanonical).join(',')+']';
  if(value&&typeof value==='object'){
    return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+companionCanonical(value[key])).join(',')+'}';
  }
  return JSON.stringify(value);
}
function companionSignature(secretHex,body){
  return createHmac('sha256',Buffer.from(secretHex,'hex'))
    .update(companionCanonical(body),'utf8').digest('hex');
}
async function pairedProposalDevice(DB,env,computerId,{remote=true}={}){
  const codeResponse=await maybeHandleComputerApi(
    ownerRequest('/api/computer/v1/pair-code','POST',{}),env);
  const code=(await codeResponse.json()).code;
  const pairedResponse=await maybeHandleComputerApi(new Request(
    'https://mel.test/api/computer/v1/pair',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({pair_code:code,computer_id:computerId,platform:'windows'})
    }),env);
  const paired=await pairedResponse.json();
  await DB.prepare('UPDATE computer_devices SET metadata=? WHERE id=?')
    .bind(JSON.stringify({remote_access_enabled:remote}),computerId).run();
  return {token:paired.token,headers:{
    authorization:'Bearer '+paired.token,
    'x-mel-computer-id':computerId
  }};
}

test('VIA signed proposal relay queues, claims and acknowledges one owner-confirmed input request',async()=>{
  const DB=sqliteD1();
  const secret='ab'.repeat(32);
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',
      COMPANION_PROPOSAL_HMAC_SECRET:secret};
    const computerId='pc-proposal-relay';
    const device=await pairedProposalDevice(DB,env,computerId);
    const queued=await maybeHandleComputerApi(ownerRequest(
      '/api/computer/v1/proposals','POST',{
        computer_id:computerId,action:'windows.input.click',payload:{x:120,y:240}
      }),env);
    assert.equal(queued.status,202);
    const queuedBody=await queued.json();
    assert.equal(queuedBody.status,'PENDING');
    assert.match(queuedBody.request_id,/^[0-9a-f]{32}$/);

    const claimed=await maybeHandleComputerApi(new Request(
      'https://mel.test/api/computer/v1/proposals/next',{headers:device.headers}),env);
    assert.equal(claimed.status,200);
    const envelope=await claimed.json();
    assert.equal(envelope.schema,'vi.companion.signed-request.v1');
    assert.equal(envelope.computer_id,computerId);
    assert.equal(envelope.nonce,queuedBody.request_id);
    assert.equal(envelope.action,'windows.input.click');
    assert.deepEqual(envelope.payload,{x:120,y:240});
    const signedBody={schema:envelope.schema,computer_id:envelope.computer_id,
      nonce:envelope.nonce,issued_at:envelope.issued_at,
      action:envelope.action,payload:envelope.payload};
    assert.equal(envelope.signature,companionSignature(secret,signedBody));

    const empty=await maybeHandleComputerApi(new Request(
      'https://mel.test/api/computer/v1/proposals/next',{headers:device.headers}),env);
    assert.equal(empty.status,204);

    const receiptBody={schema:'vi.companion.receipt.v1',computer_id:computerId,
      request_id:envelope.nonce,status:'owner_declined',
      issued_at:Math.floor(Date.now()/1000),executed:false,execution_verified:false};
    const receipt={...receiptBody,
      signature:companionSignature(secret,receiptBody)};
    const delivered=await maybeHandleComputerApi(new Request(
      'https://mel.test/api/computer/v1/proposals/receipt',{
        method:'POST',headers:{...device.headers,'content-type':'application/json'},
        body:JSON.stringify(receipt)
      }),env);
    assert.equal(delivered.status,202);
    assert.deepEqual(await delivered.json(),{
      status:'acknowledged',request_id:envelope.nonce,executed:false
    });
    const retry=await maybeHandleComputerApi(new Request(
      'https://mel.test/api/computer/v1/proposals/receipt',{
        method:'POST',headers:{...device.headers,'content-type':'application/json'},
        body:JSON.stringify(receipt)
      }),env);
    assert.equal(retry.status,202);
    assert.deepEqual(await retry.json(),{
      status:'acknowledged',request_id:envelope.nonce,executed:false
    });
    const row=await DB.prepare(
      'SELECT status,receipt_hash FROM computer_proposals WHERE nonce=? AND device_id=?'
    ).bind(envelope.nonce,computerId).first();
    assert.equal(row.status,'RECEIVED');
    assert.match(row.receipt_hash,/^[0-9a-f]{64}$/);
  }finally{DB.close();}
});

test('VIA signed proposal relay requires device auth, local remote opt-in and a shared HMAC secret',async()=>{
  const DB=sqliteD1();
  try{
    const secret='cd'.repeat(32);
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',
      COMPANION_PROPOSAL_HMAC_SECRET:secret};
    const off=await pairedProposalDevice(DB,env,'pc-proposal-disabled',{remote:false});
    let response=await maybeHandleComputerApi(ownerRequest(
      '/api/computer/v1/proposals','POST',{
        computer_id:'pc-proposal-disabled',action:'windows.input.key',payload:{key:'escape'}
      }),env);
    assert.equal(response.status,403);
    assert.equal((await response.json()).code,'REMOTE_ACCESS_DISABLED_LOCALLY');

    const noHeader=await maybeHandleComputerApi(new Request(
      'https://mel.test/api/computer/v1/proposals/next',{
        headers:{authorization:'Bearer '+off.token,'x-via-computer-id':'pc-proposal-disabled'}
      }),env);
    assert.equal(noHeader.status,401);
    assert.equal((await noHeader.json()).code,'COMPUTER_AUTH_REQUIRED');

    const noSecretEnv={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
    const active=await pairedProposalDevice(DB,noSecretEnv,'pc-proposal-no-secret');
    response=await maybeHandleComputerApi(ownerRequest(
      '/api/computer/v1/proposals','POST',{
        computer_id:'pc-proposal-no-secret',action:'windows.input.key',payload:{key:'escape'}
      }),noSecretEnv);
    assert.equal(response.status,503);
    assert.equal((await response.json()).code,'COMPANION_PROPOSAL_SIGNING_SECRET_UNAVAILABLE');
    response=await maybeHandleComputerApi(new Request(
      'https://mel.test/api/computer/v1/proposals/next',{headers:active.headers}),noSecretEnv);
    assert.equal(response.status,503);
    assert.equal((await response.json()).code,'COMPANION_PROPOSAL_SIGNING_SECRET_UNAVAILABLE');
  }finally{DB.close();}
});

test('VIA signed proposal relay rejects unlisted actions, malformed input and conflicting receipt replay',async()=>{
  const DB=sqliteD1();
  const secret='ef'.repeat(32);
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',
      COMPANION_PROPOSAL_HMAC_SECRET:secret};
    const computerId='pc-proposal-validation';
    const device=await pairedProposalDevice(DB,env,computerId);
    for(const [action,payload] of [
      ['system.exec',{command:'calc.exe'}],
      ['windows.input.key',{key:'ctrl+alt+delete'}],
      ['windows.input.click',{x:-1,y:0}],
      ['windows.input.click',{x:1,y:2,hwnd:123}],
      ['windows.input.key',{key:'escape',hwnd:123}]
    ]){
      const refused=await maybeHandleComputerApi(ownerRequest(
        '/api/computer/v1/proposals','POST',{computer_id:computerId,action,payload}),env);
      assert.equal(refused.status,403);
    }
    const queued=await maybeHandleComputerApi(ownerRequest(
      '/api/computer/v1/proposals','POST',{
        computer_id:computerId,action:'windows.input.key',payload:{key:'escape'}
      }),env);
    const queuedBody=await queued.json();
    const claimed=await maybeHandleComputerApi(new Request(
      'https://mel.test/api/computer/v1/proposals/next',{headers:device.headers}),env);
    const envelope=await claimed.json();
    const receiptBody={schema:'vi.companion.receipt.v1',computer_id:computerId,
      request_id:envelope.nonce,status:'owner_declined',
      issued_at:Math.floor(Date.now()/1000),executed:false,execution_verified:false};
    const receipt={...receiptBody,
      signature:companionSignature(secret,receiptBody)};
    const first=await maybeHandleComputerApi(new Request(
      'https://mel.test/api/computer/v1/proposals/receipt',{
        method:'POST',headers:{...device.headers,'content-type':'application/json'},
        body:JSON.stringify(receipt)
      }),env);
    assert.equal(first.status,202);
    const conflictBody={...receiptBody,status:'failed'};
    const conflict={...conflictBody,signature:companionSignature(secret,conflictBody)};
    const replay=await maybeHandleComputerApi(new Request(
      'https://mel.test/api/computer/v1/proposals/receipt',{
        method:'POST',headers:{...device.headers,'content-type':'application/json'},
        body:JSON.stringify(conflict)
      }),env);
    assert.equal(replay.status,409);
    assert.equal((await replay.json()).code,'COMPANION_RECEIPT_CONFLICT');
    assert.equal(queuedBody.request_id,envelope.nonce);
  }finally{DB.close();}
});
