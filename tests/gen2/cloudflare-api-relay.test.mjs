import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyHttpAuthSurface } from '../../src/security/http-auth-policy.js';
import { cloudflareApiRelay } from '../../src/api/cloudflare-api-relay.js';
import { D1CloudflareApiRelayStore } from '../../src/platform/cloudflare-api-relay.js';
import { selectAuthorizedWindowsCompanion } from '../../src/devices/companion-relay-selection.js';

test('Cloudflare API relay route delegates authentication to scoped OIDC handler', () => {
  const request = new Request('https://mel.example/api/internal/cloudflare-api-relay/heartbeat', { method:'POST' });
  assert.equal(classifyHttpAuthSurface(request).kind, 'DELEGATED_STRONG_AUTH');
});

test('Cloudflare API relay fails closed without GitHub Actions OIDC', async () => {
  const request = new Request('https://mel.example/api/internal/cloudflare-api-relay/heartbeat', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:'{}',
  });
  const response = await cloudflareApiRelay(request, { MEL_GITHUB_REPOSITORY:'owner/repo' });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'GITHUB_OIDC_TOKEN_REQUIRED');
});

test('Cloudflare API relay ignores unrelated routes', async () => {
  const response = await cloudflareApiRelay(
    new Request('https://mel.example/api/internal/other'),
    {},
  );
  assert.equal(response, null);
});


test('Cloudflare relay runner reads deployment list from documented result.deployments shape', async () => {
  const source = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  const deploymentBranch = source.slice(source.indexOf("job.operation==='deployments.list'"));
  assert.match(deploymentBranch, /Array\.isArray\(body\?\.result\?\.deployments\)\?body\.result\.deployments/);
  assert.doesNotMatch(deploymentBranch, /Array\.isArray\(body\?\.result\)\?body\.result:\[\]/);
});


test('Cloudflare relay deployment create is bounded, non-force and verifies the created deployment', async () => {
  const source = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  const createBranch = source.slice(source.indexOf("job.operation==='deployments.create'"));
  assert.match(createBranch, /method:'POST'/);
  assert.match(createBranch, /strategy:'percentage'/);
  assert.match(createBranch, /workers\/message/);
  assert.match(createBranch, /await cf\(path\+'\/'\+encodeURIComponent\(deploymentId\)\)/);
  assert.doesNotMatch(createBranch, /force\s*:/);
});


test('Cloudflare relay exposes only sanitized MINI heartbeat fields to its scoped OIDC workflow', async () => {
  const api = await readFile(new URL('../../src/api/cloudflare-api-relay.js', import.meta.url), 'utf8');
  const runner = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  assert.match(api, /cloudflare-api-relay\/mini-status/);
  assert.match(api, /firmware:status\.firmware/);
  assert.match(api, /microphone:status\.microphone/);
  assert.match(api, /speaker:status\.speaker/);
  assert.match(api, /camera:status\.camera/);
  assert.match(api, /internal_storage:status\.internal_storage/);
  const miniBranch = api.slice(api.indexOf("cloudflare-api-relay/mini-status"), api.indexOf("cloudflare-api-relay/claim"));
  assert.doesNotMatch(miniBranch, /status\.ip/);
  assert.match(runner, /MINI_DEVICE_STATUS=/);
  assert.match(runner, /cloudflare-api-relay\/mini-status/);
});


