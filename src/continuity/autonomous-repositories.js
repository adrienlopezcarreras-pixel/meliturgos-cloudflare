const te = new TextEncoder();
const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DISCOVERY_INDEX = 'https://raw.githubusercontent.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/main/shardvault/discovery-index.json';
const MAX_PUBLIC_FEEDS = 30;
const MAX_GITHUB_REPOS = 20;
const MAX_GITHUB_CATALOG_REPOS = 12;
const MAX_CATALOG_LEADS = 120;
const DISCOVERY_HISTORY_KEY='shardvault/discovery/history.json';
const DISCOVERY_LATEST_KEY='shardvault/discovery/latest.json';
const QUERY_SETS = Object.freeze([
  ['anonymous file hosting api in:name,description,readme','temporary file upload api in:name,description,readme','free file hosting api in:name,description,readme'],
  ['guest upload rest api in:name,description,readme','no signup file upload api in:name,description,readme','free object storage api in:name,description,readme'],
  ['temporary object storage api in:name,description,readme','anonymous upload service api in:name,description,readme','file sharing api guest in:name,description,readme'],
  ['free storage upload endpoint in:name,description,readme','public file upload rest api in:name,description,readme','ephemeral file storage api in:name,description,readme']
]);
const EMBEDDED_SEED_LEADS = Object.freeze([
  {name:'/TMP/FILES',url:'https://tmpfiles.org',summary:'Hébergement temporaire anonyme avec API signalée. Piste à vérifier avant tout usage.'},
  {name:'Gofile',url:'https://gofile.io',summary:'Hébergement de fichiers avec API et usage invité signalés. Piste à vérifier avant tout usage.'},
  {name:'1fichier',url:'https://1fichier.com',summary:'Upload invité/API signalés par des catalogues publics. Piste à vérifier avant tout usage.'},
  {name:'TempFile.org',url:'https://tempfile.org',summary:'API REST publique signalée pour fichiers temporaires. Piste à vérifier avant tout usage.'},
  {name:'FileDitch',url:'https://fileditch.com',summary:'Service anonyme avec backend API mentionné publiquement. Piste à vérifier avant tout usage.'}
]);
const EMBEDDED_CATALOGS = Object.freeze([
  {id:'awesome-file-hosts',url:'https://raw.githubusercontent.com/FahadBinHussain/awesome-file-hosts/main/README.md'},
  {id:'awesome-free-file-hosting',url:'https://raw.githubusercontent.com/Nick088Official/awesome-free-file-hosting/main/README.md'},
  {id:'polyuploader',url:'https://raw.githubusercontent.com/spel987/PolyUploader/main/README.md'},
  {id:'awesome-public-free-apis',url:'https://raw.githubusercontent.com/gunjanjaswal/Awesome-Public-Free-Apis/main/README.md'}
]);

