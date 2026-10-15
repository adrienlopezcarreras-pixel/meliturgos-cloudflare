import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateComputerUsePlan } from '../src/devices/computer-use.js';
const plan = approved => evaluateComputerUsePlan({ session_id:'s', device:{id:'paired',capabilities:['computer.use']}, sandbox:{allowed_apps:[],allowed_paths:[],allowed_origins:[]}, steps:[{id:'close',action:'browser.close-tab'}], approvals:approved?[{session_id:'s',step_id:'close',action:'browser.close-tab',approved:true}]:[] });
test('browser.close-tab must be approved by owner',()=>{assert.equal(plan(false).allowed,false);assert.equal(plan(true).allowed,true)});
test('only foreground browsers may receive Ctrl+W',async()=>{const a=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');const b=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');assert.equal(a,b);const x=a.slice(a.indexOf('"browser.close-tab" {'),a.indexOf('"browser.new-tab" {'));assert.match(x,/Assert-ForegroundBrowser/);assert.match(x,/SendWait\("\^w"\)/)});
