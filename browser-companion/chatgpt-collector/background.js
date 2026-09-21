const api = globalThis.browser;
const DEFAULT={running:false,paused:true,tabId:null,collectorOwnedTab:false,queue:[],done:{},partial:{},failed:{},unavailable:{},deferred:{},discovered:0,deepDiscoveryDone:false,deepDiscoveryAt:null,importedConversations:0,importedMessages:0,duplicates:0,enrichedDuplicates:0,attachmentBackfillTarget:null,attachmentBackfillVersion:null,attachmentBackfillPending:{},attachmentBackfillQueued:0,attachmentBackfillMissingUrl:0,attachmentBackfillStartedAt:null,attachmentBackfillCompletedAt:null,lastError:null,currentUrl:null,currentStage:null,currentStartedAt:null,lastProgressAt:null,lastHeartbeatAt:null,currentMessageCount:0,captureProcessed:0,stalledCount:0,autoRecoveries:0,lastRecoveryAt:null,lastRecoveryReason:null,updatedAt:null};
const WATCHDOG_IDLE_MS=30*1000;
const NETWORK_TIMEOUT_MS=30*1000;
const MESSAGE_TIMEOUT_MS=15000;
const PROBE_TIMEOUT_MS=7000;
const DOM_STABLE_MAX_MS=25*1000;
const RECOVERY_BLANK_MS=1500;
const ECO_HEAVY_MESSAGES=250;
const ECO_BLANK_EVERY=5;
const STOP_WAIT_MS=3000;
const RUNNER_ALARM='mel-runner-tick';
const RUNNER_STABLE_MS=15*1000;
const RUNNER_GLOBAL_GAP_MS=60*1000;
const RUNNER_PER_TAB_COOLDOWN_MS=90*1000;
const RUNNER_ERROR_BACKOFF_MS=10*60*1000;
const RUNNER_DEFAULT={enabled:true,paused:false,targets:{},nextGlobalSendAt:0,lastSendAt:null,lastSendTabId:null,lastError:null,blockedReason:null,updatedAt:null};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let processPromise=null;
let processGeneration=0;
let activeAbortController=null;
let activeCapturePulse=null;
let processedSinceBlank=0;
let runnerTickPromise=null;
let runnerTickTimer=null;

function codedError(code){return Object.assign(new Error(code),{code})}
async function withTimeout(task,timeoutMs,code,onTimeout){
  let timer;
  try{
    return await Promise.race([
      Promise.resolve(task),
      new Promise((_,reject)=>{
        timer=setTimeout(()=>{
          try{onTimeout?.()}catch{}
          reject(codedError(code));
        },timeoutMs);
      })
    ]);
  }finally{clearTimeout(timer)}
}
function isCurrentRun(generation){return generation===processGeneration}

