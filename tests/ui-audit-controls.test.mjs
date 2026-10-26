import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {onRequestGet as fullMode} from '../src/pages/full-interface-v2.js';
import {onRequestGet as workMode} from '../src/pages/revenue-interface.js';
import {renderFidesGuestPage} from '../src/pages/fides-guest-page.js';
import {getRoadmapPayload,validateRoadmap} from '../src/roadmap/master-roadmap.js';

test('WORK provider secrets are masked and all connection fields have distinct accessible names',async()=>{
 const dom=new JSDOM(await(await workMode()).text());
 try{
  const d=dom.window.document;
  for(const name of ['api_key','app_password'])assert.equal(d.querySelector('input[name="'+name+'"]').type,'password');
  const inputs=[...d.querySelectorAll('form input')];
  const labels=inputs.map(input=>input.getAttribute('aria-label'));
  assert.ok(labels.every(Boolean));assert.equal(new Set(labels).size,inputs.length);
  assert.equal(d.querySelector('input[name="handle"]').type,'text');
 }finally{dom.window.close();}
});

test('Android pairing inputs are named without depending on disappearing placeholders',async()=>{
 const dom=new JSDOM(await(await fullMode({})).text());
 try{for(const id of ['androidPairHost','androidPairCode','androidConnectHost'])assert.ok(dom.window.document.getElementById(id).getAttribute('aria-label'));}
 finally{dom.window.close();}
});

test('the canonical audit phase and professional chat phase coexist without duplicate identity or false certification',()=>{
 const payload=getRoadmapPayload();assert.equal(validateRoadmap().ok,true);
 const audit=payload.phases.find(p=>p.id==='P18'),chat=payload.phases.find(p=>p.id==='P19');
 assert.equal(audit.items.length,7);assert.equal(chat.items.length,12);
 assert.ok(audit.items.every(i=>i.id.startsWith('MEL-UI-AUDIT-')&&i.status!=='DONE_VERIFIED'));
 assert.ok(chat.items.every(i=>(/^(?:MEL-CHAT-|MEL-COUNCIL-OPS-|MEL-LORA-(?:CHAT|MODE)-)/.test(i.id))&&i.status!=='DONE_VERIFIED'));
});

test('the public guest composer has a stable accessible name',()=>{
 const dom=new JSDOM(renderFidesGuestPage());
 try{assert.ok(dom.window.document.getElementById('message').getAttribute('aria-label'));}finally{dom.window.close();}
});