function bytes(v){ if(v instanceof Uint8Array)return new Uint8Array(v); if(v instanceof ArrayBuffer)return new Uint8Array(v); if(ArrayBuffer.isView(v))return new Uint8Array(v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength)); throw new TypeError('BYTES_REQUIRED'); }
function utf8(v){ return te.encode(String(v)); }
function b64u(v){ let s='';const a=bytes(v);for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
function parseJson(v,fallback){ try{return JSON.parse(v??JSON.stringify(fallback));}catch{return fallback;} }
function stable(v){ if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(stable).join(',')}]`;return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`; }
function rid(n=18){ const a=new Uint8Array(n);crypto.getRandomValues(a);return b64u(a); }
function isPrivate4(h){ const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);if(!m)return false;const o=m.slice(1).map(Number);return o.some(x=>x>255)||o[0]===10||o[0]===127||o[0]===0||(o[0]===169&&o[1]===254)||(o[0]===172&&o[1]>=16&&o[1]<=31)||(o[0]===192&&o[1]===168); }
function publicHttps(value,label,{template=false}={}){ let u;try{u=new URL(template?String(value).replaceAll('{objectId}','probe'):String(value));}catch{throw new Error(`${label}_INVALID`)}const h=u.hostname.toLowerCase();if(u.protocol!=='https:')throw new Error(`${label}_HTTPS_REQUIRED`);if(u.username||u.password)throw new Error(`${label}_CREDENTIALS_FORBIDDEN`);if(h==='localhost'||h.endsWith('.local')||isPrivate4(h)||(h.includes(':')&&(h==='::1'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80'))))throw new Error(`${label}_PRIVATE_NETWORK_FORBIDDEN`);return u; }
async function fetchTimed(url,options={},ms=10000){ const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...options,redirect:'error',signal:c.signal});}finally{clearTimeout(t);} }
async function hkdf(master,salt,info,len=32){ const k=await crypto.subtle.importKey('raw',bytes(master),'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:bytes(salt),info:bytes(info)},k,len*8)); }
async function hmac(key,payload){ const k=await crypto.subtle.importKey('raw',bytes(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,bytes(payload))); }

function normalize(raw, source){
  if(!raw||typeof raw!=='object')throw new Error('CANDIDATE_EMPTY');
  if(!/^[a-zA-Z0-9._-]{1,80}$/.test(String(raw.id||'')))throw new Error('CANDIDATE_ID_INVALID');
  if(!String(raw.urlTemplate||'').includes('{objectId}'))throw new Error('CANDIDATE_TEMPLATE_INVALID');
  const storage=publicHttps(raw.urlTemplate,'CANDIDATE_STORAGE',{template:true});
  const policy=raw.policyUrl?publicHttps(raw.policyUrl,'CANDIDATE_POLICY').toString():null;
  const reviewed=raw.policyReviewedAt?Date.parse(raw.policyReviewedAt):NaN;
  const method=String(raw.method||'PUT').toUpperCase();
  if(!['PUT','POST'].includes(method))throw new Error('CANDIDATE_METHOD_INVALID');
  return {
    id:String(raw.id),
    urlTemplate:String(raw.urlTemplate),
    method,
    maxBytes:Math.max(0,Number(raw.maxObjectBytes??raw.maxBytes??0)||0),
    operatorDomain:String(raw.operatorDomain||storage.hostname).toLowerCase(),
    providerId:String(raw.providerId||raw.operatorDomain||storage.hostname).toLowerCase(),
    jurisdiction:String(raw.jurisdiction||'UNKNOWN').toUpperCase(),
    policyUrl:policy,
    policyReviewedAt:Number.isFinite(reviewed)?new Date(reviewed).toISOString():null,
    expectedRetentionDays:Math.max(0,Number(raw.expectedRetentionDays||0)||0),
    authMode:String(raw.authMode||'none').toLowerCase(),
    anonymousWriteDeclared:raw.anonymousWriteDeclared===true,
    publicReadDeclared:raw.publicReadDeclared===true,
    automationAllowedDeclared:raw.automationAllowedDeclared===true,
    freeDeclared:raw.freeDeclared===true,
    writeProbeAllowed:raw.writeProbeAllowed===true,
    source,
  };
}

function eligible(c,{requiredBytes=0,policyMaxAgeDays=180}={}){
  const reasons=[];
  if(c.authMode!=='none')reasons.push('AUTH_REQUIRED');
  if(!c.anonymousWriteDeclared)reasons.push('ANONYMOUS_WRITE_NOT_DECLARED');
  if(!c.publicReadDeclared)reasons.push('PUBLIC_READ_NOT_DECLARED');
  if(!c.automationAllowedDeclared)reasons.push('AUTOMATION_NOT_DECLARED');
  if(!c.freeDeclared)reasons.push('FREE_USE_NOT_DECLARED');
  if(!c.writeProbeAllowed)reasons.push('WRITE_PROBE_NOT_ALLOWED');
  if(!c.policyUrl||!c.policyReviewedAt)reasons.push('POLICY_EVIDENCE_MISSING');
  else if(Date.now()-Date.parse(c.policyReviewedAt)>policyMaxAgeDays*DAY)reasons.push('POLICY_EVIDENCE_STALE');
  if(c.maxBytes<Math.max(256,requiredBytes))reasons.push('CAPACITY_TOO_SMALL');
  return {ok:reasons.length===0,reasons};
}


function leadKey(x){return (String(x?.name||'').trim().toLowerCase()+'|'+String(x?.url||'').trim().toLowerCase()).slice(0,500);}
async function readDiscoveryHistory(env){
  if(!env?.MEDIA_BUCKET?.get)return {generation:0,seen_leads:[],source_failures:{}};
  try{
    const body=await env.MEDIA_BUCKET.get(DISCOVERY_HISTORY_KEY);
    if(body){
      const parsed=JSON.parse(await body.text());
      if(parsed&&typeof parsed==='object')return {generation:Number(parsed.generation)||0,seen_leads:Array.isArray(parsed.seen_leads)?parsed.seen_leads:[],source_failures:parsed.source_failures&&typeof parsed.source_failures==='object'?parsed.source_failures:{}};
    }
    const latest=await env.MEDIA_BUCKET.get(DISCOVERY_LATEST_KEY);
    if(latest){
      const parsed=JSON.parse(await latest.text()),seen=(parsed?.leads||[]).map(leadKey).filter(Boolean);
      return {generation:parsed?.searched_at?1:0,seen_leads:[...new Set(seen)],source_failures:{}};
    }
  }catch{}
  return {generation:0,seen_leads:[],source_failures:{}};
}
async function writeDiscoveryHistory(env,history){
  if(!env?.MEDIA_BUCKET?.put)return;
  try{await env.MEDIA_BUCKET.put(DISCOVERY_HISTORY_KEY,JSON.stringify(history),{httpMetadata:{contentType:'application/json'}});}catch{}
}
function githubHeaders(env){
  const h={'accept':'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'MEL-ShardVault-discovery'};
  const token=String(env?.GITHUB_TOKEN||env?.MEL_GITHUB_TOKEN||'').trim();
  if(token)h.authorization='Bearer '+token;
  return h;
}
function markdownLink(value){
  const s=String(value||'').trim(),m=/\[([^\]]+)\]\((https:\/\/[^)]+)\)/.exec(s);
  if(m)return {name:m[1].trim(),url:m[2].trim()};
  return {name:s.replace(/^\*+|\*+$/g,'').trim(),url:null};
}
function parseCatalogLeads(text,source){
  const out=[],seen=new Set();
  for(const rawLine of String(text||'').split(/\r?\n/)){
    const line=rawLine.trim();
    if(!line||!/(?:\bAPI\b|automation|anonymous upload)/i.test(line))continue;
    if(!/(?:Account:\s*No|anonymous|no signup|guest)/i.test(line))continue;
    const body=line.replace(/^[-*]\s+/,'');
    const split=body.indexOf(' - ');
    const head=split>=0?body.slice(0,split):body;
    const info=markdownLink(head);
    const name=info.name.slice(0,160);
    if(!name||seen.has(name.toLowerCase()))continue;
    seen.add(name.toLowerCase());
    out.push({name,url:info.url,source,summary:(split>=0?body.slice(split+3):body).slice(0,500),status:'LEAD_ONLY'});
    if(out.length>=MAX_CATALOG_LEADS)break;
  }
  return out;
}
function publicFeedPayload(payload){
  return payload&&payload.format==='MEL-ShardVault-CandidateFeed'&&Array.isArray(payload.candidates);
}
async function loadPublicFeed(url,accepted,rejected,queue,seen){
  const clean=publicHttps(url,'PUBLIC_DISCOVERY_FEED').toString();
  if(seen.has(clean)||seen.size>=MAX_PUBLIC_FEEDS)return false;
  seen.add(clean);
  try{
    const r=await fetchTimed(clean,{method:'GET',headers:{'accept':'application/json'}},8000);
    if(!r.ok)throw new Error('PUBLIC_FEED_HTTP_'+r.status);
    const payload=await r.json();
    if(!publicFeedPayload(payload))throw new Error('PUBLIC_FEED_FORMAT_INVALID');
    for(const raw of payload.candidates||[]){
      try{accepted.push(normalize(raw,clean));}catch(error){rejected.push({source:clean,id:raw?.id||null,reason:String(error?.message||error)});}
    }
    for(const next of payload.feeds||[]){
      try{const u=publicHttps(typeof next==='string'?next:next?.url,'PUBLIC_DISCOVERY_CHILD').toString();if(!seen.has(u))queue.push(u);}catch{}
    }
    return true;
  }catch(error){
    rejected.push({source:clean,reason:String(error?.message||error)});
    return false;
  }
}
async function discoverInternetSources(env,accepted,rejected){
  const history=await readDiscoveryHistory(env),generation=history.generation+1,previousSeen=new Set(history.seen_leads||[]);
  const sources=[],allLeads=EMBEDDED_SEED_LEADS.map(x=>({...x,source:'embedded-bootstrap',status:'SEED_LEAD'})),queue=[],seen=new Set();
  let leads=allLeads,catalogs=generation===1||generation%6===0?[...EMBEDDED_CATALOGS]:[];
  const indexUrl=String(env?.MEL_SHARDVAULT_DISCOVERY_INDEX||DEFAULT_DISCOVERY_INDEX);
  try{
    const clean=publicHttps(indexUrl,'DISCOVERY_INDEX').toString();
    const r=await fetchTimed(clean,{method:'GET',headers:{'accept':'application/json'}},8000);
    if(!r.ok)throw new Error('DISCOVERY_INDEX_HTTP_'+r.status);
    const index=await r.json();
    if(index?.format!=='MEL-ShardVault-DiscoveryIndex')throw new Error('DISCOVERY_INDEX_FORMAT_INVALID');
    sources.push({id:'bootstrap-index',url:clean,status:'LOADED',kind:'bootstrap'});
    if(Array.isArray(index.catalogs)&&index.catalogs.length)catalogs=index.catalogs;
    for(const seed of index.seed_leads||[]){
      const name=String(seed?.name||'').trim();
      const url=String(seed?.url||'').trim();
      if(!name)continue;
      allLeads.push({name,url:url||null,source:clean,summary:String(seed?.summary||'Source trouvée lors de la première exploration manuelle.').slice(0,500),status:'SEED_LEAD'});
    }
    for(const feed of index.native_feeds||[]){try{queue.push(publicHttps(typeof feed==='string'?feed:feed?.url,'BOOTSTRAP_FEED').toString());}catch{}}
    for(const catalog of catalogs){
      const url=typeof catalog==='string'?catalog:catalog?.url;
      if(!url)continue;
      try{
        const cu=publicHttps(url,'DISCOVERY_CATALOG').toString();
        const cr=await fetchTimed(cu,{method:'GET',headers:{'accept':'text/plain,application/json'}},10000);
        if(!cr.ok)throw new Error('CATALOG_HTTP_'+cr.status);
        const text=await cr.text();
        const found=parseCatalogLeads(text,cu);
        allLeads.push(...found.slice(0,Math.max(0,MAX_CATALOG_LEADS-allLeads.length)));
        sources.push({id:String(catalog?.id||'catalog'),url:cu,status:'LOADED',kind:'catalog',leads:found.length});
      }catch(error){sources.push({id:String(catalog?.id||'catalog'),url:String(url),status:'ERROR',kind:'catalog',error:String(error?.message||error)});}
    }
  }catch(error){
    sources.push({id:'bootstrap-index',url:indexUrl,status:'FALLBACK_EMBEDDED',kind:'bootstrap',error:String(error?.message||error)});
    for(const catalog of catalogs){
      const url=typeof catalog==='string'?catalog:catalog?.url;
      if(!url)continue;
      try{
        const cu=publicHttps(url,'DISCOVERY_CATALOG').toString();
        const cr=await fetchTimed(cu,{method:'GET',headers:{'accept':'text/plain,application/json'}},10000);
        if(!cr.ok)throw new Error('CATALOG_HTTP_'+cr.status);
        const text=await cr.text();
        const found=parseCatalogLeads(text,cu);
        allLeads.push(...found.slice(0,Math.max(0,MAX_CATALOG_LEADS-allLeads.length)));
        sources.push({id:String(catalog?.id||'catalog'),url:cu,status:'LOADED',kind:'catalog',leads:found.length});
      }catch(catalogError){
        sources.push({id:String(catalog?.id||'catalog'),url:String(url),status:'ERROR',kind:'catalog',error:String(catalogError?.message||catalogError)});
      }
    }
  }

  const feedQuery='mel-shardvault in:name,description,readme';
  try{
    const api='https://api.github.com/search/repositories?q='+encodeURIComponent(feedQuery)+'&sort=updated&order=desc&per_page='+MAX_GITHUB_REPOS;
    const r=await fetchTimed(api,{method:'GET',headers:githubHeaders(env)},8000);
    if(!r.ok)throw new Error('GITHUB_DISCOVERY_HTTP_'+r.status);
    const body=await r.json(),items=Array.isArray(body?.items)?body.items:[];
    sources.push({id:'github-shardvault-search',url:'https://github.com/search?q='+encodeURIComponent('mel-shardvault')+'&type=repositories',status:'LOADED',kind:'search',results:items.length});
    const paths=['shardvault/feed.json','.well-known/mel-shardvault.json','shardvault-feed.json'];
    for(const item of items){
      const full=String(item?.full_name||''),defaultBranch=String(item?.default_branch||'main');
      if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(full))continue;
      for(const path of paths){
        const raw='https://raw.githubusercontent.com/'+full+'/'+encodeURIComponent(defaultBranch)+'/'+path;
        try{
          const rr=await fetchTimed(raw,{method:'GET',headers:{'accept':'application/json','user-agent':'MEL-ShardVault-discovery'}},5000);
          if(!rr.ok)continue;
          const payload=await rr.json();
          if(!publicFeedPayload(payload))continue;
          queue.push(raw);
          break;
        }catch{}
      }
    }
  }catch(error){sources.push({id:'github-shardvault-search',url:'https://github.com/search?q=mel-shardvault&type=repositories',status:'ERROR',kind:'search',error:String(error?.message||error)});}

  const catalogQueries=QUERY_SETS[(generation-1)%QUERY_SETS.length];
  const catalogRepos=new Map();
  for(const query of catalogQueries){
    try{
      const api='https://api.github.com/search/repositories?q='+encodeURIComponent(query)+'&sort=updated&order=desc&per_page=6';
      const r=await fetchTimed(api,{method:'GET',headers:githubHeaders(env)},8000);
      if(!r.ok)throw new Error('GITHUB_CATALOG_SEARCH_HTTP_'+r.status);
      const body=await r.json(),items=Array.isArray(body?.items)?body.items:[];
      sources.push({id:'github-catalog-search',url:'https://github.com/search?q='+encodeURIComponent(query)+'&type=repositories',status:'LOADED',kind:'search',query,results:items.length});
      for(const item of items){
        const full=String(item?.full_name||'');
        if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(full)||catalogRepos.has(full))continue;
        catalogRepos.set(full,{full,branch:String(item?.default_branch||'main'),html_url:String(item?.html_url||'')});
        if(catalogRepos.size>=MAX_GITHUB_CATALOG_REPOS)break;
      }
    }catch(error){sources.push({id:'github-catalog-search',status:'ERROR',kind:'search',query,error:String(error?.message||error)});}
    if(catalogRepos.size>=MAX_GITHUB_CATALOG_REPOS)break;
  }
  for(const repo of catalogRepos.values()){
    if(leads.length>=MAX_CATALOG_LEADS)break;
    const raw='https://raw.githubusercontent.com/'+repo.full+'/'+encodeURIComponent(repo.branch)+'/README.md';
    try{
      const rr=await fetchTimed(raw,{method:'GET',headers:{'accept':'text/plain','user-agent':'MEL-ShardVault-discovery'}},7000);
      if(!rr.ok)throw new Error('GITHUB_README_HTTP_'+rr.status);
      const text=await rr.text();
      const found=parseCatalogLeads(text,raw);
      allLeads.push(...found.slice(0,Math.max(0,MAX_CATALOG_LEADS-allLeads.length)));
      sources.push({id:repo.full,url:repo.html_url||raw,status:'LOADED',kind:'github-catalog',leads:found.length});
    }catch(error){
      sources.push({id:repo.full,url:repo.html_url||raw,status:'ERROR',kind:'github-catalog',error:String(error?.message||error)});
    }
  }
  let loadedFeeds=0;
  while(queue.length&&seen.size<MAX_PUBLIC_FEEDS){
    const next=queue.shift();
    if(await loadPublicFeed(next,accepted,rejected,queue,seen))loadedFeeds++;
  }
  sources.push({id:'native-feed-crawl',status:'LOADED',kind:'recursive-feeds',feeds_checked:seen.size,feeds_loaded:loadedFeeds});
  const unique=new Map();
  for(const lead of allLeads){const key=leadKey(lead);if(key&&!unique.has(key))unique.set(key,lead);}
  const newLeads=[...unique.entries()].filter(([key])=>!previousSeen.has(key)).map(([,lead])=>lead).slice(0,MAX_CATALOG_LEADS);
  const mergedSeen=[...new Set([...(history.seen_leads||[]),...unique.keys()])].slice(-2000);
  await writeDiscoveryHistory(env,{generation,seen_leads:mergedSeen,source_failures:history.source_failures||{},updated_at:new Date().toISOString()});
  return {sources,leads:newLeads,generation,known_leads:mergedSeen.length,new_leads:newLeads.length,query_set:catalogQueries};
}
function validatePublicPolicy(c,payload,{requiredBytes=0,policyMaxAgeDays=180}={}){
  if(!payload||payload.format!=='MEL-ShardVault-Policy')throw new Error('POLICY_FORMAT_INVALID');
  const storage=publicHttps(c.urlTemplate,'POLICY_STORAGE',{template:true});
  const policyUrl=publicHttps(c.policyUrl,'POLICY_URL');
  if(policyUrl.hostname.toLowerCase()!==storage.hostname.toLowerCase())throw new Error('POLICY_HOST_MISMATCH');
  if(String(payload.urlTemplate||'')!==String(c.urlTemplate))throw new Error('POLICY_TEMPLATE_MISMATCH');
  if(String(payload.method||c.method).toUpperCase()!==c.method)throw new Error('POLICY_METHOD_MISMATCH');
  if(payload.anonymousWriteAllowed!==true)throw new Error('POLICY_ANONYMOUS_WRITE_DENIED');
  if(payload.publicReadAllowed!==true)throw new Error('POLICY_PUBLIC_READ_DENIED');
  if(payload.automationAllowed!==true)throw new Error('POLICY_AUTOMATION_DENIED');
  if(payload.freeUseAllowed!==true)throw new Error('POLICY_FREE_USE_DENIED');
  if(payload.writeProbeAllowed!==true)throw new Error('POLICY_WRITE_PROBE_DENIED');
  const max=Math.max(0,Number(payload.maxObjectBytes||0));
  if(max<Math.max(256,requiredBytes))throw new Error('POLICY_CAPACITY_TOO_SMALL');
  const reviewed=Date.parse(payload.reviewedAt||'');
  if(!Number.isFinite(reviewed)||Date.now()-reviewed>policyMaxAgeDays*DAY)throw new Error('POLICY_REVIEW_STALE');
  if(payload.expiresAt&&Date.parse(payload.expiresAt)<=Date.now())throw new Error('POLICY_EXPIRED');
  return {maxBytes:max,expectedRetentionDays:Math.max(0,Number(payload.expectedRetentionDays||c.expectedRetentionDays||0)||0)};
}

