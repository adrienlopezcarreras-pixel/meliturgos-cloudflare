import test from 'node:test';
import assert from 'node:assert/strict';
import { Script, createContext } from 'node:vm';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

async function helper(){
 const response=await onRequestGet();
 assert.equal(response.status,200);
 const html=await response.text();
 const start=html.indexOf('function companionDesktopReadiness(pc,now=Date.now()){');
 const end=html.indexOf('function renderComputer(d){',start);
 assert.ok(start>=0&&end>start,'served interface must contain local readiness helper');
 const context=createContext({});
 new Script(html.slice(start,end)+';this.readiness=companionDesktopReadiness;',{filename:'companion-readiness.js'}).runInContext(context);
 return {check:context.readiness,html};
}
test('Windows engine heartbeat, shell heartbeat and local consent have distinct truthful UI states',async()=>{
 const {check}=await helper();
 const now=Date.now();
 const pc={id:'pc-win',online:true,halted:false,last_seen_at:now-2000,
  metadata:{remote_access_enabled:true,engine_heartbeat_at:now-2000}};
 assert.equal(check(pc,now).code,'READY');
 assert.equal(check({...pc,halted:true},now).code,'OWNER_HALT_ACTIVE');
 assert.equal(check({...pc,online:false},now).code,'COMPUTER_DEVICE_OFFLINE');
 assert.equal(check({...pc,last_seen_at:now-40000},now).code,'COMPUTER_DEVICE_OFFLINE');
 assert.equal(check({...pc,metadata:{...pc.metadata,remote_access_enabled:false}},now).code,'REMOTE_ACCESS_DISABLED_LOCALLY');
 assert.equal(check({...pc,metadata:{...pc.metadata,engine_heartbeat_at:now-60000}},now).code,'COMPUTER_ENGINE_OFFLINE');
 assert.equal(check({...pc,metadata:{...pc.metadata,engine_heartbeat_at:now+1000}},now).code,'COMPUTER_ENGINE_OFFLINE');
 assert.equal(check({...pc,metadata:{remote_access_enabled:true}},now).code,'COMPUTER_ENGINE_OFFLINE');
 assert.equal(check(null,now).code,'COMPUTER_NOT_PAIRED');
});
test('served PC interface never claims engine ready solely because the Companion shell is online',async()=>{
 const {html}=await helper();
 const start=html.indexOf('function renderComputer(d){');
 const end=html.indexOf('async function loadComputer()',start);
 const rendering=html.slice(start,end);
 assert.ok(rendering.includes('const readiness=companionDesktopReadiness(pc);'));
 assert.ok(rendering.includes('const latest=readiness.ok?'));
 assert.ok(rendering.includes("state.textContent=readiness.label"));
 assert.ok(html.includes('if(!readiness.ok)throw Error(readiness.code)'));
 assert.ok(!rendering.includes("pc.online?'EN LIGNE'"));
});
