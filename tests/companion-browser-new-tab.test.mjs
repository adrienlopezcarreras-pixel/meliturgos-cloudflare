import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateComputerUsePlan} from '../src/devices/computer-use.js';
const build = approved => evaluateComputerUsePlan({session_id:'s',device:{id:'pc',capabilities:['computer.use']},sandbox:{allowed_apps:[],allowed_paths:[],allowed_origins:[]},steps:[{id:'tab',action:'browser.new-tab',window_handle:'12345'}],approvals:approved?[{approved:true,session_id:'s',step_id:'tab',action:'browser.new-tab'}]:[]});
test('opening a browser tab requires explicit step approval',()=>{assert.equal(build(false).allowed,false);assert.equal(build(true).allowed,true)});
test('local handler targets only a recognized foreground browser',async()=>{const source=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');const dist=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');assert.equal(source,dist);const handler=source.slice(source.indexOf('"browser.new-tab" {'),source.indexOf('"browser.back" {'));assert.match(handler,/Assert-ForegroundBrowser/);assert.match(handler,/SendWait\("\^t"\)/);});