async function verifyFeed(master,vaultId,payload){
  if(!payload||payload.format!=='MEL-ShardVault-CandidateFeed'||payload.vaultId!==vaultId||!payload.feedMac||!Array.isArray(payload.candidates))return false;
  const {feedMac,...unsigned}=payload;
  const key=await hkdf(master,utf8(vaultId),utf8('MEL-ShardVault/v1/candidate-feed'));
  return b64u(await hmac(key,utf8(stable(unsigned))))===feedMac;
}

async function loadCandidates(env,master,vaultId){
  const accepted=[],rejected=[];
  const local=parseJson(env?.MEL_AUTONOMOUS_REPOSITORIES_JSON,[]);
  if(Array.isArray(local))for(const raw of local){try{accepted.push(normalize(raw,'configured'));}catch(error){rejected.push({source:'configured',id:raw?.id||null,reason:String(error?.message||error)});}}
  const feeds=parseJson(env?.MEL_AUTONOMOUS_FEEDS_JSON,[]);
  if(Array.isArray(feeds))for(const item of feeds){
    const url=typeof item==='string'?item:item?.url;
    try{
      const clean=publicHttps(url,'AUTONOMOUS_FEED').toString();
      const r=await fetchTimed(clean,{method:'GET'});if(!r.ok)throw new Error(`FEED_HTTP_${r.status}`);
      const payload=await r.json();if(!(await verifyFeed(master,vaultId,payload)))throw new Error('FEED_SIGNATURE_INVALID');
      for(const raw of payload.candidates){try{accepted.push(normalize(raw,clean));}catch(error){rejected.push({source:clean,id:raw?.id||null,reason:String(error?.message||error)});}}
    }catch(error){rejected.push({source:String(url||'unknown'),reason:String(error?.message||error)});}
  }
  const internet=String(env?.MEL_SHARDVAULT_INTERNET_DISCOVERY||'true')==='true'
    ? await discoverInternetSources(env,accepted,rejected)
    : {sources:[],leads:[]};
  const byId=new Map();for(const c of accepted)byId.set(c.id,c);
  return {candidates:[...byId.values()],rejected,sources:internet.sources,leads:internet.leads};
}
async function probe(c, requiredBytes, policyMaxAgeDays=180){
  const policyStart=Date.now();
  const policy=await fetchTimed(c.policyUrl,{method:'GET',headers:{'accept':'application/json'}},8000);
  if(!policy.ok)throw new Error(`POLICY_HTTP_${policy.status}`);
  const policyBody=await policy.json().catch(()=>null);
  const authority=validatePublicPolicy(c,policyBody,{requiredBytes,policyMaxAgeDays});
  const policyLatency=Date.now()-policyStart;
  const payload=new Uint8Array(Math.min(authority.maxBytes,Math.max(256,Math.min(requiredBytes||256,1024))));crypto.getRandomValues(payload);
  const objectId=`mel-probe-${rid(12)}`;
  const url=publicHttps(c.urlTemplate.replaceAll('{objectId}',encodeURIComponent(objectId)),'AUTONOMOUS_TARGET').toString();
  const writeStart=Date.now();
  const w=await fetchTimed(url,{method:c.method,headers:{'content-type':'application/octet-stream','x-mel-shardvault-probe':'1'},body:payload},10000);
  if(!w.ok)throw new Error(`WRITE_HTTP_${w.status}`);
  const writeLatency=Date.now()-writeStart;
  const readStart=Date.now();
  const r=await fetchTimed(url,{method:'GET'},10000);if(!r.ok)throw new Error(`READ_HTTP_${r.status}`);
  const got=new Uint8Array(await r.arrayBuffer());const readLatency=Date.now()-readStart;
  if(got.length!==payload.length)throw new Error('PROBE_LENGTH_MISMATCH');
  let diff=0;for(let i=0;i<got.length;i++)diff|=got[i]^payload[i];if(diff)throw new Error('PROBE_CONTENT_MISMATCH');
  const latency=writeLatency+readLatency;
  const latencyScore=latency<=500?20:latency<=1500?15:latency<=4000?10:5;
  const retentionScore=Math.min(20,Math.round((Math.min(authority.expectedRetentionDays,30)/30)*20));
  const score=60+latencyScore+retentionScore;
  return {...c,maxBytes:authority.maxBytes,expectedRetentionDays:authority.expectedRetentionDays,score,confidence:80,probe:{ok:true,objectId,policyLatencyMs:policyLatency,writeLatencyMs:writeLatency,readLatencyMs:readLatency,checkedAt:new Date().toISOString()}};
}