function norm(value){
  try{
    const u=new URL(String(value||''));
    if(!['chatgpt.com','chat.openai.com'].includes(u.hostname)) return '';
    if(!/(?:^|\/)c\/[^/?#]+/i.test(u.pathname)) return '';
    u.search='';u.hash='';return u.toString();
  }catch{return ''}
}
function idFromUrl(value){const u=norm(value);return u?decodeURIComponent(new URL(u).pathname.match(/(?:^|\/)c\/([^/?#]+)/i)?.[1]||''):''}
async function state(){const x=await api.storage.local.get('melCollectorState');return {...DEFAULT,...(x.melCollectorState||{})}}
async function save(p){const n={...(await state()),...p,updatedAt:Date.now()};await api.storage.local.set({melCollectorState:n});return n}
async function runnerState(){const x=await api.storage.local.get('melRunnerState');return {...RUNNER_DEFAULT,...(x.melRunnerState||{}),targets:{...((x.melRunnerState||{}).targets||{})}}}
async function saveRunner(p){const n={...(await runnerState()),...p,updatedAt:Date.now()};await api.storage.local.set({melRunnerState:n});return n}
async function config(){const x=await api.storage.local.get('melCollectorConfig'),c=x.melCollectorConfig||{};return{endpoint:String(c.endpoint||'https://meliturgos.adrien-lopezcarreras.workers.dev').replace(/\/$/,''),username:String(c.username||''),password:String(c.password||''),continuous:c.continuous!==false,ecoMode:c.ecoMode!==false,delayMs:Math.max(8000,Math.min(60000,Number(c.delayMs)||30000))}}
function auth(u,p){return 'Basic '+btoa(unescape(encodeURIComponent(`${u}:${p}`)))}
const COLLECTOR_VERSION='0.6.3';
const ATTACHMENT_BACKFILL_VERSION='chatgpt-attachments-v1';
function coverageItemsFromState(s){
  const byId=new Map();
  const add=(id,status,messages=0)=>{id=String(id||'').trim();if(!id)return;byId.set(id,{id,status,messages:Math.max(0,Number(messages)||0)})};
  for(const [id,row] of Object.entries(s.done||{}))add(id,'DONE',row?.messages);
  for(const [id,row] of Object.entries(s.partial||{}))if(!byId.has(id))add(id,'PARTIAL',row?.messages);
  for(const [id] of Object.entries(s.unavailable||{}))if(!byId.has(id))add(id,'UNAVAILABLE',0);
  for(const [id] of Object.entries(s.deferred||{}))if(!byId.has(id))add(id,'DEFERRED',0);
  for(const [id] of Object.entries(s.failed||{}))if(!byId.has(id))add(id,'FAILED',0);
  for(const url of s.queue||[]){const id=idFromUrl(url);if(id&&!byId.has(id))add(id,'QUEUED',0)}
  return [...byId.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
async function sendCoverageManifest(snapshot=null){
  const s=snapshot||await state(),c=await config();
  if(!c.username||!c.password)return{ok:false,skipped:'MEL_CREDENTIALS_REQUIRED'};
  const items=coverageItemsFromState(s);
  const coverage={collector_version:COLLECTOR_VERSION,deep_discovery_done:s.deepDiscoveryDone===true,discovered_count:Math.max(Number(s.discovered||0),items.length),captured_at:Date.now(),items};
  try{
    const r=await fetch(c.endpoint+'/api/gen2/import/chatgpt-coverage',{method:'POST',headers:{'content-type':'application/json','authorization':auth(c.username,c.password)},body:JSON.stringify({coverage})});
    const t=await r.text();let body={};try{body=t?JSON.parse(t):{}}catch{}
    if(!r.ok)throw codedError(body.code||`MEL_COVERAGE_HTTP_${r.status}`);
    return body;
  }catch(e){return{ok:false,error:e?.code||e?.message||'MEL_COVERAGE_FAILED'}}
}

async function ensureAttachmentBackfillQueue(snapshot=null){
  const s=snapshot||await state();
  if(s.deepDiscoveryDone!==true||s.attachmentBackfillVersion===ATTACHMENT_BACKFILL_VERSION)return s;
  const queue=[...(s.queue||[])];
  let pending={...(s.attachmentBackfillPending||{})};
  let missingUrl=Number(s.attachmentBackfillMissingUrl||0);
  const initializing=s.attachmentBackfillTarget!==ATTACHMENT_BACKFILL_VERSION;
  if(initializing){
    pending={};missingUrl=0;
    for(const [id,row] of Object.entries(s.done||{})){
      const url=norm(row?.url);
      if(!url){missingUrl++;continue}
      pending[id]=url;
      if(!queue.includes(url))queue.push(url);
    }
    const completed=Object.keys(pending).length===0&&missingUrl===0;
    return save({
      queue,
      attachmentBackfillTarget:ATTACHMENT_BACKFILL_VERSION,
      attachmentBackfillVersion:completed?ATTACHMENT_BACKFILL_VERSION:null,
      attachmentBackfillPending:pending,
      attachmentBackfillQueued:Object.keys(pending).length,
      attachmentBackfillMissingUrl:missingUrl,
      attachmentBackfillStartedAt:Date.now(),
      attachmentBackfillCompletedAt:completed?Date.now():null
    });
  }
  const failed=s.failed||{},deferred=s.deferred||{},unavailable=s.unavailable||{};
  for(const [id,urlRaw] of Object.entries(pending)){
    const url=norm(urlRaw);
    if(!url)continue;
    if(failed[id]||deferred[id]||unavailable[id])continue;
    if(!queue.includes(url))queue.push(url);
  }
  const completed=Object.keys(pending).length===0&&missingUrl===0;
  return save({
    queue,
    attachmentBackfillVersion:completed?ATTACHMENT_BACKFILL_VERSION:s.attachmentBackfillVersion,
    attachmentBackfillCompletedAt:completed?(s.attachmentBackfillCompletedAt||Date.now()):s.attachmentBackfillCompletedAt
  });
}

async function sendConversation(conversation,trackActive=false){
  const c=await config();
  if(!c.username||!c.password) throw Object.assign(new Error('MEL_CREDENTIALS_REQUIRED'),{code:'MEL_CREDENTIALS_REQUIRED'});
  const controller=new AbortController();
  if(trackActive)activeAbortController=controller;
  const request=(async()=>{
    const r=await fetch(c.endpoint+'/api/gen2/import/chatgpt-archive',{
      method:'POST',
      headers:{'content-type':'application/json','authorization':auth(c.username,c.password)},
      body:JSON.stringify({archive:[conversation],preview:false}),
      signal:controller.signal
    });
    const t=await r.text();let b={};try{b=t?JSON.parse(t):{}}catch{}
    if(!r.ok&&r.status!==207) throw Object.assign(new Error(b.code||b.error||`MEL_HTTP_${r.status}`),{code:b.code||`MEL_HTTP_${r.status}`});
    return b;
  })();
  try{
    return await withTimeout(request,NETWORK_TIMEOUT_MS,'MEL_IMPORT_TIMEOUT',()=>controller.abort());
  }catch(e){
    if(e?.name==='AbortError')throw codedError('MEL_IMPORT_ABORTED');
    throw e;
  }finally{
    if(trackActive&&activeAbortController===controller)activeAbortController=null;
  }
}

async function historyUrls(){
  const out=[];
  for(const text of ['chatgpt.com','chat.openai.com']){
    try{
      const rows=await api.history.search({text,startTime:0,maxResults:10000});
      rows.forEach(row=>{const u=norm(row.url);if(u)out.push(u)});
    }catch{}
  }
  return [...new Set(out)];
}

async function tabMessage(tabId,payload,attempts=8,timeoutMs=MESSAGE_TIMEOUT_MS){
  let err;
  for(let i=0;i<attempts;i++){
    try{return await withTimeout(api.tabs.sendMessage(tabId,payload),timeoutMs,'CONTENT_SCRIPT_TIMEOUT')}
    catch(e){err=e;if(i+1<attempts)await wait(500+i*250)}
  }
  throw err||new Error('CONTENT_SCRIPT_UNAVAILABLE');
}
function isChatGptTabUrl(value){
  try{
    const u=new URL(String(value||''));
    return ['chatgpt.com','chat.openai.com'].includes(u.hostname);
  }catch{return false}
}
async function ensureRunnerContent(tabId){
  try{
    const probe=await tabMessage(tabId,{type:'mel.runner.probe'},1,1500);
    if(probe?.ok)return probe;
  }catch{}
  const tab=await api.tabs.get(tabId).catch(()=>null);
  if(!tab?.id||!isChatGptTabUrl(tab.url))throw codedError('CHATGPT_TAB_REQUIRED');
  if(!api.scripting?.executeScript)throw codedError('SCRIPTING_API_UNAVAILABLE');
  try{
    await api.scripting.executeScript({target:{tabId},files:['content.js']});
  }catch(e){
    const message=String(e?.message||'');
    if(!/already|duplicate|injected/i.test(message))throw codedError('CONTENT_SCRIPT_INJECTION_FAILED');
  }
  await wait(350);
  return tabMessage(tabId,{type:'mel.runner.probe'},2,PROBE_TIMEOUT_MS);
}
async function pageUrls(tabId,deep=false){
  try{
    const r=await tabMessage(tabId,{type:'mel.collector.discover',deep},2);
    return{ok:r?.ok===true,urls:Array.isArray(r?.urls)?r.urls.map(norm).filter(Boolean):[]};
  }catch{return{ok:false,urls:[]}}
}
async function ensureDiscoveryPage(tabId){
  try{
    const tab=await api.tabs.get(tabId);
    if(/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(tab?.url||''))return true;
  }catch{}
  await withTimeout(api.tabs.update(tabId,{url:'https://chatgpt.com/'}),30000,'DISCOVERY_NAVIGATION_TIMEOUT');
  await waitComplete(tabId,30000);
  await wait(2500);
  return true;
}
async function mergeDiscovery(tabId,deep=false){
  if(deep)await ensureDiscoveryPage(tabId);
  const [a,page]=await Promise.all([historyUrls(),pageUrls(tabId,deep)]);
  const b=page.urls;
  const s=await state(),done=s.done||{},partial=s.partial||{},failed=s.failed||{},unavailable=s.unavailable||{},deferred=s.deferred||{},queued=new Set(s.queue||[]);
  const add=[...new Set([...a,...b])].filter(u=>{
    const id=idFromUrl(u);
    const attempts=Number(failed[id]?.attempts||0);
    const completedMessages=Number(done[id]?.messages||0);
    const partialMessages=Number(partial[id]?.messages||0);
    const needsFullCapture=!done[id]||partialMessages>completedMessages;
    return id && needsFullCapture && !unavailable[id] && !deferred[id] && attempts<3 && !queued.has(u);
  });
  const queue=[...(s.queue||[]),...add];
  const next=await save({queue,discovered:new Set([...queue,...Object.values(done).map(x=>x.url).filter(Boolean),...Object.values(partial).map(x=>x.url).filter(Boolean),...Object.values(deferred).map(x=>x.url).filter(Boolean),...Object.values(failed).map(x=>x.url).filter(Boolean),...Object.values(unavailable).map(x=>x.url).filter(Boolean)]).size,deepDiscoveryDone:deep&&page.ok?true:s.deepDiscoveryDone,deepDiscoveryAt:deep&&page.ok?Date.now():s.deepDiscoveryAt});
  if(deep&&page.ok)await sendCoverageManifest(next);
  return next;
}

function waitComplete(tabId,timeout=15000){
  return new Promise(resolve=>{
    let done=false;
    const finish=v=>{if(done)return;done=true;clearTimeout(timer);api.tabs.onUpdated.removeListener(listener);resolve(v)};
    const listener=(id,chg)=>{if(id===tabId&&chg.status==='complete')finish(true)};
    const timer=setTimeout(()=>finish(false),timeout);
    api.tabs.onUpdated.addListener(listener);
  });
}
async function waitForExpectedConversation(tabId,sourceId,timeout=8000){
  const started=Date.now();
  while(Date.now()-started<timeout){
    try{
      const tab=await api.tabs.get(tabId);
      if(idFromUrl(tab?.url)===sourceId)return true;
    }catch{}
    await wait(500);
  }
  return false;
}
async function waitForDomStable(tabId,ecoMode=true,generation=null){
  const started=Date.now(),deadline=started+DOM_STABLE_MAX_MS;
  let lastCount=-1,stable=0,lastProbe=null,lastHeartbeatSave=0,probeFailures=0;
  const interval=ecoMode?2500:1200;
  while(Date.now()<deadline){
    if(generation!=null&&!isCurrentRun(generation))throw codedError('COLLECTOR_RUN_CANCELLED');
    try{
      const remaining=Math.max(1000,deadline-Date.now());
      const probe=await tabMessage(tabId,{type:'mel.collector.probe'},1,Math.min(PROBE_TIMEOUT_MS,remaining));
      if(generation!=null&&!isCurrentRun(generation))throw codedError('COLLECTOR_RUN_CANCELLED');
      lastProbe=probe;
      probeFailures=0;
      const now=Date.now();
      const count=Number(probe?.messageCount||0);
      if(count!==lastCount||now-lastHeartbeatSave>=15000){
        lastHeartbeatSave=now;
        await save({lastHeartbeatAt:now,currentMessageCount:count});
      }
      if(probe?.generating){
        stable=0;
      }else if(count>0&&count===lastCount){
        stable++;
      }else{
        stable=0;
      }
      lastCount=count;
      if(!probe?.generating&&stable>=(ecoMode?3:2))return probe;
    }catch(e){
      if(e?.code==='COLLECTOR_RUN_CANCELLED')throw e;
      probeFailures++;
      if(probeFailures>=2)throw codedError('DOM_NOT_STABLE');
    }
    const remaining=deadline-Date.now();
    if(remaining<=0)break;
    await wait(Math.min(interval,remaining));
  }
  throw codedError('DOM_NOT_STABLE');
}

async function captureMessage(tabId){
  const requestId='cap-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const pulse={requestId,lastAt:Date.now(),processed:0,total:0};
  activeCapturePulse=pulse;
  const task=api.tabs.sendMessage(tabId,{type:'mel.collector.capture',requestId});
  let settled=false,value,error;
  task.then(v=>{settled=true;value=v}).catch(()=>{settled=true;error=codedError('CONTENT_SCRIPT_UNAVAILABLE')});
  try{
    while(!settled){
      await wait(5000);
      if(Date.now()-pulse.lastAt>WATCHDOG_IDLE_MS)throw codedError('CAPTURE_NO_PROGRESS_TIMEOUT');
    }
    if(error)throw error;
    return value;
  }finally{
    if(activeCapturePulse===pulse)activeCapturePulse=null;
  }
}

async function captureStable(tabId,maxAttempts=5){
  let last;
  for(let i=0;i<maxAttempts;i++){
    try{last=await captureMessage(tabId)}catch(e){last={ok:false,code:e?.code||e?.message||'CAPTURE_FAILED'}}
    if(last?.ok)return last;
    if(last?.code==='CAPTURE_NO_PROGRESS_TIMEOUT')return last;
    if(!['CONVERSATION_STILL_GENERATING','NO_MESSAGES_FOUND','NOT_A_CONVERSATION','CONTENT_SCRIPT_UNAVAILABLE','CONTENT_SCRIPT_TIMEOUT','DOM_NOT_STABLE'].includes(last?.code))break;
    await wait(2500);
  }
  return last||{ok:false,code:'CAPTURE_FAILED'};
}

async function ecoCooldown(tabId,cfg,messageCount=0){
  if(!cfg.ecoMode){await wait(1500);return}
  processedSinceBlank++;
  const heavy=Number(messageCount||0)>=ECO_HEAVY_MESSAGES;
  const shouldBlank=heavy||processedSinceBlank>=ECO_BLANK_EVERY;
  if(shouldBlank){
    processedSinceBlank=0;
    try{
      await api.tabs.update(tabId,{url:'about:blank'});
      await waitComplete(tabId,15000);
      await wait(1500);
    }catch{}
  }
  let delay=cfg.delayMs;
  if(messageCount>=250)delay=Math.max(delay,45000);
  if(messageCount>=600)delay=Math.max(delay,60000);
  await wait(delay);
}
async function recoverTab(tabId,reason){
  try{
    await api.tabs.update(tabId,{url:'about:blank'});
    await waitComplete(tabId,15000);
    await wait(RECOVERY_BLANK_MS);
  }catch{}
  const s=await state(),now=Date.now();
  return save({
    autoRecoveries:Number(s.autoRecoveries||0)+1,
    lastRecoveryAt:now,
    lastRecoveryReason:String(reason||'UNKNOWN_STALL'),
    lastHeartbeatAt:now,
    lastProgressAt:now
  });
}
async function collectorTab(preferred){
  if(preferred!=null){
    const runner=await runnerState();
    const reserved=Object.values(runner.targets||{}).some(target=>target?.enabled!==false&&Number(target?.tabId)===Number(preferred));
    if(reserved) preferred=null;
    try{
      const t=await api.tabs.get(preferred);
      if(t?.id!=null && t.active!==true && (/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(t.url||'') || t.url==='about:blank')) return {tab:t,owned:true};
    }catch{}
  }
  const created=await api.tabs.create({url:'https://chatgpt.com/',active:false});
  return {tab:created,owned:true};
}

async function process(tabId,generation){
  if(!isCurrentRun(generation))return;
  await save({running:true,paused:false,tabId,lastError:null});
  let initial=await state();
  if(!(initial.queue||[]).length){
    const deep=initial.deepDiscoveryDone!==true;
    await withTimeout(mergeDiscovery(tabId,deep),deep?120000:60000,'DISCOVERY_TIMEOUT');
  }
  while(isCurrentRun(generation)){
    let s=await state();
    if(!s.running||s.paused)return;
    let queue=[...(s.queue||[])];
    if(!queue.length){
      const deep=s.deepDiscoveryDone!==true;
      await withTimeout(mergeDiscovery(tabId,deep),deep?120000:60000,'DISCOVERY_TIMEOUT');
      s=await state();queue=[...(s.queue||[])];
      if(!queue.length&&s.deepDiscoveryDone===true){
        s=await ensureAttachmentBackfillQueue(s);
        queue=[...(s.queue||[])];
      }
      if(!queue.length){const finalState=await save({running:false,paused:false,currentUrl:null,currentStage:null,currentStartedAt:null,currentMessageCount:0,lastProgressAt:Date.now()});await sendCoverageManifest(finalState);return}
    }
    const url=queue.shift(),sourceId=idFromUrl(url);
    const completedMessages=Number(s.done?.[sourceId]?.messages||0);
    const partialMessages=Number(s.partial?.[sourceId]?.messages||0);
    const forcedAttachmentBackfill=Boolean(s.attachmentBackfillPending?.[sourceId]);
    if(!sourceId||(s.done?.[sourceId]&&partialMessages<=completedMessages&&!forcedAttachmentBackfill)){await save({queue});continue}
    let itemMessageCount=0;
    const startedAt=Date.now();
    await save({queue,currentUrl:url,currentStage:'navigation',currentStartedAt:startedAt,lastProgressAt:startedAt,currentMessageCount:0});
    try{
      await withTimeout(api.tabs.update(tabId,{url}),15000,'TAB_UPDATE_TIMEOUT');
      if(!isCurrentRun(generation))return;
      await save({currentStage:'page_load',lastProgressAt:Date.now()});
      await waitComplete(tabId);
      await save({currentStage:'conversation_check',lastProgressAt:Date.now()});
      const reached=await waitForExpectedConversation(tabId,sourceId,8000);
      if(!reached)throw Object.assign(new Error('CONVERSATION_REDIRECTED_OR_UNAVAILABLE'),{code:'CONVERSATION_REDIRECTED_OR_UNAVAILABLE'});
      const cfg=await config();
      await save({currentStage:'settling',lastProgressAt:Date.now()});
      await wait(cfg.ecoMode?1800:900);
      await save({currentStage:'dom_stabilize',lastProgressAt:Date.now()});
      const probe=await waitForDomStable(tabId,cfg.ecoMode,generation);
      itemMessageCount=Number(probe?.messageCount||0);
      await save({currentStage:'capture',lastProgressAt:Date.now(),currentMessageCount:itemMessageCount,captureProcessed:0});
      const cap=await captureStable(tabId,cfg.ecoMode?1:2);
      if(!cap?.ok||!cap.conversation) throw Object.assign(new Error(cap?.code||'CAPTURE_FAILED'),{code:cap?.code||'CAPTURE_FAILED'});
      if(String(cap.conversation.id||'')!==sourceId) throw codedError('CAPTURE_ID_MISMATCH');
      const messageCount=Number(cap.conversation.messages?.length||0);
      itemMessageCount=Math.max(itemMessageCount,messageCount);
      await save({currentStage:'import',lastProgressAt:Date.now(),currentMessageCount:messageCount,captureProcessed:messageCount});
      const result=await withTimeout(sendConversation(cap.conversation,true),WATCHDOG_IDLE_MS,'CONVERSATION_NO_PROGRESS_TIMEOUT',()=>{try{activeAbortController?.abort()}catch{}});
      if(!isCurrentRun(generation))return;
      s=await state();
      if(!s.running||s.paused)return;
      const done={...(s.done||{})};
      done[sourceId]={url,title:cap.conversation.title,messages:messageCount,importedAt:Date.now()};
      const failed={...(s.failed||{})};delete failed[sourceId];
      const unavailable={...(s.unavailable||{})};delete unavailable[sourceId];
      const deferred={...(s.deferred||{})};delete deferred[sourceId];
      const partial={...(s.partial||{})};delete partial[sourceId];
      const attachmentBackfillPending={...(s.attachmentBackfillPending||{})};
      const wasAttachmentBackfill=Boolean(attachmentBackfillPending[sourceId]);
      if(wasAttachmentBackfill)delete attachmentBackfillPending[sourceId];
      const attachmentBackfillComplete=wasAttachmentBackfill
        && Object.keys(attachmentBackfillPending).length===0
        && Number(s.attachmentBackfillMissingUrl||0)===0;
      const saved=await save({
        done,partial,failed,unavailable,deferred,
        attachmentBackfillPending,
        attachmentBackfillVersion:attachmentBackfillComplete?ATTACHMENT_BACKFILL_VERSION:s.attachmentBackfillVersion,
        attachmentBackfillCompletedAt:attachmentBackfillComplete?Date.now():s.attachmentBackfillCompletedAt,
        importedConversations:Object.keys(done).length,
        importedMessages:Number(s.importedMessages||0)+Number(result.inserted||0),
        duplicates:Number(s.duplicates||0)+Number(result.duplicates||0),
        enrichedDuplicates:Number(s.enrichedDuplicates||0)+Number(result.enriched_duplicates||0),
        lastError:null,currentUrl:null,currentStage:null,currentStartedAt:null,currentMessageCount:0,captureProcessed:0,lastProgressAt:Date.now()
      });
      await sendCoverageManifest(saved);
    }catch(e){
      s=await state();
      if(!isCurrentRun(generation)||s.paused||!s.running)return;
      const failed={...(s.failed||{})};
      const key=sourceId||url;
      const code=e?.code||e?.message||'UNKNOWN_ERROR';
      const attempts=Number(failed[key]?.attempts||0)+1;
      failed[key]={url,code,attempts,failedAt:Date.now()};
      const unavailable={...(s.unavailable||{})};
      const deferred={...(s.deferred||{})};
      const transient=['CONVERSATION_STILL_GENERATING','NO_MESSAGES_FOUND','NOT_A_CONVERSATION','CONTENT_SCRIPT_UNAVAILABLE','CONTENT_SCRIPT_TIMEOUT','TAB_UPDATE_TIMEOUT','MEL_IMPORT_TIMEOUT','MEL_IMPORT_ABORTED','CONVERSATION_NO_PROGRESS_TIMEOUT','CAPTURE_NO_PROGRESS_TIMEOUT','DOM_NOT_STABLE'].includes(code);
      const autoRecoverable=['CONTENT_SCRIPT_UNAVAILABLE','CONTENT_SCRIPT_TIMEOUT','TAB_UPDATE_TIMEOUT','CAPTURE_NO_PROGRESS_TIMEOUT','DOM_NOT_STABLE'].includes(code);
      const timedOut=['MEL_IMPORT_TIMEOUT','MEL_IMPORT_ABORTED','CONVERSATION_NO_PROGRESS_TIMEOUT'].includes(code);
      const maxAttempts=code==='CONVERSATION_REDIRECTED_OR_UNAVAILABLE'?2:(transient?2:3);
      const nextQueue=[...(s.queue||[])];
      if(attempts<maxAttempts){
        if(!nextQueue.includes(url))nextQueue.push(url);
      }else if(code==='CONVERSATION_REDIRECTED_OR_UNAVAILABLE'){
        unavailable[key]={url,code,attempts,classifiedAt:Date.now()};
      }else if(transient){
        deferred[key]={url,code,attempts,deferredAt:Date.now()};
      }
      const stalledCount=Number(s.stalledCount||0)+((autoRecoverable||timedOut)?1:0);
      const failedState=await save({failed,unavailable,deferred,queue:nextQueue,lastError:code,currentUrl:null,currentStage:null,currentStartedAt:null,currentMessageCount:0,captureProcessed:0,lastProgressAt:Date.now(),stalledCount});
      await sendCoverageManifest(failedState);
      if(autoRecoverable){
        await recoverTab(tabId,code);
        continue;
      }
    }
    const cooldownCfg=await config();
    await ecoCooldown(tabId,cooldownCfg,itemMessageCount);
  }
}

async function start(){
  let s=await state();
  if(processPromise){
    if(s.paused||!s.running){
      processGeneration++;
      try{activeAbortController?.abort()}catch{}
      await Promise.race([processPromise.catch(()=>{}),wait(STOP_WAIT_MS)]);
      s=await state();
    }else{
      return save({running:true,paused:false,lastError:null});
    }
  }
  if(processPromise)return save({running:false,paused:true,lastError:'PREVIOUS_RUN_STILL_STOPPING',currentUrl:null,currentStage:null,currentStartedAt:null,currentMessageCount:0});
  const resolved=await collectorTab(s.tabId);
  const tab=resolved?.tab;
  if(!tab?.id) throw Object.assign(new Error('COLLECTOR_TAB_CREATE_FAILED'),{code:'COLLECTOR_TAB_CREATE_FAILED'});
  const generation=++processGeneration;
  processPromise=process(tab.id,generation)
    .catch(async e=>{
      const current=await state();
      if(generation!==processGeneration||current.paused)return current;
      return save({running:false,lastError:e?.code||e?.message||'COLLECTOR_FAILED',currentUrl:null,currentStage:null,currentStartedAt:null,currentMessageCount:0});
    })
    .finally(()=>{if(generation===processGeneration)activeAbortController=null;processPromise=null});
  return save({running:true,paused:false,tabId:tab.id,collectorOwnedTab:true,lastError:null});
}

async function retryDeferred(){
  const s=await state();
  const queue=[...(s.queue||[])];
  const deferred={...(s.deferred||{})};
  const failed={...(s.failed||{})};
  let added=0;
  const unresolved={...failed,...deferred};
  for(const [key,item] of Object.entries(unresolved)){
    const url=norm(item?.url);
    const isAttachmentBackfill=Boolean(s.attachmentBackfillPending?.[key]);
    if(!url||(s.done?.[key]&&!isAttachmentBackfill)||s.unavailable?.[key])continue;
    if(!queue.includes(url)){queue.push(url);added++}
    delete deferred[key];
    delete failed[key];
  }
  return save({queue,deferred,failed,lastError:null,retryDeferredAdded:added});
}


async function ensureRunnerAlarm(){
  if(!api.alarms?.create)return;
  try{await api.alarms.create(RUNNER_ALARM,{periodInMinutes:1})}catch{}
}
function scheduleRunnerTick(delayMs=1500){
  if(runnerTickTimer)return;
  runnerTickTimer=setTimeout(()=>{
    runnerTickTimer=null;
    runnerTick().catch(()=>{});
  },Math.max(500,Number(delayMs)||1500));
}
async function resolveRunnerTab(target,sourceId){
  if(target?.tabId==null)return null;
  try{
    const tab=await api.tabs.get(Number(target.tabId));
    if(idFromUrl(tab?.url)===sourceId)return tab;
  }catch{}
  return null;
}
function isHardRunnerBlock(code){
  return ['USAGE_LIMIT','RATE_LIMIT'].includes(String(code||''));
}
async function pauseRunnerForLimit(code,tabId=null){
  const now=Date.now();
  const s=await runnerState();
  return saveRunner({
    paused:true,
    lastError:String(code||'RUNNER_LIMIT'),
    blockedReason:{code:String(code||'RUNNER_LIMIT'),tabId,at:now},
    nextGlobalSendAt:0
  });
}
async function runnerTick(){
  if(runnerTickPromise)return runnerTickPromise;
  runnerTickPromise=(async()=>{
    let rs=await runnerState();
    if(!rs.enabled||rs.paused)return rs;
    const now=Date.now();
    if(Number(rs.nextGlobalSendAt||0)>now)return rs;

    const collector=await state();
    const collectorTabId=collector.collectorOwnedTab?Number(collector.tabId):null;
    const targets={...(rs.targets||{})};
    const entries=Object.entries(targets)
      .filter(([,target])=>target?.enabled!==false)
      .sort((a,b)=>Number(a[1]?.lastSentAt||0)-Number(b[1]?.lastSentAt||0));

    for(const [sourceId,existing] of entries){
      const target={...existing};
      if(Number(target.nextEligibleAt||0)>Date.now())continue;
      const tab=await resolveRunnerTab(target,sourceId);
      if(!tab?.id){
        delete targets[sourceId];
        continue;
      }
      if(collectorTabId!=null&&Number(tab.id)===collectorTabId)continue;

      let probe;
      try{probe=await ensureRunnerContent(tab.id)}
      catch{
        targets[sourceId]={...target,tabId:tab.id,status:'unreachable',lastSeenAt:Date.now(),nextEligibleAt:Date.now()+RUNNER_ERROR_BACKOFF_MS};
        continue;
      }

      const block=String(probe?.blocked||'');
      if(block){
        targets[sourceId]={...target,tabId:tab.id,status:'blocked',lastSeenAt:Date.now(),lastError:block};
        await saveRunner({targets});
        if(isHardRunnerBlock(block))return pauseRunnerForLimit(block,tab.id);
        targets[sourceId].nextEligibleAt=Date.now()+RUNNER_ERROR_BACKOFF_MS;
        continue;
      }

      targets[sourceId]={
        ...target,
        tabId:tab.id,
        url:norm(tab.url)||target.url||null,
        status:probe?.generating?'working':'idle',
        lastSeenAt:Date.now(),
        lastSignature:String(probe?.assistantSignature||target.lastSignature||'')
      };

      const signature=String(probe?.assistantSignature||'');
      const ready=
        !probe?.generating &&
        probe?.composerReady===true &&
        probe?.composerEmpty===true &&
        Number(probe?.stableForMs||0)>=RUNNER_STABLE_MS &&
        !!signature &&
        signature!==String(target.lastSentSignature||'');

      if(!ready)continue;
      if(Number((await runnerState()).nextGlobalSendAt||0)>Date.now())break;

      const command=String(target.command||'').trim();
      if(!['cycle','go'].includes(command)){
        targets[sourceId]={...targets[sourceId],enabled:false,status:'invalid_command',lastError:'INVALID_RUNNER_COMMAND'};
        continue;
      }

      const result=await tabMessage(tab.id,{type:'mel.runner.send',command},1,PROBE_TIMEOUT_MS);
      if(!result?.ok){
        const code=String(result?.code||'RUNNER_SEND_FAILED');
        targets[sourceId]={...targets[sourceId],status:'send_error',lastError:code,nextEligibleAt:Date.now()+RUNNER_ERROR_BACKOFF_MS};
        await saveRunner({targets,lastError:code});
        if(isHardRunnerBlock(code))return pauseRunnerForLimit(code,tab.id);
        continue;
      }

      const sentAt=Date.now();
      targets[sourceId]={
        ...targets[sourceId],
        status:'sent',
        lastSentSignature:signature,
        lastSentAt:sentAt,
        nextEligibleAt:sentAt+RUNNER_PER_TAB_COOLDOWN_MS,
        cycles:Number(target.cycles||0)+1,
        lastError:null
      };
      rs=await saveRunner({
        targets,
        nextGlobalSendAt:sentAt+RUNNER_GLOBAL_GAP_MS,
        lastSendAt:sentAt,
        lastSendTabId:tab.id,
        lastError:null,
        blockedReason:null
      });
      return rs;
    }
    return saveRunner({targets});
  })().finally(()=>{runnerTickPromise=null});
  return runnerTickPromise;
}
async function markCurrentRunner(command){
  const clean=String(command||'').trim().toLowerCase();
  if(!['cycle','go'].includes(clean))throw codedError('INVALID_RUNNER_COMMAND');
  const [tab]=await api.tabs.query({active:true,currentWindow:true});
  if(!tab?.id)throw codedError('ACTIVE_TAB_REQUIRED');
  const url=norm(tab.url),sourceId=idFromUrl(url);
  if(!sourceId)throw codedError('CHATGPT_CONVERSATION_REQUIRED');
  const collector=await state();
  if(collector.collectorOwnedTab&&Number(collector.tabId)===Number(tab.id))throw codedError('COLLECTOR_TAB_RESERVED');
  const probe=await ensureRunnerContent(tab.id);
  if(!probe?.ok)throw codedError('RUNNER_PROBE_FAILED');
  let rs=await runnerState();
  const targets={...(rs.targets||{})};
  targets[sourceId]={
    ...(targets[sourceId]||{}),
    conversationId:sourceId,
    tabId:tab.id,
    url,
    title:String(tab.title||'ChatGPT').slice(0,300),
    command:clean,
    enabled:true,
    status:probe.generating?'working':'armed',
    lastSignature:String(probe.assistantSignature||''),
    lastSentSignature:'',
    lastSeenAt:Date.now(),
    nextEligibleAt:0,
    cycles:Number(targets[sourceId]?.cycles||0),
    lastError:null
  };
  rs=await saveRunner({enabled:true,paused:false,targets,lastError:null,blockedReason:null});
  await tabMessage(tab.id,{type:'mel.runner.watch',enabled:true},1,PROBE_TIMEOUT_MS).catch(()=>{});
  await ensureRunnerAlarm();
  scheduleRunnerTick(1200);
  return rs;
}
async function unmarkCurrentRunner(){
  const [tab]=await api.tabs.query({active:true,currentWindow:true});
  if(!tab?.id)throw codedError('ACTIVE_TAB_REQUIRED');
  const sourceId=idFromUrl(tab.url);
  if(!sourceId)throw codedError('CHATGPT_CONVERSATION_REQUIRED');
  const rs=await runnerState(),targets={...(rs.targets||{})};
  delete targets[sourceId];
  await tabMessage(tab.id,{type:'mel.runner.watch',enabled:false},1,PROBE_TIMEOUT_MS).catch(()=>{});
  return saveRunner({targets});
}
async function resumeRunner(){
  const rs=await saveRunner({enabled:true,paused:false,lastError:null,blockedReason:null,nextGlobalSendAt:Math.max(Date.now()+RUNNER_GLOBAL_GAP_MS,Number((await runnerState()).nextGlobalSendAt||0))});
  await ensureRunnerAlarm();
  scheduleRunnerTick(RUNNER_GLOBAL_GAP_MS);
  return rs;
}

api.runtime.onMessage.addListener(async (msg,sender)=>{
  if(msg?.type==='mel.collector.status')return state();
  if(msg?.type==='mel.runner.status')return runnerState();
  if(msg?.type==='mel.runner.mark-current')return markCurrentRunner(msg.command);
  if(msg?.type==='mel.runner.unmark-current')return unmarkCurrentRunner();
  if(msg?.type==='mel.runner.pause')return saveRunner({paused:true});
  if(msg?.type==='mel.runner.resume')return resumeRunner();
  if(msg?.type==='mel.runner.bootstrap'){
    const tabId=sender?.tab?.id;
    const sourceId=idFromUrl(sender?.tab?.url||'');
    const rs=await runnerState();
    const target=sourceId?rs.targets?.[sourceId]:null;
    if(target&&tabId!=null&&Number(target.tabId)!==Number(tabId)){
      const targets={...(rs.targets||{}),[sourceId]:{...target,tabId,lastSeenAt:Date.now()}};
      await saveRunner({targets});
    }
    return{ok:true,enabled:!!(target?.enabled!==false&&target)};
  }
  if(msg?.type==='mel.runner.page-state'){
    const tabId=sender?.tab?.id;
    const sourceId=String(msg.state?.conversationId||idFromUrl(sender?.tab?.url||''));
    if(!sourceId||tabId==null)return{ok:false,skipped:'RUNNER_TARGET_UNKNOWN'};
    let rs=await runnerState();
    const target=rs.targets?.[sourceId];
    if(!target?.enabled)return{ok:false,skipped:'RUNNER_NOT_ARMED'};
    const block=String(msg.state?.blocked||'');
    const targets={...(rs.targets||{}),[sourceId]:{
      ...target,
      tabId,
      url:norm(sender?.tab?.url)||target.url||null,
      status:block?'blocked':msg.state?.generating?'working':'idle',
      lastSeenAt:Date.now(),
      lastSignature:String(msg.state?.assistantSignature||target.lastSignature||''),
      lastError:block||null
    }};
    await saveRunner({targets});
    if(isHardRunnerBlock(block)){await pauseRunnerForLimit(block,tabId);return{ok:true,paused:true}}
    scheduleRunnerTick(1200);
    return{ok:true};
  }
  if(msg?.type==='mel.collector.passive-status'){
    const s=await state();
    return{busy:!!(s.running&&!s.paused)};
  }
  if(msg?.type==='mel.collector.capture-progress'&&activeCapturePulse&&msg.requestId===activeCapturePulse.requestId){
    const now=Date.now();
    activeCapturePulse.lastAt=now;
    activeCapturePulse.processed=Number(msg.processed||0);
    activeCapturePulse.total=Number(msg.total||0);
    if(!activeCapturePulse.lastSavedAt||now-activeCapturePulse.lastSavedAt>=5000){
      activeCapturePulse.lastSavedAt=now;
      await save({lastProgressAt:now,currentMessageCount:activeCapturePulse.total,captureProcessed:activeCapturePulse.processed});
    }
    return{ok:true};
  }
  if(msg?.type==='mel.collector.start'||msg?.type==='mel.collector.resume')return start();
  if(msg?.type==='mel.collector.pause'){
    processGeneration++;
    try{activeAbortController?.abort()}catch{}
    const s=await state();
    const queue=[...(s.queue||[])];
    if(s.currentUrl&&!queue.includes(s.currentUrl))queue.unshift(s.currentUrl);
    return save({running:false,paused:true,queue,currentUrl:null,currentStage:null,currentStartedAt:null,currentMessageCount:0,captureProcessed:0,lastProgressAt:Date.now()});
  }
  if(msg?.type==='mel.collector.retry-deferred')return retryDeferred();
  if(msg?.type==='mel.collector.capture-current'){
    const [tab]=await api.tabs.query({active:true,currentWindow:true});
    if(!tab?.id)throw new Error('ACTIVE_TAB_REQUIRED');
    const cap=await captureStable(tab.id);if(!cap?.ok)throw new Error(cap?.code||'CAPTURE_FAILED');
    const result=await sendConversation(cap.conversation),s=await state(),sourceId=cap.conversation.id;
    const done={...(s.done||{}),[sourceId]:{url:norm(tab.url),title:cap.conversation.title,messages:cap.conversation.messages.length,importedAt:Date.now()}};
    const partial={...(s.partial||{})};delete partial[sourceId];
    return save({done,partial,importedConversations:Object.keys(done).length,importedMessages:Number(s.importedMessages||0)+Number(result.inserted||0),duplicates:Number(s.duplicates||0)+Number(result.duplicates||0),enrichedDuplicates:Number(s.enrichedDuplicates||0)+Number(result.enriched_duplicates||0)});
  }
  if(msg?.type==='mel.collector.auto-capture'&&msg.conversation){
    const c=await config();if(!c.continuous)return{ok:false,skipped:'CONTINUOUS_DISABLED'};
    const sourceId=String(msg.conversation.id||''),count=Math.max(Number(msg.conversation.collector?.totalMessages||0),Array.isArray(msg.conversation.messages)?msg.conversation.messages.length:0);
    if(!sourceId)return{ok:false,skipped:'CONVERSATION_ID_REQUIRED'};
    let s=await state();
    if(s.running&&!s.paused)return{ok:false,skipped:'BATCH_RUNNING'};
    const partialCapture=msg.conversation.collector?.partial===true;
    if(s.done?.[sourceId]&&Number(s.done[sourceId].messages||0)>=count)return{ok:true,skipped:'ALREADY_CAPTURED'};
    if(partialCapture&&s.partial?.[sourceId]&&Number(s.partial[sourceId].messages||0)>=count)return{ok:true,skipped:'ALREADY_CAPTURED_PARTIAL'};
    try{
      const result=await sendConversation(msg.conversation);s=await state();
      const done={...(s.done||{})};
      const partial={...(s.partial||{})};
      const record={url:msg.conversation.collector?.url||null,title:msg.conversation.title,messages:count,importedAt:Date.now()};
      if(partialCapture){
        partial[sourceId]=record;
      }else{
        done[sourceId]=record;
        delete partial[sourceId];
      }
      await save({done,partial,importedConversations:Object.keys(done).length,importedMessages:Number(s.importedMessages||0)+Number(result.inserted||0),duplicates:Number(s.duplicates||0)+Number(result.duplicates||0),enrichedDuplicates:Number(s.enrichedDuplicates||0)+Number(result.enriched_duplicates||0)});
      return{ok:true,partial:partialCapture};
    }catch(e){await save({lastError:e?.code||e?.message||'AUTO_CAPTURE_FAILED'});return{ok:false,code:e?.code||e?.message||'AUTO_CAPTURE_FAILED'}}
  }
});

async function pruneClosedRunnerTabs(){
  const rs=await runnerState(),targets={...(rs.targets||{})};
  for(const [sourceId,target] of Object.entries(targets)){
    if(target?.tabId==null){delete targets[sourceId];continue}
    try{
      const tab=await api.tabs.get(Number(target.tabId));
      if(idFromUrl(tab?.url)!==sourceId)delete targets[sourceId];
    }catch{delete targets[sourceId]}
  }
  return saveRunner({targets});
}
api.tabs.onRemoved.addListener(async tabId=>{
  const rs=await runnerState(),targets={...(rs.targets||{})};
  let changed=false;
  for(const [sourceId,target] of Object.entries(targets)){
    if(Number(target?.tabId)===Number(tabId)){delete targets[sourceId];changed=true}
  }
  if(changed)await saveRunner({targets});
});
api.tabs.onUpdated.addListener(async (tabId,changeInfo,tab)=>{
  if(!changeInfo.url)return;
  const rs=await runnerState(),targets={...(rs.targets||{})};
  let changed=false;
  for(const [sourceId,target] of Object.entries(targets)){
    if(Number(target?.tabId)!==Number(tabId))continue;
    if(idFromUrl(tab?.url)!==sourceId){delete targets[sourceId];changed=true}
  }
  if(changed)await saveRunner({targets});
});
api.runtime.onStartup.addListener(async()=>{
  const s=await state();
  if(s.running&&!s.paused)start().catch(()=>{});
  await pruneClosedRunnerTabs();
  await ensureRunnerAlarm();
  scheduleRunnerTick(3000);
});
if(api.runtime.onInstalled?.addListener)api.runtime.onInstalled.addListener(()=>{ensureRunnerAlarm().catch(()=>{});scheduleRunnerTick(3000)});
if(api.alarms?.onAlarm?.addListener)api.alarms.onAlarm.addListener(alarm=>{if(alarm?.name===RUNNER_ALARM)runnerTick().catch(()=>{})});
ensureRunnerAlarm().catch(()=>{});
