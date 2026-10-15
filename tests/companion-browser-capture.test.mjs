import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateComputerUsePlan } from '../src/devices/computer-use.js';
const plan=approved=>evaluateComputerUsePlan({session_id:'s',device:{id:'pc',capabilities:['computer.use']},sandbox:{allowed_origins:[],allowed_paths:[],allowed_apps:[]},steps:[{id:'capture',action:'browser.capture'}],approvals:approved?[{session_id:'s',step_id:'capture',action:'browser.capture',approved:true}]:[]});
test('browser capture needs explicit step approval',()=>{assert.equal(plan(false).allowed,false);assert.equal(plan(true).allowed,true)});
test('browser capture requires foreground browser and local screenshot consent',async()=>{const a=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');const b=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');assert.equal(a,b);const handler=a.slice(a.indexOf('"browser.capture" {'),a.indexOf('"browser.inspect" {'));assert.match(handler,/Assert-ForegroundBrowser/);assert.match(handler,/Assert-UnattendedCapturePermission/);assert.match(handler,/Upload-Screenshot/);assert.match(handler,/full_desktop_capture=\$true/)});
