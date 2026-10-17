import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('served MEL full-control browser script parses with Companion screenshot follow-up', async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();
  const inlineScripts = html.split('<script').slice(1).map(chunk => {
    const tagEnd = chunk.indexOf('>');
    return tagEnd < 0 ? '' : chunk.slice(tagEnd + 1).split('</script>')[0];
  });
  const controlScript = inlineScripts.find(source => source.includes('followChatComputerScreenshot('));
  assert.ok(controlScript, 'served browser bundle must contain the screenshot follow-up');
  assert.ok(controlScript.includes('async function followChatComputerScreenshot(command)'));
  assert.doesNotThrow(() => new Script(controlScript, { filename: 'mel-full-control-inline.js' }));
});

test('computer controls verify exact command completion before claiming success',async()=>{
 const response=await onRequestGet();
 const html=await response.text();
 const controls=html.split('<script').slice(1).map(chunk=>chunk.slice(chunk.indexOf('>')+1).split('</script>')[0]).join('\\n');
 assert.ok(controls.includes("entry?.id===queued.command_id"),'status must match queued command');
 assert.ok(controls.includes("command.status!=='SUCCEEDED'"),'pending must not count as success');
 assert.ok(controls.includes("command.status==='FAILED'||command.status==='CANCELLED'"),'failure must propagate');
 assert.ok(controls.includes("COMPUTER_COMMAND_NOT_CONFIRMED_WITHIN_30S"),'bounded proof window required');
 assert.ok(controls.includes("url.origin!==location.origin||url.pathname!=='/api/computer/v1/screenshot'"),'image must be same-origin authorized route');
 assert.ok(controls.includes("img.onload=()=>{")&&controls.includes("showVerifiedComputerScreen(proof,current,command,'CAPTURE CONFIRMÉE')"),'success must wait for actual image load');
 assert.ok(controls.includes("computerCommand([{action:'keyboard.press',key:b.dataset.pcKey}],true)"),'owner button click approves keyboard action');
 assert.ok(!controls.includes("await new Promise(r=>setTimeout(r,1500))"),'single 1.5-second sleep is not proof of execution');
});

test('chat captures are only declared verified after image load and second owner opt-in check',async()=>{
 const page=await onRequestGet();
 const html=await page.text();
 const begin=html.indexOf('async function followChatComputerScreenshot(command)');
 const end=html.indexOf('const melGoalPolls=',begin);
 assert.ok(begin>=0&&end>begin,'follow-up routine must exist in browser bundle');
 const fn=html.slice(begin,end);
 assert.ok(fn.includes("if(!pc||pc.halted||pc.metadata?.remote_access_enabled!==true)"));
 assert.ok(fn.includes('img.onload=async()=>{'));
 assert.ok(fn.includes("cmd?.id===commandId&&cmd.status==='SUCCEEDED'"));
 assert.ok(fn.includes("current.metadata?.remote_access_enabled!==true||!verified"));
 assert.ok(fn.includes("state.textContent='Capture exécutée et image chargée'"));
 assert.ok(fn.includes("state.textContent='Capture exécutée, chargement et autorisation en vérification…'"));
 assert.ok(fn.includes("img.onerror=()=>{state.textContent='Image inaccessible ou autorisation révoquée'"));
 assert.ok(!fn.includes("state.textContent='Capture exécutée et preuve vérifiée';return;"));
});
