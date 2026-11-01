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

// MEL-UI-AUDIT-01: executable inventory of visible controls with a receipt.
test('every visible full-mode control is linked to its handler and receives a PASS, FAIL or BLOCKED receipt without mutation', async () => {
  const { inventoryControls, controlReceipt } = await import('../scripts/ui-production-audit.mjs');
  const html = await (await fullMode()).text();
  const controls = inventoryControls(html);
  assert.ok(controls.length >= 50, 'the full mode exposes its controls');
  assert.deepEqual(controls.filter(control => !control.handled).map(control => control.id), [], 'no orphan button');
  assert.equal(controls.find(control => control.id === 'objectiveAddSubmit').via, 'form');
  const receipt = controlReceipt(controls);
  assert.equal(receipt.mutations_performed, 0);
  assert.equal(receipt.pass + receipt.blocked + receipt.fail, controls.length);
  assert.equal(receipt.fail, 0);
  assert.ok(receipt.blocked > 0, 'mutating controls are BLOCKED, never clicked');
  const orphan = inventoryControls('<button id="lost" type="button">x</button><script>const a=1;</script>');
  assert.deepEqual(controlReceipt(orphan).controls, [{ id: 'lost', api: [], status: 'FAIL' }]);
  assert.equal(controlReceipt(controls, { jsErrors: ['TypeError'] }).fail, controls.length);
});

// MEL-UI-AUDIT-07: accessibility and release-path regression, tied to a SHA.
test('the recipe checks keyboard, focus, disabled states and restoration on desktop and mobile, tied to the tested SHA', async () => {
  const { accessibilityFindings, releaseAuditReport, AUDIT_VIEWPORTS } = await import('../scripts/ui-production-audit.mjs');
  assert.deepEqual(AUDIT_VIEWPORTS.map(v => v.name), ['desktop', 'mobile']);
  const clean = { path: '/', panel: 'chat', viewport: 'desktop', focus_restored: true, horizontal_scroll: false,
    controls: [{ id: 'send', accessible_name: 'Envoyer', focusable: true, disabled: false },
      { id: 'later', accessible_name: 'Envoyer quand terminé', focusable: false, disabled: true }] };
  assert.deepEqual(accessibilityFindings(clean), []);
  const broken = accessibilityFindings({ path: '/', panel: 'chat', viewport: 'mobile', focus_restored: false, horizontal_scroll: true,
    controls: [{ id: 'nameless', focusable: true }, { id: 'trap', accessible_name: 'X', focusable: false, disabled: false },
      { id: 'ghost', accessible_name: 'Y', focusable: true, disabled: true }] });
  assert.deepEqual(broken.map(f => f.code), ['UI_CONTROL_WITHOUT_ACCESSIBLE_NAME', 'UI_CONTROL_NOT_KEYBOARD_REACHABLE',
    'UI_DISABLED_CONTROL_STILL_FOCUSABLE', 'UI_FOCUS_NOT_RESTORED', 'UI_HORIZONTAL_SCROLL']);
  assert.match(broken[0].detail, /mobile/);
  const sha = 'a'.repeat(40);
  const full = releaseAuditReport([clean, { ...clean, viewport: 'mobile' }], { sha, baseUrl: 'https://mel.example' });
  assert.equal(full.tested_sha, sha);
  assert.equal(full.viewports_complete, true);
  assert.equal(full.conclusive, true);
  const unpinned = releaseAuditReport([clean, { ...clean, viewport: 'mobile' }], { sha: 'main' });
  assert.equal(unpinned.tested_sha, null, 'a branch name is not a tested revision');
  assert.equal(unpinned.conclusive, false);
  assert.equal(releaseAuditReport([clean], { sha }).conclusive, false, 'desktop alone never concludes');
  assert.equal(releaseAuditReport([], { sha }).conclusive, false);
});
