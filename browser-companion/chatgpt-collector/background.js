const api = globalThis.browser;
const DEFAULT={running:false,paused:true,tabId:null,collectorOwnedTab:false,queue:[],done:{},partial:{},failed:{},unavailable:{},deferred:{},discovered:0,importedConversations:0,importedMessages:0,duplicates:0,lastError:null,currentUrl:null,currentStage:null,currentStartedAt:null,lastProgressAt:null,currentMessageCount:0,captureProcessed:0,stalledCount:0,updatedAt:null};
const WATCHDOG_IDLE_MS=8*60*1000;
const NETWORK_TIMEOUT_MS=6*60*1000;
const MESSAGE_TIMEOUT_MS=60000;
const DOM_STABLE_MAX_MS=3*60*1000;
const ECO_HEAVY_MESSAGES=250;
const ECO_BLANK_EVERY=5;
const STOP_WAIT_MS=3000;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let processPromise=null;
let processGeneration=0;
let activeAbortController=null;
let activeCapturePulse=null;
let processedSinceBlank=0;

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
async function config(){const x=await api.storage.local.get('melCollectorConfig'),c=x.melCollectorConfig||{};return{endpoint:String(c.endpoint||'https://meliturgos.adrien-lopezcarreras.workers.dev').replace(/\/$/,''),username:String(c.username||''),password:String(c.password||''),continuous:c.continuous!==false,ecoMode:c.ecoMode!==false,delayMs:Math.max(8000,Math.min(60000,Number(c.delayMs)||30000))}}
function auth(u,p){return 'Basic '+btoa(unescape(encodeURIComponent(`${u}:${p}`)))}

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

async function tabMessage(tabId,payload,attempts=8){
  let err;
  for(let i=0;i<attempts;i++){try{return await withTimeout(api.tabs.sendMessage(tabId,payload),MESSAGE_TIMEOUT_MS,'CONTENT_SCRIPT_TIMEOUT')}catch(e){err=e;await wait(500+i*250)}}
  throw err||new Error('CONTENT_SCRIPT_UNAVAILABLE');
}
async function pageUrls(tabId,deep=false){try{const r=await tabMessage(tabId,{type:'mel.collector.discover',deep},2);return Array.isArray(r?.urls)?r.urls.map(norm).filter(Boolean):[]}catch{return[]}}
async function mergeDiscovery(tabId){
  const [a,b]=await Promise.all([historyUrls(),pageUrls(tabId,false)]);
  const s=await state(),done=s.done||{},failed=s.failed||{},unavailable=s.unavailable||{},deferred=s.deferred||{},queued=new Set(s.queue||[]);
  const add=[...new Set([...a,...b])].filter(u=>{
    const id=idFromUrl(u);
    const attempts=Number(failed[id]?.attempts||0);
    return id && !done[id] && !unavailable[id] && !deferred[id] && attempts<3 && !queued.has(u);
  });
  const queue=[...(s.queue||[]),...add];
  return save({queue,discovered:new Set([...queue,...Object.values(done).map(x=>x.url).filter(Boolean),...Object.values(deferred).map(x=>x.url).filter(Boolean),...Object.values(failed).map(x=>x.url).filter(Boolean),...Object.values(unavailable).map(x=>x.url).filter(Boolean)]).size});
}