test('MINI reset policy rejects scheduled and dispatch-triggered serial resets', async () => {
  const runner = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../../.github/workflows/cloudflare-api-relay.yml', import.meta.url), 'utf8');
  const api = await readFile(new URL('../../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.ok(!workflow.includes('MEL_MINI_RESET_APPROVED'));
  assert.ok(!runner.includes('MEL_MINI_RESET_APPROVED'));
  assert.ok(!runner.includes("action:'serial.hard_reset'"));
  assert.ok(runner.includes('automatic_reset_allowed:false'));
  const oidcAllowed = api.split('const PC_CONTROL_PROOF_ACTIONS=new Set(')[1]?.split(';')[0] || '';
  assert.ok(!oidcAllowed.includes('"serial.hard_reset"'));
  assert.ok(oidcAllowed.includes('"serial.read"'));
});

test('Cloudflare relay exposes only sanitized published MINI firmware metadata', async () => {
  const api = await readFile(new URL('../../src/api/cloudflare-api-relay.js', import.meta.url), 'utf8');
  const runner = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  assert.match(api, /cloudflare-api-relay\/mini-firmware-status/);
  assert.match(api, /devices\/waveshare-esp32-s3-touch-lcd-3\.5-c\/manifest\.json/);
  assert.match(api, /source_sha/);
  assert.match(api, /MINI_FIRMWARE_MANIFEST_INVALID/);
  assert.doesNotMatch(api, /mini-firmware-status[\s\S]{0,2500}object\.body/);
  assert.match(runner, /MINI_PUBLISHED_FIRMWARE_STATUS=/);
});

test('queued Cloudflare jobs are processed before unrelated local Companion diagnostics', async () => {
  const source = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  const heartbeat = source.indexOf("await worker('/api/internal/cloudflare-api-relay/heartbeat'");
  const claim = source.indexOf("await worker('/api/internal/cloudflare-api-relay/claim')");
  const result = source.indexOf("await worker('/api/internal/cloudflare-api-relay/result'");
  const device = source.indexOf("await worker('/api/internal/cloudflare-api-relay/mini-status'");
  const localPc = source.indexOf("await worker('/api/computer/v1/status'");
  assert.ok(heartbeat >= 0 && claim > heartbeat && result > claim && device > result && localPc > device,
    'server-side cloudflare queue must be processed before optional device diagnostics');
  assert.match(source,/if\(job\.operation==='workers\.list'\)/);
  assert.match(source,/if\(job\.operation==='deployments\.list'\)/);
  assert.match(source,/if\(job\.operation==='deployments\.create'\)/);
  assert.match(source,/if\(proof\.some\(row=>row\.status!=='SUCCEEDED'\)\) throw/);
  assert.doesNotMatch(source,/MEL_MINI_RESET_APPROVED|action:'serial\.hard_reset'/);
});

test('two concurrent Cloudflare relay runners can claim a queued deployment only once', async () => {
  const row={id:'cf-relay-unit-1',status:'QUEUED',operation:'deployments.create',
    input_json:'{}',result_json:null,error:null,created_at:1,updated_at:1,claimed_at:null,completed_at:null};
  let selected=0;
  let releaseReads;
  const bothSelected=new Promise(resolve=>{releaseReads=resolve;});
  let winningUpdates=0;
  const db={
    prepare(sql) {
      const query=String(sql);
      return {
        args:[],
        bind(...args){this.args=args;return this;},
        async run(){
          if(query.includes("UPDATE cloudflare_api_relay_jobs SET status='CLAIMED'")){
            if(row.status!=='QUEUED')return {meta:{changes:0}};
            row.status='CLAIMED';
            row.claimed_at=this.args[0];
            winningUpdates++;
            return {meta:{changes:1}};
          }
          return {meta:{changes:0}};
        },
        async first(){
          if(query.includes("SELECT id FROM cloudflare_api_relay_jobs WHERE status='QUEUED'")){
            if(row.status!=='QUEUED')return null;
            selected++;
            if(selected===2)releaseReads();
            await bothSelected;
            return {id:row.id};
          }
          if(query.includes('SELECT * FROM cloudflare_api_relay_jobs WHERE id=?')){
            return {...row};
          }
          return null;
        },
      };
    },
  };
  const store=new D1CloudflareApiRelayStore(db);
  const [a,b]=await Promise.all([store.claim({now:100}),store.claim({now:101})]);
  assert.equal(winningUpdates,1);
  const winners=[a,b].filter(Boolean);
  assert.equal(winners.length,1,'losing runner must not execute the same deployment');
  assert.equal(winners[0].operation,'deployments.create');
  assert.equal(winners[0].status,'CLAIMED');
});

test('Cloudflare relay claim fails closed if D1 omits the affected-row proof', async () => {
  let reads=0;
  const db={prepare(sql){
    const query=String(sql);
    return {
      bind(){return this;},
      async run(){return {};},
      async first(){
        if(query.includes("SELECT id FROM cloudflare_api_relay_jobs WHERE status='QUEUED'")){
          reads++;
          return reads===1?{id:'cf-relay-missing-meta'}:null;
        }
        if(query.includes('SELECT * FROM cloudflare_api_relay_jobs WHERE id=?')){
          throw new Error('losing claim must never fetch or execute a job');
        }
        return null;
      },
    };
  }};
  assert.equal(await new D1CloudflareApiRelayStore(db).claim(),null);
});

test('optional Companion diagnostics cannot mark unrelated Cloudflare relay operations as failed', async () => {
  const runner = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url),'utf8');
  const claim=runner.indexOf("await worker('/api/internal/cloudflare-api-relay/claim')");
  const boundary=runner.indexOf('try {\n  const miniStatus=');
  const pc=runner.indexOf("await worker('/api/computer/v1/status'");
  const report=runner.indexOf('LOCAL_DEVICE_DIAGNOSTICS_UNVERIFIED=');
  const terminal=runner.indexOf('main().catch');
  assert.ok(claim>=0 && boundary>claim && pc>boundary && report>pc && terminal>report);
  assert.match(runner,/local_authorization_bypassed:false,pc_proof_verified:false/);
  assert.match(runner,/console\.warn\('::warning::LOCAL_DEVICE_DIAGNOSTICS_UNVERIFIED:'/);
  assert.match(runner,/if\(proof\.some\(row=>row\.status!=='SUCCEEDED'\)\) throw/);
  assert.doesNotMatch(runner,/REMOTE_ACCESS_DISABLED_LOCALLY.*?(?:enable|override|bypass)/);
  assert.doesNotMatch(runner,/MEL_MINI_RESET_APPROVED|action:'serial\.hard_reset'/);
});

test('Companion relay selects a fresh authorized Windows engine, never the first online PC blindly', () => {
  const now=1_800_000_000_000;
  const device=(id,overrides={})=>({
    id,platform:'windows',online:true,halted:false,last_seen_at:now-1000,
    metadata:{remote_access_enabled:true,engine_heartbeat_at:now-1000,version:'2.3.14'},
    ...overrides,
  });
  const revoked=device('revoked',{last_seen_at:now,metadata:{remote_access_enabled:false,engine_heartbeat_at:now}});
  const staleEngine=device('stale',{last_seen_at:now,metadata:{remote_access_enabled:true,engine_heartbeat_at:now-21000}});
  const halted=device('halted',{last_seen_at:now,halted:true});
  const future=device('future',{last_seen_at:now+100});
  const notWindows=device('android',{platform:'android',last_seen_at:now});
  const older=device('older',{last_seen_at:now-14000,metadata:{remote_access_enabled:true,engine_heartbeat_at:now-14000}});
  const freshest=device('fresh',{last_seen_at:now-1500});
  const selected=selectAuthorizedWindowsCompanion(
    [revoked,staleEngine,halted,future,notWindows,older,freshest],now);
  assert.equal(selected.device?.id,'fresh');
  assert.equal(selected.eligible_count,2);
  assert.equal(selectAuthorizedWindowsCompanion([revoked,staleEngine,halted,future,notWindows],now).device,null);
  assert.equal(selectAuthorizedWindowsCompanion(null,now).eligible_count,0);
});

test('scheduled relay avoids logging personal PC identifiers and skips unauthorised probes', async () => {
  const runner=await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs',import.meta.url),'utf8');
  const begin=runner.indexOf("console.log('PC_CONTROL_DEVICE_STATUS='");
  const end=runner.indexOf('if(computer){',begin);
  assert.ok(begin>0 && end>begin);
  const section=runner.slice(begin,end);
  assert.match(section,/identifiers_exposed:false/);
  assert.match(section,/PC_CONTROL_LIVE_PROOF_SKIPPED:NO_FRESH_AUTHORIZED_WINDOWS_DEVICE/);
  assert.doesNotMatch(section,/id:row\?\.id|name:row\?\.name/);
  const live=runner.slice(runner.indexOf("console.log('PC_CONTROL_LIVE_PROOF='"));
  assert.match(live,/commands:proof\.map/);
  assert.doesNotMatch(live.slice(0,430),/name:computer\.name|id:computer\.id/);
});