function choose(candidates,count,maxPerOperator,maxPerProvider){
  const ranked=[...candidates].sort((a,b)=>b.score-a.score||b.confidence-a.confidence||a.id.localeCompare(b.id)),selected=[],ids=new Set(),ops=new Map(),provs=new Map();
  const can=(c,uniqueOp=false,uniqueProv=false)=>!ids.has(c.id)&&(ops.get(c.operatorDomain)||0)<maxPerOperator&&(provs.get(c.providerId)||0)<maxPerProvider&&(!uniqueOp||(ops.get(c.operatorDomain)||0)===0)&&(!uniqueProv||(provs.get(c.providerId)||0)===0);
  const add=c=>{selected.push(c);ids.add(c.id);ops.set(c.operatorDomain,(ops.get(c.operatorDomain)||0)+1);provs.set(c.providerId,(provs.get(c.providerId)||0)+1);};
  for(const c of ranked){if(can(c,true,true))add(c);if(selected.length>=count)return selected;}
  for(const c of ranked){if(can(c,true,false))add(c);if(selected.length>=count)return selected;}
  for(const c of ranked){if(can(c,false,false))add(c);if(selected.length>=count)break;}
  return selected;
}

export async function discoverAutonomousRepositories(env,{masterKey,vaultId,requiredBytes=0,selectionCount=7}={}){
  const master=bytes(masterKey);if(master.length<32)throw new Error('AUTONOMOUS_MASTER_KEY_INVALID');
  const loaded=await loadCandidates(env,master,String(vaultId));
  const policyMaxAgeDays=Math.max(1,Number(env?.MEL_AUTONOMOUS_POLICY_MAX_AGE_DAYS)||180);
  const probeLimit=Math.max(selectionCount,Math.min(50,Number(env?.MEL_AUTONOMOUS_PROBE_LIMIT)||14));
  const maxPerOperator=Math.max(1,Number(env?.MEL_WATCH_MAX_PER_OPERATOR)||2);
  const maxPerProvider=Math.max(1,Number(env?.MEL_WATCH_MAX_PER_PROVIDER)||2);
  const eligibleRows=[],rejected=[...loaded.rejected];
  for(const c of loaded.candidates){const e=eligible(c,{requiredBytes,policyMaxAgeDays});if(e.ok)eligibleRows.push(c);else rejected.push({source:c.source,id:c.id,reason:e.reasons.join(',')});}
  const probed=[];
  for(const c of eligibleRows.slice(0,probeLimit)){try{probed.push(await probe(c,requiredBytes,policyMaxAgeDays));}catch(error){rejected.push({source:c.source,id:c.id,reason:String(error?.message||error)});}}
  const selected=choose(probed,selectionCount,maxPerOperator,maxPerProvider);
  return {
    selected: selected.map(c=>({id:c.id,urlTemplate:c.urlTemplate,method:c.method,maxBytes:c.maxBytes,operatorDomain:c.operatorDomain,providerId:c.providerId,jurisdiction:c.jurisdiction,score:c.score,confidence:c.confidence,autonomous:true,authMode:'none'})),
    rejected,
    discovered:loaded.candidates.length,
    probed:probed.length,
    internet_sources:loaded.sources||[],
    leads:loaded.leads||[],
    generation:loaded.generation||1,
    known_leads:loaded.known_leads||0,
    new_leads:loaded.new_leads||0,
    query_set:loaded.query_set||[],
    diversity:{selected:selected.length,uniqueOperators:new Set(selected.map(c=>c.operatorDomain)).size,uniqueProviders:new Set(selected.map(c=>c.providerId)).size,uniqueJurisdictions:new Set(selected.map(c=>c.jurisdiction).filter(x=>x!=='UNKNOWN')).size},
  };
}

export const __autonomousTest = Object.freeze({ normalize, eligible, choose, parseCatalogLeads, validatePublicPolicy });