function waitComplete(tabId,timeout=30000){
  return new Promise(resolve=>{
    let done=false;
    const finish=v=>{if(done)return;done=true;clearTimeout(timer);api.tabs.onUpdated.removeListener(listener);resolve(v)};
    const listener=(id,chg)=>{if(id===tabId&&chg.status==='complete')finish(true)};
    const timer=setTimeout(()=>finish(false),timeout);
    api.tabs.onUpdated.addListener(listener);
  });
}
async function waitForExpectedConversation(tabId,sourceId,timeout=15000){
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
async function waitForDomStable(tabId,ecoMode=true){
  const started=Date.now();
  let lastCount=-1,stable=0,lastProbe=null;
  const interval=ecoMode?2500:1200;
  while(Date.now()-started<DOM_STABLE_MAX_MS){
    try{
      const probe=await tabMessage(tabId,{type:'mel.collector.probe'},1);
      lastProbe=probe;
      if(probe?.generating){stable=0;await wait(interval);continue}
      const count=Number(probe?.messageCount||0);
      if(count>0&&count===lastCount)stable++;
      else stable=0;
      lastCount=count;
      if(stable>=(ecoMode?3:2))return probe;
    }catch{}
    await wait(interval);
  }
  if(Number(lastProbe?.messageCount||0)>0&&!lastProbe?.generating)return lastProbe;
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
async function collectorTab(preferred){
  if(preferred!=null){
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
  if(!(initial.queue||[]).length) await withTimeout(mergeDiscovery(tabId),60000,'DISCOVERY_TIMEOUT');
  while(isCurrentRun(generation)){
    let s=await state();
    if(!s.running||s.paused)return;
    let queue=[...(s.queue||[])];
    if(!queue.length){
      await withTimeout(mergeDiscovery(tabId),60000,'DISCOVERY_TIMEOUT');
      s=await state();queue=[...(s.queue||[])];
      if(!queue.length){await save({running:false,paused:false,currentUrl:null,currentStage:null,currentStartedAt:null,currentMessageCount:0,lastProgressAt:Date.now()});return}
    }
    const url=queue.shift(),sourceId=idFromUrl(url);
    if(!sourceId||s.done?.[sourceId]){await save({queue});continue}
    let itemMessageCount=0;
    const startedAt=Date.now();
    await save({queue,currentUrl:url,currentStage:'navigation',currentStartedAt:startedAt,lastProgressAt:startedAt,currentMessageCount:0});
    try{
      await withTimeout(api.tabs.update(tabId,{url}),30000,'TAB_UPDATE_TIMEOUT');
      if(!isCurrentRun(generation))return;
      await save({currentStage:'page_load',lastProgressAt:Date.now()});
      await waitComplete(tabId);
      await save({currentStage:'conversation_check',lastProgressAt:Date.now()});
      const reached=await waitForExpectedConversation(tabId,sourceId,15000);
      if(!reached)throw Object.assign(new Error('CONVERSATION_REDIRECTED_OR_UNAVAILABLE'),{code:'CONVERSATION_REDIRECTED_OR_UNAVAILABLE'});
      const cfg=await config();
      await save({currentStage:'settling',lastProgressAt:Date.now()});
      await wait(cfg.ecoMode?4000:1200);
      await save({currentStage:'dom_stabilize',lastProgressAt:Date.now()});
      const probe=await waitForDomStable(tabId,cfg.ecoMode);
      itemMessageCount=Number(probe?.messageCount||0);
      await save({currentStage:'capture',lastProgressAt:Date.now(),currentMessageCount:itemMessageCount,captureProcessed:0});
      const cap=await captureStable(tabId,cfg.ecoMode?3:6);
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
      await save({done,partial,failed,unavailable,deferred,importedConversations:Object.keys(done).length,importedMessages:Number(s.importedMessages||0)+Number(result.inserted||0),duplicates:Number(s.duplicates||0)+Number(result.duplicates||0),lastError:null,currentUrl:null,currentStage:null,currentStartedAt:null,currentMessageCount:0,captureProcessed:0,lastProgressAt:Date.now()});
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
      const deferImmediately=['CONTENT_SCRIPT_TIMEOUT','TAB_UPDATE_TIMEOUT','MEL_IMPORT_TIMEOUT','MEL_IMPORT_ABORTED','CONVERSATION_NO_PROGRESS_TIMEOUT','CAPTURE_NO_PROGRESS_TIMEOUT','DOM_NOT_STABLE'].includes(code);
      const maxAttempts=code==='CONVERSATION_REDIRECTED_OR_UNAVAILABLE'?2:(deferImmediately?1:(transient?2:3));
      const nextQueue=[...(s.queue||[])];
      if(attempts<maxAttempts){
        if(!nextQueue.includes(url))nextQueue.push(url);
      }else if(code==='CONVERSATION_REDIRECTED_OR_UNAVAILABLE'){
        unavailable[key]={url,code,attempts,classifiedAt:Date.now()};
      }else if(transient){
        deferred[key]={url,code,attempts,deferredAt:Date.now()};
      }
      const stalledCount=Number(s.stalledCount||0)+(deferImmediately?1:0);
      await save({failed,unavailable,deferred,queue:nextQueue,lastError:code,currentUrl:null,currentStage:null,currentStartedAt:null,currentMessageCount:0,captureProcessed:0,lastProgressAt:Date.now(),stalledCount});
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
    if(!url||s.done?.[key]||s.unavailable?.[key])continue;
    if(!queue.includes(url)){queue.push(url);added++}
    delete deferred[key];
    delete failed[key];
  }
  return save({queue,deferred,failed,lastError:null,retryDeferredAdded:added});
}

api.runtime.onMessage.addListener(async msg=>{
  if(msg?.type==='mel.collector.status')return state();
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
    return save({done,partial,importedConversations:Object.keys(done).length,importedMessages:Number(s.importedMessages||0)+Number(result.inserted||0),duplicates:Number(s.duplicates||0)+Number(result.duplicates||0)});
  }
  if(msg?.type==='mel.collector.auto-capture'&&msg.conversation){
    const c=await config();if(!c.continuous)return{ok:false,skipped:'CONTINUOUS_DISABLED'};
    const sourceId=String(msg.conversation.id||''),count=Math.max(Number(msg.conversation.collector?.totalMessages||0),Array.isArray(msg.conversation.messages)?msg.conversation.messages.length:0);
    if(!sourceId)return{ok:false,skipped:'CONVERSATION_ID_REQUIRED'};
    let s=await state();
    if(s.running&&!s.paused)return{ok:false,skipped:'BATCH_RUNNING'};
    const partialCapture=msg.conversation.collector?.partial===true;
    if(!partialCapture&&s.done?.[sourceId]&&Number(s.done[sourceId].messages||0)>=count)return{ok:true,skipped:'ALREADY_CAPTURED'};
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
      await save({done,partial,importedConversations:Object.keys(done).length,importedMessages:Number(s.importedMessages||0)+Number(result.inserted||0),duplicates:Number(s.duplicates||0)+Number(result.duplicates||0)});
      return{ok:true,partial:partialCapture};
    }catch(e){await save({lastError:e?.code||e?.message||'AUTO_CAPTURE_FAILED'});return{ok:false,code:e?.code||e?.message||'AUTO_CAPTURE_FAILED'}}
  }
});

api.runtime.onStartup.addListener(async()=>{const s=await state();if(s.running&&!s.paused)start().catch(()=>{})});
