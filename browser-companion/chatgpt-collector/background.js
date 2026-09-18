const api = globalThis.browser;
const DEFAULT={running:false,paused:true,tabId:null,collectorOwnedTab:false,queue:[],done:{},failed:{},unavailable:{},deferred:{},discovered:0,importedConversations:0,importedMessages:0,duplicates:0,lastError:null,currentUrl:null,updatedAt:null};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let processPromise=null;

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
async function config(){const x=await api.storage.local.get('melCollectorConfig'),c=x.melCollectorConfig||{};return{endpoint:String(c.endpoint||'https://meliturgos.adrien-lopezcarreras.workers.dev').replace(/\/$/,''),username:String(c.username||''),password:String(c.password||''),continuous:c.continuous!==false,ecoMode:c.ecoMode!==false,delayMs:Math.max(3000,Math.min(60000,Number(c.delayMs)||12000))}}
function auth(u,p){return 'Basic '+btoa(unescape(encodeURIComponent(`${u}:${p}`)))}

async function sendConversation(conversation){
  const c=await config();
  if(!c.username||!c.password) throw Object.assign(new Error('MEL_CREDENTIALS_REQUIRED'),{code:'MEL_CREDENTIALS_REQUIRED'});
  const r=await fetch(c.endpoint+'/api/gen2/import/chatgpt-archive',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':auth(c.username,c.password)},
    body:JSON.stringify({archive:[conversation],preview:false})
  });
  const t=await r.text();let b={};try{b=t?JSON.parse(t):{}}catch{}
  if(!r.ok&&r.status!==207) throw Object.assign(new Error(b.code||b.error||`MEL_HTTP_${r.status}`),{code:b.code||`MEL_HTTP_${r.status}`});
  return b;
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
  for(let i=0;i<attempts;i++){try{return await api.tabs.sendMessage(tabId,payload)}catch(e){err=e;await wait(500+i*250)}}
  throw err||new Error('CONTENT_SCRIPT_UNAVAILABLE');
}
async function pageUrls(tabId){try{const r=await tabMessage(tabId,{type:'mel.collector.discover'},4);return Array.isArray(r?.urls)?r.urls.map(norm).filter(Boolean):[]}catch{return[]}}
async function mergeDiscovery(tabId){
  const [a,b]=await Promise.all([historyUrls(),pageUrls(tabId)]);
  const s=await state(),done=s.done||{},failed=s.failed||{},unavailable=s.unavailable||{},queued=new Set(s.queue||[]);
  const add=[...new Set([...a,...b])].filter(u=>{
    const id=idFromUrl(u);
    const attempts=Number(failed[id]?.attempts||0);
    return id && !done[id] && !unavailable[id] && attempts<3 && !queued.has(u);
  });
  const queue=[...(s.queue||[]),...add];
  return save({queue,discovered:new Set([...queue,...Object.values(done).map(x=>x.url).filter(Boolean),...Object.values(unavailable).map(x=>x.url).filter(Boolean)]).size});
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
async function captureStable(tabId,maxAttempts=5){
  let last;
  for(let i=0;i<maxAttempts;i++){
    try{last=await tabMessage(tabId,{type:'mel.collector.capture'},3)}catch(e){last={ok:false,code:e?.message||'CAPTURE_FAILED'}}
    if(last?.ok)return last;
    if(!['CONVERSATION_STILL_GENERATING','NO_MESSAGES_FOUND','NOT_A_CONVERSATION','CONTENT_SCRIPT_UNAVAILABLE'].includes(last?.code))break;
    await wait(1200);
  }
  return last||{ok:false,code:'CAPTURE_FAILED'};
}
async function collectorTab(preferred){
  if(preferred!=null){
    try{
      const t=await api.tabs.get(preferred);
      if(t?.id!=null && t.active!==true && /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(t.url||'')) return {tab:t,owned:true};
    }catch{}
  }
  const created=await api.tabs.create({url:'https://chatgpt.com/',active:false});
  return {tab:created,owned:true};
}

async function process(tabId){
  await save({running:true,paused:false,tabId,lastError:null});
  let initial=await state();
  if(!(initial.queue||[]).length) await mergeDiscovery(tabId);
  while(true){
    let s=await state();
    if(!s.running||s.paused)return;
    let queue=[...(s.queue||[])];
    if(!queue.length){
      await mergeDiscovery(tabId);s=await state();queue=[...(s.queue||[])];
      if(!queue.length){await save({running:false,paused:false,currentUrl:null});return}
    }
    const url=queue.shift(),sourceId=idFromUrl(url);
    if(!sourceId||s.done?.[sourceId]){await save({queue});continue}
    await save({queue,currentUrl:url});
    try{
      await api.tabs.update(tabId,{url});
      await waitComplete(tabId);
      const reached=await waitForExpectedConversation(tabId,sourceId,15000);
      if(!reached)throw Object.assign(new Error('CONVERSATION_REDIRECTED_OR_UNAVAILABLE'),{code:'CONVERSATION_REDIRECTED_OR_UNAVAILABLE'});
      await wait(1200);
      const cfg=await config();
      const cap=await captureStable(tabId,cfg.ecoMode?4:8);
      if(!cap?.ok||!cap.conversation) throw Object.assign(new Error(cap?.code||'CAPTURE_FAILED'),{code:cap?.code||'CAPTURE_FAILED'});
      const result=await sendConversation(cap.conversation);
      s=await state();
      const done={...(s.done||{})};
      done[sourceId]={url,title:cap.conversation.title,messages:cap.conversation.messages.length,importedAt:Date.now()};
      const failed={...(s.failed||{})};delete failed[sourceId];
      const unavailable={...(s.unavailable||{})};delete unavailable[sourceId];
      await save({done,failed,unavailable,importedConversations:Object.keys(done).length,importedMessages:Number(s.importedMessages||0)+Number(result.inserted||0),duplicates:Number(s.duplicates||0)+Number(result.duplicates||0),lastError:null,currentUrl:null});
    }catch(e){
      s=await state();
      const failed={...(s.failed||{})};
      const key=sourceId||url;
      const code=e?.code||e?.message||'UNKNOWN_ERROR';
      const attempts=Number(failed[key]?.attempts||0)+1;
      failed[key]={url,code,attempts,failedAt:Date.now()};
      const unavailable={...(s.unavailable||{})};
      const deferred={...(s.deferred||{})};
      const transient=['CONVERSATION_STILL_GENERATING','NO_MESSAGES_FOUND','NOT_A_CONVERSATION','CONTENT_SCRIPT_UNAVAILABLE'].includes(code);
      const maxAttempts=code==='CONVERSATION_REDIRECTED_OR_UNAVAILABLE'?2:(transient?2:3);
      const nextQueue=[...(s.queue||[])];
      if(attempts<maxAttempts){
        if(!nextQueue.includes(url))nextQueue.push(url);
      }else if(code==='CONVERSATION_REDIRECTED_OR_UNAVAILABLE'){
        unavailable[key]={url,code,attempts,classifiedAt:Date.now()};
      }else if(transient){
        deferred[key]={url,code,attempts,deferredAt:Date.now()};
      }
      await save({failed,unavailable,deferred,queue:nextQueue,lastError:code,currentUrl:null});
    }
    const cfg=await config();
    if(cfg.ecoMode) await wait(cfg.delayMs);
    else await wait(1500);
  }
}

async function start(){
  const s=await state();
  if(processPromise){
    return save({running:true,paused:false,lastError:null});
  }
  const resolved=await collectorTab(s.tabId);
  const tab=resolved?.tab;
  if(!tab?.id) throw Object.assign(new Error('COLLECTOR_TAB_CREATE_FAILED'),{code:'COLLECTOR_TAB_CREATE_FAILED'});
  processPromise=process(tab.id)
    .catch(e=>save({running:false,lastError:e?.code||e?.message||'COLLECTOR_FAILED'}))
    .finally(()=>{processPromise=null});
  return save({running:true,paused:false,tabId:tab.id,collectorOwnedTab:true});
}

api.runtime.onMessage.addListener(async msg=>{
  if(msg?.type==='mel.collector.status')return state();
  if(msg?.type==='mel.collector.start'||msg?.type==='mel.collector.resume')return start();
  if(msg?.type==='mel.collector.pause')return save({running:false,paused:true,currentUrl:null});
  if(msg?.type==='mel.collector.capture-current'){
    const [tab]=await api.tabs.query({active:true,currentWindow:true});
    if(!tab?.id)throw new Error('ACTIVE_TAB_REQUIRED');
    const cap=await captureStable(tab.id);if(!cap?.ok)throw new Error(cap?.code||'CAPTURE_FAILED');
    const result=await sendConversation(cap.conversation),s=await state(),sourceId=cap.conversation.id;
    const done={...(s.done||{}),[sourceId]:{url:norm(tab.url),title:cap.conversation.title,messages:cap.conversation.messages.length,importedAt:Date.now()}};
    return save({done,importedConversations:Object.keys(done).length,importedMessages:Number(s.importedMessages||0)+Number(result.inserted||0),duplicates:Number(s.duplicates||0)+Number(result.duplicates||0)});
  }
  if(msg?.type==='mel.collector.auto-capture'&&msg.conversation){
    const c=await config();if(!c.continuous)return{ok:false,skipped:'CONTINUOUS_DISABLED'};
    const sourceId=String(msg.conversation.id||''),count=Array.isArray(msg.conversation.messages)?msg.conversation.messages.length:0;
    if(!sourceId)return{ok:false,skipped:'CONVERSATION_ID_REQUIRED'};
    let s=await state();if(s.done?.[sourceId]&&Number(s.done[sourceId].messages||0)>=count)return{ok:true,skipped:'ALREADY_CAPTURED'};
    try{
      const result=await sendConversation(msg.conversation);s=await state();
      const done={...(s.done||{}),[sourceId]:{url:msg.conversation.collector?.url||null,title:msg.conversation.title,messages:count,importedAt:Date.now()}};
      await save({done,importedConversations:Object.keys(done).length,importedMessages:Number(s.importedMessages||0)+Number(result.inserted||0),duplicates:Number(s.duplicates||0)+Number(result.duplicates||0)});
      return{ok:true};
    }catch(e){await save({lastError:e?.code||e?.message||'AUTO_CAPTURE_FAILED'});return{ok:false,code:e?.code||e?.message||'AUTO_CAPTURE_FAILED'}}
  }
});

api.runtime.onStartup.addListener(async()=>{const s=await state();if(s.running&&!s.paused)start().catch(()=>{})});
