// [Codex] Actual Node bridge against a loopback cloud; no live jobs/secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1GitHubActionRelayStore } from '../src/platform/github-action-relay.js';
import { readCompanionRelayPresence } from '../src/devices/computer-companion-api.js';

async function until(fn) {
  for (let i=0;i<100;i++) { const value=await fn().catch(()=>null); if(value)return value; await new Promise(r=>setTimeout(r,50)); }
  throw new Error('LOCAL_FIXTURE_TIMEOUT');
}
async function fixture(t, { auth=true }={}) {
  const root=await mkdtemp(path.join(os.tmpdir(),'mel-executor-test-'));
  let heartbeats=0, claims=0, concurrent=0, maxConcurrent=0;
  const cloud=http.createServer(async(req,res)=>{
    req.resume();
    res.setHeader('content-type','application/json');
    if(req.url.endsWith('/heartbeat')) { heartbeats++; res.statusCode=auth?200:401; res.end(JSON.stringify(auth?{bridge_id:'primary',last_seen:Date.now(),status:'ONLINE'}:{error:'PRIVATE_AUTH_DETAIL'})); }
    else { claims++; concurrent++; maxConcurrent=Math.max(concurrent,maxConcurrent); await new Promise(r=>setTimeout(r,100)); concurrent--; res.end('{"job":null}'); }
  });
  cloud.listen(0,'127.0.0.1'); await once(cloud,'listening');
  const probe=net.createServer(); probe.listen(0,'127.0.0.1'); await once(probe,'listening');
  const port=probe.address().port; await new Promise(r=>probe.close(r));
  const children=[];
  async function launch(session) {
    const control=path.join(root,session); await mkdir(control);
    const child=spawn(process.execPath,[fileURLToPath(new URL('../scripts/mel-dev-bridge.mjs',import.meta.url))],{
      cwd:root,env:{...process.env,MEL_DEV_BRIDGE_TOKEN:'private-fixture-token',MEL_DEV_WORKER_URL:`http://127.0.0.1:${cloud.address().port}`,MEL_DEV_BRIDGE_PORT:String(port),MEL_DEV_BRIDGE_CONTROL_DIR:control,MEL_DEV_BRIDGE_SESSION:session,MEL_DEV_BRIDGE_PARENT_PID:String(process.pid),MEL_DEV_BRIDGE_POLL_MS:'20'},stdio:['ignore','pipe','pipe'],
    });
    let output=''; child.stdout.on('data',d=>output+=d); child.stderr.on('data',d=>output+=d);
    children.push(child);
    return {child,control,receipt:()=>readFile(path.join(control,'status.json'),'utf8').then(JSON.parse),output:()=>output};
  }
  t.after(async()=>{ for(const child of children) { if(child.exitCode===null&&child.signalCode===null){ const ended=once(child,'exit'); child.kill('SIGKILL'); await ended; } } cloud.closeAllConnections(); await new Promise(r=>cloud.close(r)); await rm(root,{recursive:true,force:true}); });
  return {launch,counts:()=>({heartbeats,claims,maxConcurrent})};
}

test('real bridge persists only confirmed cloud receipts, rejects a second instance before heartbeat/claim, and stops on local request',async t=>{
  const f=await fixture(t); const first=await f.launch('first');
  const receipt=await until(async()=>{const r=await first.receipt();return r.code==='RUNNING'&&r;});
  assert.equal(receipt.pid,first.child.pid); assert.equal(receipt.session,'first'); assert.ok(receipt.heartbeat_at>0);
  assert.equal(JSON.stringify(receipt).includes('private-fixture-token'),false);
  await until(async()=>f.counts().claims>2);
  const before=f.counts().heartbeats;
  const second=await f.launch('second'); const [code]=await once(second.child,'exit');
  assert.equal(code,1); assert.equal((await second.receipt()).code,'LOCAL_PORT_UNAVAILABLE');
  assert.equal(f.counts().heartbeats,before,'losing duplicate cannot announce itself ONLINE');
  assert.equal(f.counts().maxConcurrent,1,'slow claims cannot overlap in one executor');
  const exit=once(first.child,'exit'); await writeFile(path.join(first.control,'stop'),'stop'); await exit;
  assert.equal((await first.receipt()).code,'STOPPED');
});

test('an actual cloud auth failure never creates a confirmed heartbeat or exposes response details',async t=>{
  const f=await fixture(t,{auth:false}); const run=await f.launch('auth');
  const receipt=await until(async()=>{const r=await run.receipt();return r.code==='CLOUD_AUTH_REQUIRED'&&r;});
  assert.equal(receipt.heartbeat_at,null); assert.equal(JSON.stringify(receipt).includes('PRIVATE_AUTH_DETAIL'),false);
});

test('GitHub relay presence uses its own real persisted heartbeat and expires independently of PC state',async t=>{
  const DB=sqliteD1();t.after(()=>DB.close()); const store=new D1GitHubActionRelayStore(DB);
  const now=Date.now(); await store.heartbeat({now,metadata:{token:'never expose',pc_online:false}});
  const live=await readCompanionRelayPresence({DB},now+1);
  assert.equal(live.status,'ONLINE'); assert.equal(live.last_seen_at,now); assert.equal(live.metadata,undefined);
  assert.equal((await readCompanionRelayPresence({DB},now+600001)).status,'OFFLINE');
  assert.equal((await readCompanionRelayPresence({DB},now-1)).status,'OFFLINE');
  assert.equal((await readCompanionRelayPresence({DB:null})).status,'UNKNOWN');
});

test('distribution stays identical, controls call the sole supervisor, and the window does not suspend it',async()=>{
  const source=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.equal(source,await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8'));
  for(const action of ['Start','Stop','Restart'])assert.ok(source.includes(`Invoke-DevExecutorControl ${action}`));
  assert.equal(source.split('function Ensure-DevExecutor').length-1,1);
  const panel=source.slice(source.indexOf('function Show-MelTrayPanel'),source.indexOf('function New-MelTrayIcon'));
  assert.ok(panel.includes('$form.Show()')); assert.ok(!panel.includes('$form.ShowDialog()'));
  assert.ok(source.includes('CANDIDATE_REPO_FORBIDDEN')); assert.ok(source.includes('File]::Replace'));
});
