import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { onRequestGet as professor } from '../src/pages/full-interface-v2.js';
import { onRequestGet as normal } from '../src/pages/mvp-interface-v3.js';

async function professorRuntime(){
  const html=await (await professor()).text();
  const runtime=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(runtime);
  return {html,runtime};
}

test('send-when-finished is Professor-only, enabled by a draft, and runs through the real queue', async ()=>{
  const {html,runtime}=await professorRuntime();
  const normalHtml=await (await normal()).text();
  assert.match(html,/id="chatSendAfter"[^>]*type="button" disabled[^>]*>Envoyer quand terminé<\/button>/);
  assert.doesNotMatch(normalHtml,/id="chatSendAfter"/);
  assert.doesNotThrow(()=>new Function(runtime),'generated browser script must parse');
  assert.match(runtime,/qs\('#chatSendAfter'\)\.addEventListener\('click',\(\)=>\{void sendChat\(null,'text',null,true\)\}\)/);
  assert.match(runtime,/qs\('#chatInput'\)\.addEventListener\('input',chatQueueStatus\)/);
  assert.match(runtime,/after\.disabled=!Boolean\(/,'enabled when nonempty draft exists');
  assert.match(runtime,/const staged=queuedFiles===null\?pendingChatFiles\.splice\(0\):queuedFiles/,'queued media must be sent with their original turn');
  assert.match(runtime,/if\(overrideText===null\)input\.value=''/,'queued dispatch must preserve a new draft');
  assert.match(runtime,/void followDevelopmentMelJob\(/,'development jobs tracked');
  assert.match(runtime,/void followDurableMelGoal\(/,'durable work tracked');
});

function queueHarness(runtime){
  const start=runtime.indexOf('let chatActiveController=null;');
  const end=runtime.indexOf('async function executeChatTurn(',start);
  assert.ok(start>=0&&end>start,'canonical Professor queue missing');
  const nodes=new Map([
    ['#chatInput',{value:''}],
    ['#chatPendingCount',{textContent:''}],
    ['#chatSendAfter',{disabled:true,title:''}],
    ['#chatStatus',{textContent:''}],
    ['#chatInterrupt',{disabled:false}],
    ['#melCodeContinue',{disabled:false}],
  ]);
  const inflight=[];
  const goalPolls=new Set();
  const devPolls=new Set();
  const files=[];
  const context=vm.createContext({
    AbortController,Promise,
    qs:(selector)=>nodes.get(selector)||null,
    melChatRole:'code',
    melCodeLastRequest:'instruction précédente',
    executeChatTurn:(text,source,controller,role,attached)=>new Promise(resolve=>inflight.push({text,source,role,attached,resolve})),
    pendingChatFiles:files,
    melGoalPolls:goalPolls,
    melDevJobPolls:devPolls,
    renderPendingChatFiles:()=>{},
  });
  vm.runInContext(runtime.slice(start,end)+'\nglobalThis.queueHarness={sendChat,chatQueueStatus,chatFlushQueue,chatWorkActive,chatPendingTurns};',context);
  return {queue:context.queueHarness,nodes,inflight,goalPolls,devPolls,files};
}

test('queued message waits for the live reply AND its durable job, then preserves FIFO and attachments',async ()=>{
  const {runtime}=await professorRuntime();
  const {queue,nodes,inflight,goalPolls,files}=queueHarness(runtime);
  const first=queue.sendChat('premier','text','code');
  assert.equal(inflight.length,1);
  goalPolls.add('mel-goal-012345678901234567890123456789ab');

  nodes.get('#chatInput').value='message à envoyer après';
  const attachment={name:'photo.png'};
  files.push(attachment);
  queue.chatQueueStatus();
  assert.equal(nodes.get('#chatSendAfter').disabled,false,'not disabled while composing');
  await queue.sendChat(null,'text',null,true);
  assert.equal(inflight.length,1,'no second concurrent send');
  assert.equal(nodes.get('#chatInput').value,'','queued message captured');
  assert.equal(files.length,0,'queued attachment captured');
  assert.equal(queue.chatPendingTurns.length,1);
  assert.match(nodes.get('#chatPendingCount').textContent,/1 message/);

  inflight[0].resolve('réponse reçue');
  await first;
  await Promise.resolve();
  assert.equal(inflight.length,1,'queue must wait for durable work, not only HTTP response');

  nodes.get('#chatInput').value='nouveau brouillon conservé';
  const draftMedia={name:'autre.png'};
  files.push(draftMedia);
  goalPolls.clear();
  queue.chatFlushQueue();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(inflight.length,2,'queued turn sent after the tracked job finished');
  assert.equal(inflight[1].text,'message à envoyer après');
  assert.equal(inflight[1].role,'code');
  assert.equal(inflight[1].attached[0],attachment,'attachment belongs to queued turn');
  assert.equal(files[0],draftMedia,'new unsent draft file must stay in composer');
  assert.equal(nodes.get('#chatInput').value,'nouveau brouillon conservé');
  assert.equal(queue.chatPendingTurns.length,0);
  inflight[1].resolve('ok');
  await Promise.resolve();
  await Promise.resolve();
});

test('button works when no reply is active; dev jobs also hold deferred messages',async ()=>{
  const {runtime}=await professorRuntime();
  const {queue,nodes,inflight,devPolls}=queueHarness(runtime);
  nodes.get('#chatInput').value='envoyer sans tâche';
  queue.chatQueueStatus();
  assert.equal(nodes.get('#chatSendAfter').disabled,false,'button must not require an active HTTP controller');
  const immediate=queue.sendChat(null,'text',null,true);
  assert.equal(inflight.length,1,'idle button sends immediately, not into an infinite queue');
  inflight[0].resolve('ok');await immediate;
  devPolls.add('owner-chat-123');
  nodes.get('#chatInput').value='message post-développement';
  await queue.sendChat(null,'text',null,true);
  assert.equal(inflight.length,1,'development task blocks deferred message');
  assert.equal(queue.chatPendingTurns.length,1);
  devPolls.clear();queue.chatFlushQueue();await Promise.resolve();
  assert.equal(inflight.length,2);
  inflight[1].resolve('ok');await Promise.resolve();await Promise.resolve();
});
