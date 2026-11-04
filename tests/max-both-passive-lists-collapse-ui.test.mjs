import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
const start = source.indexOf('function renderActivityPanel(panel,activity){');
const end = source.indexOf('\nasync function showActivity(panel){',start);
assert.ok(start>=0 && end>start);
const render = runInNewContext('('+source.slice(start,end)+')', {
  activityMarkup: () => '<details class="act-waiting-passive"><summary>À venir (12)</summary><div>12 missions</div></details><details class="act-roadmap-passive"><summary>Objectifs roadmap à venir (23)</summary><div>23 objectifs</div></details>'
});
function panel() {
  let html = '', nodes = {};
  return {
    querySelector(sel) { return nodes[sel] || null; },
    get innerHTML(){return html;},
    set innerHTML(value){
      html = value;
      nodes = Object.fromEntries(['.act-waiting-passive','.act-roadmap-passive'].map(sel=>[sel,{open:false}]));
    },
  };
}
test('both passive lists start collapsed independently and retain their contents',()=>{
  assert.match(source, /<details class="act-waiting-passive"><summary>/);
  assert.match(source, /<details class="act-roadmap-passive"><summary>/);
  const p=panel();render(p,{});
  assert.equal(p.querySelector('.act-waiting-passive').open,false);
  assert.equal(p.querySelector('.act-roadmap-passive').open,false);
  assert.match(p.innerHTML,/12 missions/);
  assert.match(p.innerHTML,/23 objectifs/);
});
test('independent expansion survives polling and new panels start collapsed',()=>{
  const p=panel();render(p,{});
  p.querySelector('.act-waiting-passive').open=true;
  render(p,{});
  assert.equal(p.querySelector('.act-waiting-passive').open,true);
  assert.equal(p.querySelector('.act-roadmap-passive').open,false);
  p.querySelector('.act-roadmap-passive').open=true;
  p.querySelector('.act-waiting-passive').open=false;
  render(p,{});
  assert.equal(p.querySelector('.act-waiting-passive').open,false);
  assert.equal(p.querySelector('.act-roadmap-passive').open,true);
  const fresh=panel();render(fresh,{});
  assert.equal(fresh.querySelector('.act-waiting-passive').open,false);
  assert.equal(fresh.querySelector('.act-roadmap-passive').open,false);
});
