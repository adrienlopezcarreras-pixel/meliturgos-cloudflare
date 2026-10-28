import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { onRequestGet as professorPage } from '../src/pages/full-interface-v2.js';
import { onRequestGet as normalPage } from '../src/pages/mvp-interface-v3.js';
import { OBJECTIVE_PANEL_SOURCE } from '../src/pages/objective-panel-runtime.js';

function fixture(saved = null) {
  const dom = new JSDOM(`<!doctype html><body>
    <aside id="objectivePanel" class="professor-objective-panel">
      <div id="objectiveDrag" tabindex="0"><h2>Objectif en cours</h2>
        <button id="objectiveCollapse" aria-expanded="true">Réduire</button>
        <button id="objectiveHide">Fermer</button></div>
      <div id="objectiveContent"><p id="objectiveTitle"></p><ol id="objectiveSteps"></ol>
        <form id="objectiveAdd"><input id="objectiveNewStep"><button type="submit">Ajouter</button></form>
      </div></aside>
    <button id="objectiveShow" hidden>Afficher objectif</button>
  </body>`, {url:'https://mel.example/professor',runScripts:'outside-only'});
  const win=dom.window;
  Object.defineProperty(win,'innerWidth',{value:1200,configurable:true});
  Object.defineProperty(win,'innerHeight',{value:800,configurable:true});
  win.requestAnimationFrame=callback=>callback();
  const panel=win.document.getElementById('objectivePanel');
  panel.getBoundingClientRect=()=>({
    left:Number.parseFloat(panel.style.left)||826,
    top:Number.parseFloat(panel.style.top)||290,
    width:350,height:235,
    right:(Number.parseFloat(panel.style.left)||826)+350,
    bottom:(Number.parseFloat(panel.style.top)||290)+235,
  });
  Object.defineProperty(panel,'offsetWidth',{get:()=>350});
  Object.defineProperty(panel,'offsetHeight',{get:()=>235});
  if(saved)win.localStorage.setItem('mel-professor-objective-float-v1',JSON.stringify(saved));
  win.fetch=async()=>({ok:true,json:async()=>({plan:null})});
  win.eval(OBJECTIVE_PANEL_SOURCE);
  return {dom,win,panel,drag:win.document.getElementById('objectiveDrag')};
}
function pointer(win,target,type,x,y,id=1) {
  const e=new win.Event(type,{bubbles:true,cancelable:true});
  Object.assign(e,{button:0,pointerId:id,clientX:x,clientY:y});
  target.dispatchEvent(e);
}

test('objective is a fixed floating Professeur-only panel outside chat layout sizing',async()=>{
  const prof=await (await professorPage()).text();
  const normal=await (await normalPage()).text();
  assert.equal((prof.match(/id="objectivePanel"/g)||[]).length,1);
  assert.match(prof,/\.professor-objective-panel\{position:fixed;z-index:90/);
  assert.match(prof,/id="objectiveDrag"/);
  assert.match(prof,/id="objectiveHide"/);
  assert.match(prof,/id="objectiveCollapse"/);
  assert.match(prof,/id="objectiveShow"/);
  assert.match(prof,/\.professor-objective-panel\[hidden\],#objectiveShow\[hidden\]\{display:none!important\}/);
  assert.ok(!normal.includes('id="objectivePanel"'),'Normal chat must not show objective');
  assert.ok(!prof.includes('.professor-objective-panel{display:block;margin-top:14px'));
});

test('dragging, keyboard movement, collapse, hide and restore retain local position',()=>{
  const {win,panel,drag,dom}=fixture();
  const startX=Number.parseFloat(panel.style.left);
  const startY=Number.parseFloat(panel.style.top);
  pointer(win,drag,'pointerdown',100,100);
  pointer(win,drag,'pointermove',40,150);
  pointer(win,drag,'pointerup',40,150);
  assert.equal(Number.parseFloat(panel.style.left),startX-60);
  assert.equal(Number.parseFloat(panel.style.top),startY+50);
  drag.dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  assert.equal(Number.parseFloat(panel.style.left),startX-80);
  const collapse=win.document.getElementById('objectiveCollapse');
  collapse.click();
  assert.equal(panel.classList.contains('is-collapsed'),true);
  assert.equal(collapse.getAttribute('aria-expanded'),'false');
  collapse.click();
  assert.equal(panel.classList.contains('is-collapsed'),false);
  win.document.getElementById('objectiveHide').click();
  assert.equal(panel.hidden,true);
  assert.equal(win.document.getElementById('objectiveShow').hidden,false);
  win.document.getElementById('objectiveShow').click();
  assert.equal(panel.hidden,false);
  const saved=JSON.parse(win.localStorage.getItem('mel-professor-objective-float-v1'));
  assert.equal(saved.left,startX-80);
  assert.equal(saved.top,startY+50);
  assert.equal(saved.hidden,false);
  dom.window.close();
});

test('stored location is clamped inside the viewport and controls stay functional',()=>{
  const {win,panel,dom}=fixture({left:100000,top:-1000,width:4000,height:4000,collapsed:false,hidden:false});
  assert.ok(Number.parseFloat(panel.style.left)<=842);
  assert.ok(Number.parseFloat(panel.style.top)>=8);
  assert.ok(Number.parseFloat(panel.style.width)<=1184);
  assert.ok(Number.parseFloat(panel.style.height)<=784);
  dom.window.close();
});
