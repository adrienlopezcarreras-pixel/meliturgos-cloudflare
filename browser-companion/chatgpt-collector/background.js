const api = globalThis.browser;
const DEFAULT={running:false,paused:true,tabId:null,queue:[],done:{},failed:{},discovered:0,importedConversations:0,importedMessages:0,duplicates:0,lastError:null,currentUrl:null,updatedAt:null};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

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
async function config(){const x=await api.storage.local.get('melCollectorConfig'),c=x.melCollectorConfig||{};return{endpoint:String(c.endpoint||'https://meliturgos.adrien-lopezcarreras.workers.dev').replace(/\/$/,''),username:String(c.username||''),password:String(c.password||''),continuous:c.continuous!==false}}
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
  const [a,b]=await Promise.all([historyUrls(),pageUrls(tabId)]),s=await state(),done=s.done||{},queued=new Set(s.queue||[]);
  const add=[...new Set([...a,...b])].filter(u=>!done[idFromUrl(u)]&&!queued.has(u));
  const queue=[...(s.queue||[]),...add];
  return save({queue,discovered:new Set([...queue,...Object.values(done).map(x=>x.url).filter(Boolean)]).size});
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
async function captureStable(tabId){
  let last;
  for(let i=0;i<12;i++){
    try{last=await tabMessage(tabId,{type:'mel.collector.capture'},3)}catch(e){last={ok:false,code:e?.message||'CAPTURE_FAILED'}}
    if(last?.ok)return last;
    if(!['CONVERSATION_STILL_GENERATING','NO_MESSAGES_FOUND'].includes(last?.code))break;
    await wait(1500);
  }
  return last||{ok:false,code:'CAPTURE_FAILED'};
}
async function collectorTab(preferred){
  if(preferred!=null){try{const t=await api.tabs.get(preferred);if(t?.id!=null)return t}catch{}}
  return (await api.tabs.query({})).find(t=>/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(t.url||''))||null;
}

async function process(tabId){
  await save({running:true,paused:false,tabId,lastError:null});
  await mergeDiscovery(tabId);
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
      await api.tabs.update(tabId,{url,active:true});
      await waitComplete(tabId);await wait(1800);
      const cap=await captureStable(tabId);
      if(!cap?.ok||!cap.conversation) throw Object.assign(new Error(cap?.code||'CAPTURE_FAILED'),{code:cap?.code||'CAPTURE_FAILED'});
      const result=await sendConversation(cap.conversation);
      s=await state();
      const done={...(s.done||{})};
      done[sourceId]={url,title:cap.conversation.title,messages:cap.conversation.messages.length,importedAt:Date.now()};
      const failed={...(s.failed||{})};delete failed[sourceId];
      await save({done,failed,importedConversations:Object.keys(done).length,importedMessages:Number(s.importedMessages||0)+Number(result.inserted||0),duplicates:Number(s.duplicates||0)+Number(result.duplicates||0),lastError:null,currentUrl:null});
      await mergeDiscovery(tabId);
    }catch(e){
      s=await state();
      const failed={...(s.failed||{})};
      failed[sourceId||url]={url,code:e?.code||e?.message||'UNKNOWN_ERROR',failedAt:Date.now()};
      await save({failed,lastError:failed[sourceId||url].code,currentUrl:null});
    }
  }
}

async function start(){
  const s=await state(),tab=await collectorTab(s.tabId);
  if(!tab?.id) throw Object.assign(new Error('OPEN_CHATGPT_TAB_REQUIRED'),{code:'OPEN_CHATGPT_TAB_REQUIRED'});
  process(tab.id).catch(e=>save({running:false,lastError:e?.code||e?.message||'COLLECTOR_FAILED'}));
  return save({running:true,paused:false,tabId:tab.id});
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
