const te = new TextEncoder();
const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DISCOVERY_INDEX = 'https://raw.githubusercontent.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/main/shardvault/discovery-index.json';
const MAX_PUBLIC_FEEDS = 30;
const MAX_GITHUB_REPOS = 20;
const MAX_GITHUB_CATALOG_REPOS = 12;
const MAX_CATALOG_LEADS = 120;
const MAX_EXPERIENCE_PLAYBOOKS = 5;
const DISCOVERY_HISTORY_KEY='shardvault/discovery/history.json';
const DISCOVERY_LATEST_KEY='shardvault/discovery/latest.json';
const QUERY_SETS = Object.freeze([
  ['anonymous file hosting api in:name,description,readme','temporary file upload api in:name,description,readme','free file hosting api in:name,description,readme'],
  ['guest upload rest api in:name,description,readme','no signup file upload api in:name,description,readme','free object storage api in:name,description,readme'],
  ['temporary object storage api in:name,description,readme','anonymous upload service api in:name,description,readme','file sharing api guest in:name,description,readme'],
  ['free storage upload endpoint in:name,description,readme','public file upload rest api in:name,description,readme','ephemeral file storage api in:name,description,readme'],
  ['anonymous paste api no auth 1 year retention in:name,description,readme','paste service api never expire anonymous in:name,description,readme','developer paste api raw endpoint no signup in:name,description,readme'],
  ['guest file upload rest api public download no api key in:name,description,readme','file hosting api scripts bots long retention in:name,description,readme','direct download upload api automation allowed in:name,description,readme'],
  ['open source pastebin public instance api anonymous in:name,description,readme','self hosted file share anonymous upload api in:name,description,readme','public paste server no authentication api in:name,description,readme']
]);
const EMBEDDED_SEED_LEADS = Object.freeze([
  {name:'/TMP/FILES',url:'https://tmpfiles.org',summary:'Hébergement temporaire anonyme avec API signalée. Piste à vérifier avant tout usage.'},
  {name:'Gofile',url:'https://gofile.io',summary:'Hébergement de fichiers avec API et usage invité signalés. Piste à vérifier avant tout usage.'},
  {name:'1fichier',url:'https://1fichier.com',summary:'Upload invité/API signalés par des catalogues publics. Piste à vérifier avant tout usage.'},
  {name:'TempFile.org',url:'https://tempfile.org',summary:'API REST publique signalée pour fichiers temporaires. Piste à vérifier avant tout usage.'},
  {name:'FileDitch',url:'https://fileditch.com',summary:'Service anonyme avec backend API mentionné publiquement. Piste à vérifier avant tout usage.'}
]);
const DOCUMENTED_CANDIDATES = Object.freeze([
  {
    id:'filebin-public',
    adapter:'filebin',
    urlTemplate:'https://filebin.net/mel-shardvault-{objectId}/shard.bin',
    method:'POST',
    maxObjectBytes:1048576,
    operatorDomain:'filebin.net',
    providerId:'filebin',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:6,
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://filebin.net/api.yaml','https://filebin.net/terms']
  },
  {
    id:'catbox-public',
    adapter:'catbox',
    urlTemplate:'https://catbox.moe/user/api.php?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:2097152,
    operatorDomain:'catbox.moe',
    providerId:'catbox',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:730,
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://catbox.moe/tools.php','https://catbox.moe/faq.php']
  },
  {
    id:'temp-sh-public',
    adapter:'temp_sh',
    urlTemplate:'https://temp.sh/upload?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:1048576,
    operatorDomain:'temp.sh',
    providerId:'temp-sh',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:3,
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://temp.sh/']
  },
  {
    id:'0x0-st-public',
    adapter:'zero_x0_binary',
    urlTemplate:'https://0x0.st/?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:524288,
    operatorDomain:'0x0.st',
    providerId:'0x0-st',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:180,
    retentionModel:'size_formula',
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-20T19:05:00.000Z',
    evidenceUrls:['https://github.com/Reboot-Codes/0x0','https://github.com/Reboot-Codes/0x0/blob/master/instance/config.example.py']
  },
  {
    id:'dpaste-org-public',
    adapter:'dpaste_org_b64',
    urlTemplate:'https://dpaste.org/api/?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:1048576,
    operatorDomain:'dpaste.org',
    providerId:'dpaste-org',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:3650,
    retentionModel:'declared_never',
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-20T19:05:00.000Z',
    evidenceUrls:['https://docs.dpaste.org/api/','https://docs.dpaste.org/settings/','https://github.com/DarrenOfficial/dpaste']
  },
  {
    id:'pastebin-ai-public',
    adapter:'pastebin_ai_b64',
    urlTemplate:'https://pastebin.ai/api/v1/pastes?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:700000,
    operatorDomain:'pastebin.ai',
    providerId:'pastebin-ai',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:365,
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://pastebin.ai/api-docs','https://pastebin.ai/api/quickstart']
  },
  {
    id:'dpaste-public',
    adapter:'dpaste_b64',
    urlTemplate:'https://dpaste.com/api/v2/?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:700000,
    operatorDomain:'dpaste.com',
    providerId:'dpaste',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:365,
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://dpaste.com/api/v2/','https://dpaste.com/help']
  },
  {
    id:'pastemyst-public',
    adapter:'pastemyst_b64',
    urlTemplate:'https://paste.myst.rs/api/v2/paste?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:700000,
    operatorDomain:'paste.myst.rs',
    providerId:'pastemyst',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:365,
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://paste.myst.rs/api-docs/paste','https://paste.myst.rs/api-docs/objects']
  },
  {
    id:'1c3-public',
    adapter:'onec3_b64',
    urlTemplate:'https://1c3.ir/?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:1048576,
    operatorDomain:'1c3.ir',
    providerId:'1c3',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:365,
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://1c3.ir/']
  },
  {
    id:'msk-paste-public',
    adapter:'msk_paste_b64',
    urlTemplate:'https://paste.msk-scripts.de/api/pastes?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:700000,
    operatorDomain:'paste.msk-scripts.de',
    providerId:'msk-paste',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:365,
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://docu.msk-scripts.de/ecosystem/msk-paste/api/']
  },
  {
    id:'pastebox-anonymous',
    adapter:'pastebox_b64',
    urlTemplate:'https://lfdekutkxwsczpasjgsg.supabase.co/functions/v1/create-share?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:500000,
    operatorDomain:'pastebox.ai',
    providerId:'pastebox',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:90,
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://pastebox.ai/api','https://pastebox.ai/pricing']
  },
  {
    id:'paste-c-net-public',
    adapter:'paste_c_net',
    urlTemplate:'https://paste.c-net.org/?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:52428800,
    operatorDomain:'paste.c-net.org',
    providerId:'paste-c-net',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:180,
    retentionModel:'renewable',
    baseRetentionDays:180,
    refreshEveryDays:120,
    fullReadRenewsRetention:true,
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://paste.c-net.org/']
  },
  {
    id:'pastehtml-public',
    adapter:'pastehtml_b64',
    urlTemplate:'https://pastehtml.dev/api/pastes?filename={objectId}.html&mel_object={objectId}',
    method:'POST',
    maxObjectBytes:2097152,
    operatorDomain:'pastehtml.dev',
    providerId:'pastehtml',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:3650,
    retentionModel:'declared_never',
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T19:31:00.000Z',
    evidenceUrls:['https://github.com/AliOsm/pastehtml.dev/blob/main/README.md']
  },
  {
    id:'pastegg-public',
    adapter:'pastegg_b64',
    urlTemplate:'https://api.paste.gg/v1/pastes?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:76800,
    operatorDomain:'paste.gg',
    providerId:'pastegg',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:365,
    retentionModel:'declared_never',
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://github.com/anna-is-cute/paste/blob/master/api.md']
  },
  {
    id:'markdownpaste-public',
    adapter:'markdownpaste_b64',
    urlTemplate:'https://markdownpasteit.vercel.app/api/paste?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:100000,
    operatorDomain:'markdownpasteit.vercel.app',
    providerId:'markdown-paste',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:365,
    retentionModel:'declared_never',
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://github.com/randishdeviant/markdown-paste/blob/main/README.md','https://github.com/randishdeviant/markdown-paste/blob/main/src/lib/constants.ts']
  },
  {
    id:'udrop-dev-public',
    adapter:'udrop_dev_b64',
    urlTemplate:'https://udrop.dev?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:350000,
    operatorDomain:'udrop.dev',
    providerId:'udrop-dev',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:365,
    retentionModel:'declared_never',
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T18:10:00.000Z',
    evidenceUrls:['https://udrop.dev/']
  },
  {
    id:'waifuvault-public',
    adapter:'waifuvault_b64',
    urlTemplate:'https://waifuvault.moe/rest?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:10485760,
    operatorDomain:'waifuvault.moe',
    providerId:'waifuvault',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:365,
    retentionModel:'size_formula',
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T18:10:00.000Z',
    evidenceUrls:['https://waifuvault.moe/','https://waifuvault.moe/api-docs/']
  },
  {
    id:'telegraph-public',
    adapter:'telegraph_b64',
    urlTemplate:'https://api.telegra.ph/createPage?mel_object={objectId}',
    method:'POST',
    maxObjectBytes:64000,
    operatorDomain:'telegra.ph',
    providerId:'telegraph',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:365,
    retentionModel:'declared_never',
    authMode:'ephemeral_account_token',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T18:18:00.000Z',
    evidenceUrls:['https://telegra.ph/api']
  },
  {
    id:'fileditch-public',
    adapter:'fileditch_b64',
    urlTemplate:'https://new.fileditch.com/upload.php?filename={objectId}.txt',
    method:'POST',
    maxObjectBytes:104857600,
    operatorDomain:'new.fileditch.com',
    providerId:'fileditch',
    jurisdiction:'UNKNOWN',
    expectedRetentionDays:45,
    retentionModel:'renewable',
    baseRetentionDays:45,
    refreshEveryDays:30,
    fullReadRenewsRetention:true,
    authMode:'none',
    anonymousWriteDeclared:true,
    publicReadDeclared:true,
    automationAllowedDeclared:true,
    freeDeclared:true,
    writeProbeAllowed:true,
    evidenceMode:'documented_api',
    evidenceReviewedAt:'2026-09-19T00:00:00.000Z',
    evidenceUrls:['https://new.fileditch.com/api.html','https://new.fileditch.com/faq.html']
  }
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
function b64(v){ let s='';const a=bytes(v);for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s); }
function unb64(v){ const raw=atob(String(v||'').trim());return Uint8Array.from(raw,c=>c.charCodeAt(0)); }
function unb64u(v){ const n=String(v||'').trim().replaceAll('-','+').replaceAll('_','/');const raw=atob(n+'='.repeat((4-n.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0)); }
function parseJson(v,fallback){ try{return JSON.parse(v??JSON.stringify(fallback));}catch{return fallback;} }
function stable(v){ if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(stable).join(',')}]`;return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`; }
function rid(n=18){ const a=new Uint8Array(n);crypto.getRandomValues(a);return b64u(a); }
function isPrivate4(h){ const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);if(!m)return false;const o=m.slice(1).map(Number);return o.some(x=>x>255)||o[0]===10||o[0]===127||o[0]===0||(o[0]===169&&o[1]===254)||(o[0]===172&&o[1]>=16&&o[1]<=31)||(o[0]===192&&o[1]===168); }
function publicHttps(value,label,{template=false}={}){ let u;try{u=new URL(template?String(value).replaceAll('{objectId}','probe'):String(value));}catch{throw new Error(`${label}_INVALID`)}const h=u.hostname.toLowerCase();if(u.protocol!=='https:')throw new Error(`${label}_HTTPS_REQUIRED`);if(u.username||u.password)throw new Error(`${label}_CREDENTIALS_FORBIDDEN`);if(h==='localhost'||h.endsWith('.local')||isPrivate4(h)||(h.includes(':')&&(h==='::1'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80'))))throw new Error(`${label}_PRIVATE_NETWORK_FORBIDDEN`);return u; }
async function fetchTimed(url,options={},ms=10000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{
    let current=String(url),opts={...options};
    for(let hop=0;hop<4;hop++){
      const method=String(opts.method||'GET').toUpperCase();
      const r=await fetch(current,{...opts,redirect:'manual',signal:c.signal});
      if(![301,302,303,307,308].includes(r.status))return r;
      if(method!=='GET'&&method!=='HEAD')return r;
      const location=r.headers.get('location');
      if(!location)return r;
      const next=new URL(location,current).toString();
      current=publicHttps(next,'FETCH_REDIRECT').toString();
      if(r.status===303)opts={...opts,method:'GET',body:undefined};
    }
    throw new Error('REDIRECT_LIMIT');
  }finally{clearTimeout(t);}
}
async function fetchRateAware(url,options={},ms=12000,attempts=3,baseDelayMs=1500,maxDelayMs=20000){
  let last=null;
  for(let attempt=0;attempt<attempts;attempt++){
    last=await fetchTimed(url,options,ms);
    if(last.status!==429)return last;
    if(attempt===attempts-1)return last;
    const raw=String(last.headers.get('retry-after')||'').trim();
    let delay=Math.max(500,Number(baseDelayMs)||1500)*(attempt+1);
    if(/^\d+$/.test(raw))delay=Math.max(delay,Number(raw)*1000);
    else if(raw){const at=Date.parse(raw);if(Number.isFinite(at))delay=Math.max(delay,at-Date.now());}
    await new Promise(resolve=>setTimeout(resolve,Math.max(500,Math.min(Math.max(500,Number(maxDelayMs)||20000),delay))));
  }
  return last;
}
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
    retentionModel:String(raw.retentionModel||'fixed').toLowerCase(),
    baseRetentionDays:Math.max(0,Number(raw.baseRetentionDays??raw.expectedRetentionDays??0)||0),
    refreshEveryDays:Math.max(0,Number(raw.refreshEveryDays||0)||0),
    fullReadRenewsRetention:raw.fullReadRenewsRetention===true,
    authMode:String(raw.authMode||'none').toLowerCase(),
    anonymousWriteDeclared:raw.anonymousWriteDeclared===true,
    publicReadDeclared:raw.publicReadDeclared===true,
    automationAllowedDeclared:raw.automationAllowedDeclared===true,
    freeDeclared:raw.freeDeclared===true,
    writeProbeAllowed:raw.writeProbeAllowed===true,
    adapter:String(raw.adapter||'').toLowerCase()||null,
    evidenceMode:source==='builtin-documented'&&raw.evidenceMode==='documented_api'?'documented_api':'mel_policy',
    evidenceReviewedAt:source==='builtin-documented'&&raw.evidenceReviewedAt?String(raw.evidenceReviewedAt):null,
    evidenceUrls:source==='builtin-documented'&&Array.isArray(raw.evidenceUrls)?raw.evidenceUrls.filter(x=>typeof x==='string').slice(0,5):[],
    source,
  };
}

function eligible(c,{requiredBytes=0,policyMaxAgeDays=180,minRetentionDays=90}={}){
  const reasons=[];
  const autonomousAuth=c.authMode==='none'||c.authMode==='ephemeral_account_token';
  if(!autonomousAuth)reasons.push('USER_AUTH_REQUIRED');
  if(!c.anonymousWriteDeclared)reasons.push('ANONYMOUS_WRITE_NOT_DECLARED');
  if(!c.publicReadDeclared)reasons.push('PUBLIC_READ_NOT_DECLARED');
  if(!c.automationAllowedDeclared)reasons.push('AUTOMATION_NOT_DECLARED');
  if(!c.freeDeclared)reasons.push('FREE_USE_NOT_DECLARED');
  if(!c.writeProbeAllowed)reasons.push('WRITE_PROBE_NOT_ALLOWED');
  if(c.evidenceMode==='documented_api'){
    if(!c.evidenceReviewedAt||!Array.isArray(c.evidenceUrls)||c.evidenceUrls.length<1)reasons.push('DOCUMENTED_EVIDENCE_MISSING');
    else if(Date.now()-Date.parse(c.evidenceReviewedAt)>365*DAY)reasons.push('DOCUMENTED_EVIDENCE_REVIEW_STALE');
  }else{
    if(!c.policyUrl||!c.policyReviewedAt)reasons.push('POLICY_EVIDENCE_MISSING');
    else if(Date.now()-Date.parse(c.policyReviewedAt)>policyMaxAgeDays*DAY)reasons.push('POLICY_EVIDENCE_STALE');
  }
  const requiredObjectBytes=Math.max(256,Math.min(Math.max(256,requiredBytes),32*1024));
  if(c.maxBytes<requiredObjectBytes)reasons.push('CAPACITY_TOO_SMALL');
  const renewable=c.retentionModel==='renewable'&&c.fullReadRenewsRetention===true&&c.baseRetentionDays>=30&&c.refreshEveryDays>0&&c.refreshEveryDays<c.baseRetentionDays;
  if(c.expectedRetentionDays<minRetentionDays&&!renewable)reasons.push('RETENTION_TOO_SHORT_'+c.expectedRetentionDays+'D_MIN_'+minRetentionDays+'D');
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
  let leads=allLeads,catalogs=generation===1||generation%6===0?[...EMBEDDED_CATALOGS]:[],experienceQueries=[];
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
    for(const rawBook of (index.experience_playbooks||[]).slice(0,MAX_EXPERIENCE_PLAYBOOKS)){
      const bookUrl=typeof rawBook==='string'?rawBook:rawBook?.url;
      if(!bookUrl)continue;
      try{
        const xu=publicHttps(bookUrl,'EXPERIENCE_PLAYBOOK').toString();
        const xr=await fetchTimed(xu,{method:'GET',headers:{'accept':'application/json'}},8000);
        if(!xr.ok)throw new Error('EXPERIENCE_PLAYBOOK_HTTP_'+xr.status);
        const book=await xr.json();
        if(book?.format!=='MEL-ShardVault-QualificationPlaybook')throw new Error('EXPERIENCE_PLAYBOOK_FORMAT_INVALID');
        for(const target of book.candidate_targets||[]){
          const name=String(target?.name||target?.id||'').trim();
          const url=String(target?.url||'').trim();
          if(!name)continue;
          const retention=target?.retention&&typeof target.retention==='object'?target.retention:{};
          const summary=[
            String(target?.status||'EXPERIENCE_LEAD'),
            target?.adapter_hint?'adapter '+String(target.adapter_hint):'',
            retention.model?'retention '+String(retention.model):'',
            Number(retention.days)>0?String(retention.days)+'d':'',
            String(target?.notes||'')
          ].filter(Boolean).join(' · ').slice(0,500);
          allLeads.push({name,url:url||null,source:xu,summary,status:'EXPERIENCE_LEAD'});
        }
        for(const target of book.validated_targets||[]){
          const name=String(target?.name||target?.id||'').trim();
          if(!name)continue;
          allLeads.push({
            name,
            url:null,
            source:xu,
            summary:[
              'VALIDATED_EXPERIENCE',
              target?.adapter?'adapter '+String(target.adapter):'',
              target?.retention_model?'retention '+String(target.retention_model):'',
              String(target?.proof||'')
            ].filter(Boolean).join(' · ').slice(0,500),
            status:'VALIDATED_EXPERIENCE'
          });
        }
        if(Array.isArray(book?.search_strategy?.search_queries))experienceQueries.push(...book.search_strategy.search_queries.map(String).filter(Boolean).slice(0,30));
        if(Array.isArray(book?.discovery_method?.query_families))experienceQueries.push(...book.discovery_method.query_families.map(String).filter(Boolean).slice(0,30));
        sources.push({
          id:'qualification-playbook',url:xu,status:'LOADED',kind:'experience',
          targets:Array.isArray(book.candidate_targets)?book.candidate_targets.length:0,
          validated_targets:Array.isArray(book.validated_targets)?book.validated_targets.length:0,
          lessons:Array.isArray(book.failure_memory)?book.failure_memory.length:0
        });
      }catch(error){
        sources.push({id:'qualification-playbook',url:String(bookUrl),status:'ERROR',kind:'experience',error:String(error?.message||error)});
      }
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

  const baseQueries=QUERY_SETS[(generation-1)%QUERY_SETS.length];
  const xpQuery=experienceQueries.length?experienceQueries[(generation-1)%experienceQueries.length]:null;
  const catalogQueries=xpQuery?[...baseQueries,xpQuery]:baseQueries;
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
  for(const raw of DOCUMENTED_CANDIDATES){
    try{accepted.push(normalize(raw,'builtin-documented'));}catch(error){rejected.push({source:'builtin-documented',id:raw?.id||null,reason:String(error?.message||error)});}
  }
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
  return {
    candidates:[...byId.values()],
    rejected,
    sources:internet.sources||[],
    leads:internet.leads||[],
    generation:internet.generation||1,
    known_leads:internet.known_leads||0,
    new_leads:internet.new_leads||0,
    query_set:internet.query_set||[]
  };
}
function fixedApiUrl(value){
  const u=new URL(String(value));
  u.searchParams.delete('mel_object');
  return u.toString();
}
function responseRemoteUrl(raw,headers,base){
  const text=String(raw||'').trim();
  let data=null;try{data=JSON.parse(text);}catch{}
  const candidates=[
    data?.raw_url,data?.rawUrl,data?.url,data?.link,data?.download_url,data?.downloadUrl,
    data?.paste?.raw_url,data?.paste?.rawUrl,data?.paste?.url,data?.data?.raw_url,data?.data?.url,
    data?.file?.url,Array.isArray(data?.files)?data.files[0]?.url:null,
    headers?.get?.('location'),text.startsWith('https://')?text:null
  ].filter(Boolean);
  if(!candidates.length)throw new Error('WRITE_REMOTE_URL_MISSING');
  return publicHttps(new URL(String(candidates[0]),base).toString(),'WRITE_REMOTE_URL').toString();
}
async function fetchOnceManual(url,options={},ms=10000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(url,{...options,redirect:'manual',signal:controller.signal});}
  finally{clearTimeout(timer);}
}
const TELEGRAPH_ACCOUNT_KEY='shardvault/provider-state/telegraph-account.json';
async function readTelegraphAccessToken(env){
  if(!env?.MEDIA_BUCKET?.get)return null;
  try{
    const body=await env.MEDIA_BUCKET.get(TELEGRAPH_ACCOUNT_KEY);
    if(!body)return null;
    const data=JSON.parse(await body.text());
    const token=String(data?.access_token||'').trim();
    return token||null;
  }catch{return null;}
}
async function writeTelegraphAccessToken(env,token){
  if(!env?.MEDIA_BUCKET?.put||!token)return;
  await env.MEDIA_BUCKET.put(TELEGRAPH_ACCOUNT_KEY,JSON.stringify({access_token:String(token),updated_at:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'}});
}
function safeProviderError(value){
  return String(value||'UNKNOWN').toUpperCase().replace(/[^A-Z0-9_-]+/g,'_').slice(0,96)||'UNKNOWN';
}
function telegraphFloodWaitMs(value){
  const match=/FLOOD[_ -]?WAIT[_ -]?(\d+)/i.exec(String(value||''));
  if(!match)return 0;
  return Math.min(30000,(Math.max(1,Number(match[1])||1)+1)*1000);
}
async function telegraphAccessToken(env,seed='melshardvault'){
  const cached=await readTelegraphAccessToken(env);
  if(cached)return cached;
  const accountBody=new URLSearchParams({
    short_name:('mel'+String(seed||'').replace(/[^a-zA-Z0-9]/g,'')).slice(0,32)||'melshardvault',
    author_name:'MEL ShardVault'
  });
  const response=await fetchTimed('https://api.telegra.ph/createAccount',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:accountBody.toString()},15000);
  if(!response.ok)throw new Error('TELEGRAPH_ACCOUNT_HTTP_'+response.status);
  const data=await response.json().catch(()=>null);
  const token=String(data?.result?.access_token||'').trim();
  if(data?.ok!==true||!token)throw new Error('TELEGRAPH_ACCOUNT_'+safeProviderError(data?.error||'TOKEN_MISSING'));
  await writeTelegraphAccessToken(env,token);
  return token;
}
async function candidateWrite(c,url,payload,objectId,env){
  if(c.adapter==='catbox'){
    const form=new FormData();
    form.append('reqtype','fileupload');
    form.append('fileToUpload',new Blob([payload],{type:'application/octet-stream'}),objectId+'.bin');
    const r=await fetchTimed(url,{method:'POST',body:form},15000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const remote=String(await r.text()).trim();
    return {readUrl:publicHttps(remote,'CATBOX_READ').toString()};
  }
  if(c.adapter==='temp_sh'){
    const form=new FormData();
    form.append('file',new Blob([payload],{type:'application/octet-stream'}),objectId+'.bin');
    const r=await fetchTimed(url,{method:'POST',body:form},12000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const remote=String(await r.text()).trim();
    return {readUrl:publicHttps(remote,'TEMP_SH_READ').toString()};
  }
  if(c.adapter==='zero_x0_binary'){
    const endpoint=fixedApiUrl(url),form=new FormData();
    form.append('file',new Blob([payload],{type:'application/octet-stream'}),objectId+'.bin');
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'accept':'text/plain','user-agent':'MEL-ShardVault/1.0'},body:form},20000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const remote=String(await r.text()).trim();
    return {readUrl:publicHttps(remote,'ZERO_X0_READ').toString()};
  }
  if(c.adapter==='dpaste_org_b64'){
    const endpoint=fixedApiUrl(url),form=new FormData();
    form.append('format','url');
    form.append('content',b64u(payload));
    form.append('lexer','_text');
    form.append('expires','never');
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'accept':'text/plain','user-agent':'MEL-ShardVault/1.0'},body:form},20000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const page=publicHttps(String(await r.text()).trim(),'DPASTE_ORG_PAGE').toString().replace(/\/$/,'');
    return {readUrl:publicHttps(page+'/raw/','DPASTE_ORG_READ').toString()};
  }
  if(c.adapter==='pastebin_ai_b64'){
    const endpoint=fixedApiUrl(url);
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({title:objectId,content:b64u(payload),language:'plaintext',visibility:'unlisted',expiration:'1y'})},12000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const raw=await r.text();
    return {readUrl:responseRemoteUrl(raw,r.headers,endpoint)};
  }
  if(c.adapter==='dpaste_b64'){
    const current=fixedApiUrl(url),body=new URLSearchParams({content:b64u(payload),expiry_days:'365'});
    let r=await fetchTimed(current,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','user-agent':'MEL-ShardVault/1.0','accept':'text/plain'},body:body.toString()},15000);
    let endpoint=current;
    if(r.status===400||r.status===404||r.status===405){
      endpoint='https://dpaste.com/api/';
      r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','user-agent':'MEL-ShardVault/1.0','accept':'text/plain'},body:body.toString()},15000);
    }
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const raw=await r.text(),page=responseRemoteUrl(raw,r.headers,endpoint);
    return {readUrl:page.endsWith('.txt')?page:page.replace(/\/$/,'')+'.txt'};
  }
  if(c.adapter==='pastemyst_b64'){
    const endpoint=fixedApiUrl(url);
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:JSON.stringify({title:objectId,expiresIn:'1y',isPrivate:false,isPublic:false,pasties:[{language:'Plain Text',title:'shard.txt',code:b64u(payload)}]})},12000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const data=await r.json().catch(()=>null),id=String(data?._id||data?.id||'').trim();
    if(!id)throw new Error('WRITE_REMOTE_ID_MISSING');
    return {readUrl:publicHttps('https://paste.myst.rs/api/v2/paste/'+encodeURIComponent(id),'PASTEMYST_READ').toString()};
  }
  if(c.adapter==='onec3_b64'){
    const endpoint=fixedApiUrl(url),form=new FormData();
    form.append('content',b64u(payload));
    form.append('expires','31536000');
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:form},30000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const raw=await r.text();
    return {readUrl:responseRemoteUrl(raw,r.headers,endpoint)};
  }
  if(c.adapter==='msk_paste_b64'){
    const endpoint=fixedApiUrl(url);
    const r=await fetchRateAware(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({content:b64u(payload),title:objectId,language:'plaintext',expiresIn:'1y',burnAfterRead:false})},12000,4,10000,30000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const raw=await r.text();
    return {readUrl:responseRemoteUrl(raw,r.headers,endpoint)};
  }
  if(c.adapter==='pastebox_b64'){
    const endpoint=fixedApiUrl(url);
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({content:b64u(payload),title:objectId,language:'plaintext',content_type:'memory',expiration:'3M',exposure:'unlisted',source:'agent',agent_name:'MEL-ShardVault'})},12000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const raw=await r.text();
    return {readUrl:responseRemoteUrl(raw,r.headers,endpoint)};
  }
  if(c.adapter==='pastehtml_b64'){
    const endpoint=fixedApiUrl(url);
    const body='<pre data-mel-shard="1">'+b64u(payload)+'</pre>';
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'text/html','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body},15000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const data=await r.json().catch(()=>null),raw=String(data?.raw_url||'').trim();
    if(!raw)throw new Error('WRITE_REMOTE_URL_MISSING');
    return {readUrl:publicHttps(raw,'PASTEHTML_READ').toString()};
  }
  if(c.adapter==='pastegg_b64'){
    const endpoint=fixedApiUrl(url);
    const body={
      name:objectId,
      visibility:'unlisted',
      files:[{name:'shard.bin',content:{format:'base64',content:b64(payload)}}]
    };
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:JSON.stringify(body)},15000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const data=await r.json().catch(()=>null),id=String(data?.result?.id||data?.id||'').trim();
    if(!id)throw new Error('WRITE_REMOTE_ID_MISSING');
    return {readUrl:publicHttps('https://api.paste.gg/v1/pastes/'+encodeURIComponent(id)+'?full=true','PASTEGG_READ').toString()};
  }
  if(c.adapter==='markdownpaste_b64'){
    const endpoint=fixedApiUrl(url);
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:JSON.stringify({content:b64u(payload)})},15000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const data=await r.json().catch(()=>null),id=String(data?.id||'').trim();
    if(!id)throw new Error('WRITE_REMOTE_ID_MISSING');
    return {readUrl:publicHttps('https://markdownpasteit.vercel.app/api/paste/'+encodeURIComponent(id),'MARKDOWNPASTE_READ').toString()};
  }
  if(c.adapter==='udrop_dev_b64'){
    const endpoint=fixedApiUrl(url);
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'text/plain; charset=utf-8','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:b64u(payload)},15000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const data=await r.json().catch(()=>null),base=String(data?.url||'').trim();
    if(!base)throw new Error('WRITE_REMOTE_URL_MISSING');
    return {readUrl:publicHttps(base.replace(/\/$/,'')+'/raw','UDROP_READ').toString()};
  }
  if(c.adapter==='waifuvault_b64'){
    const endpoint=fixedApiUrl(url),form=new FormData();
    form.append('file',new Blob([b64u(payload)],{type:'text/plain'}),objectId+'.txt');
    const r=await fetchTimed(endpoint,{method:'PUT',headers:{'accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:form},20000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const raw=await r.text();
    return {readUrl:responseRemoteUrl(raw,r.headers,endpoint)};
  }
  if(c.adapter==='telegraph_b64'){
    const token=await telegraphAccessToken(env,objectId);
    const endpoint=fixedApiUrl(url);
    const content=JSON.stringify([{tag:'pre',children:[b64u(payload)]}]);
    const pageBody=new URLSearchParams({
      access_token:token,
      title:objectId,
      author_name:'MEL ShardVault',
      content,
      return_content:'false'
    });
    let lastError='UNKNOWN';
    for(let attempt=0;attempt<3;attempt++){
      const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:pageBody.toString()},15000);
      if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
      const data=await r.json().catch(()=>null),path=String(data?.result?.path||'').trim();
      if(data?.ok===true&&path)return {readUrl:publicHttps('https://api.telegra.ph/getPage/'+encodeURIComponent(path)+'?return_content=true','TELEGRAPH_READ').toString()};
      lastError=String(data?.error||'UNKNOWN');
      const waitMs=telegraphFloodWaitMs(lastError);
      if(waitMs>0&&attempt<2){
        await new Promise(resolve=>setTimeout(resolve,waitMs));
        continue;
      }
      break;
    }
    throw new Error('WRITE_TELEGRAPH_'+safeProviderError(lastError));
  }
  if(c.adapter==='paste_c_net'){
    const endpoint=fixedApiUrl(url);
    const r=await fetchTimed(endpoint,{method:'PUT',headers:{'content-type':'application/octet-stream','accept':'application/json, */*','x-uuid':'1','user-agent':'curl/8.0 MEL-ShardVault/1.0'},body:payload},15000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const raw=await r.text();
    return {readUrl:responseRemoteUrl(raw,r.headers,endpoint)};
  }
  if(c.adapter==='fileditch_b64'){
    const encoded=b64u(payload);
    const r=await fetchTimed(url,{method:'PUT',headers:{'content-type':'text/plain; charset=utf-8','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:encoded},15000);
    if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
    const raw=await r.text();
    return {readUrl:responseRemoteUrl(raw,r.headers,url)};
  }
  const r=await fetchTimed(url,{method:c.method,headers:{'content-type':'application/octet-stream','x-mel-shardvault-probe':'1'},body:payload},10000);
  if(!r.ok)throw new Error('WRITE_HTTP_'+r.status);
  return {readUrl:url};
}
async function candidateRead(c,url){
  if(c.adapter!=='filebin')return fetchTimed(url,{method:'GET'},10000);
  let r=await fetchOnceManual(url,{method:'GET',headers:{'accept':'application/octet-stream'}},10000);
  if(r.status===200&&String(r.headers.get('content-type')||'').toLowerCase().includes('text/html')){
    const setCookie=String(r.headers.get('set-cookie')||'');
    const cookie=setCookie.split(';')[0].trim();
    if(cookie)r=await fetchOnceManual(url,{method:'GET',headers:{'accept':'application/octet-stream','cookie':cookie}},10000);
  }
  if([301,302,303,307,308].includes(r.status)){
    const location=r.headers.get('location');
    if(!location)throw new Error('READ_REDIRECT_LOCATION_MISSING');
    return fetchTimed(publicHttps(new URL(location,url).toString(),'CANDIDATE_READ_REDIRECT').toString(),{method:'GET'},10000);
  }
  return r;
}
async function candidateReadBytes(c,url){
  if(c.adapter==='pastemyst_b64'){
    const r=await fetchTimed(url,{method:'GET',headers:{'accept':'application/json'}},12000);
    if(!r.ok)throw new Error('READ_HTTP_'+r.status);
    const data=await r.json().catch(()=>null),code=String(data?.pasties?.[0]?.code||'').trim();
    if(!code)throw new Error('READ_CONTENT_MISSING');
    return unb64u(code);
  }
  if(['pastebin_ai_b64','dpaste_b64','dpaste_org_b64','onec3_b64','msk_paste_b64','pastebox_b64','fileditch_b64'].includes(c.adapter)){
    const r=await fetchTimed(url,{method:'GET',headers:{'accept':'text/plain,application/json','user-agent':'MEL-ShardVault/1.0'}},12000);
    if(!r.ok)throw new Error('READ_HTTP_'+r.status);
    const text=String(await r.text()).trim();
    if(!text)throw new Error('READ_CONTENT_MISSING');
    let encoded=text;
    if(c.adapter==='pastebox_b64'){
      try{const data=JSON.parse(text);encoded=String(data?.content??data?.data?.content??data?.paste?.content??text).trim();}catch{}
    }
    return unb64u(encoded);
  }
  if(c.adapter==='pastehtml_b64'){
    const r=await fetchTimed(url,{method:'GET',headers:{'accept':'text/plain','user-agent':'MEL-ShardVault/1.0'}},15000);
    if(!r.ok)throw new Error('READ_HTTP_'+r.status);
    const text=String(await r.text()).trim();
    const m=/^<pre data-mel-shard="1">([A-Za-z0-9_-]+)<\/pre>$/.exec(text);
    const encoded=String(m?.[1]||'').trim();
    if(!encoded)throw new Error('PASTEHTML_CONTENT_MISSING');
    return unb64u(encoded);
  }
  if(c.adapter==='pastegg_b64'){
    const r=await fetchTimed(url,{method:'GET',headers:{'accept':'application/json','user-agent':'MEL-ShardVault/1.0'}},15000);
    if(!r.ok)throw new Error('READ_HTTP_'+r.status);
    const data=await r.json().catch(()=>null);
    const content=data?.result?.files?.[0]?.content;
    const encoded=String(content?.content??content?.value??'').trim();
    if(!encoded)throw new Error('PASTEGG_CONTENT_MISSING');
    return unb64(encoded);
  }
  if(c.adapter==='markdownpaste_b64'){
    const r=await fetchTimed(url,{method:'GET',headers:{'accept':'application/json','user-agent':'MEL-ShardVault/1.0'}},15000);
    if(!r.ok)throw new Error('READ_HTTP_'+r.status);
    const data=await r.json().catch(()=>null),encoded=String(data?.content||'').trim();
    if(!encoded)throw new Error('MARKDOWNPASTE_CONTENT_MISSING');
    return unb64u(encoded);
  }
  if(c.adapter==='udrop_dev_b64'){
    const r=await fetchTimed(url,{method:'GET',headers:{'accept':'text/plain','user-agent':'MEL-ShardVault/1.0'}},15000);
    if(!r.ok)throw new Error('READ_HTTP_'+r.status);
    const encoded=String(await r.text()).trim();
    if(!encoded)throw new Error('UDROP_CONTENT_MISSING');
    return unb64u(encoded);
  }
  if(c.adapter==='waifuvault_b64'){
    const r=await fetchTimed(url,{method:'GET',headers:{'accept':'*/*','user-agent':'Mozilla/5.0 MEL-ShardVault/1.0'}},20000);
    if(!r.ok)throw new Error('READ_HTTP_'+r.status);
    const encoded=String(await r.text()).trim();
    if(!encoded)throw new Error('WAIFUVAULT_CONTENT_MISSING');
    return unb64u(encoded);
  }
  if(c.adapter==='telegraph_b64'){
    const r=await fetchTimed(url,{method:'GET',headers:{'accept':'application/json','user-agent':'MEL-ShardVault/1.0'}},15000);
    if(!r.ok)throw new Error('READ_HTTP_'+r.status);
    const data=await r.json().catch(()=>null);
    if(data?.ok!==true)throw new Error('TELEGRAPH_READ_FAILED');
    const collect=node=>{
      if(typeof node==='string')return node;
      if(Array.isArray(node))return node.map(collect).join('');
      if(node&&typeof node==='object')return collect(node.children||[]);
      return '';
    };
    const encoded=collect(data?.result?.content).trim();
    if(!encoded)throw new Error('TELEGRAPH_CONTENT_MISSING');
    return unb64u(encoded);
  }
  if(c.adapter==='paste_c_net'){
    const r=await fetchTimed(url,{method:'GET',headers:{'accept':'application/octet-stream, */*','user-agent':'curl/8.0 MEL-ShardVault/1.0'}},12000);
    if(!r.ok)throw new Error('READ_HTTP_'+r.status);
    return new Uint8Array(await r.arrayBuffer());
  }
  const r=await candidateRead(c,url);
  if(!r.ok)throw new Error('READ_HTTP_'+r.status);
  return new Uint8Array(await r.arrayBuffer());
}
async function validateDocumentedEvidence(c,{maxAgeDays=365}={}){
  if(c.evidenceMode!=='documented_api')return null;
  const reviewed=Date.parse(c.evidenceReviewedAt||'');
  if(!Number.isFinite(reviewed))throw new Error('DOCUMENTED_EVIDENCE_REVIEW_MISSING');
  if(Date.now()-reviewed>Math.max(1,maxAgeDays)*DAY)throw new Error('DOCUMENTED_EVIDENCE_REVIEW_STALE');
  const urls=Array.isArray(c.evidenceUrls)?c.evidenceUrls:[];
  if(!urls.length)throw new Error('DOCUMENTED_EVIDENCE_URL_MISSING');
  for(const raw of urls)publicHttps(raw,'DOCUMENTED_EVIDENCE');
  return {
    maxBytes:c.maxBytes,
    expectedRetentionDays:c.expectedRetentionDays,
    retentionModel:c.retentionModel||'fixed',
    baseRetentionDays:c.baseRetentionDays||c.expectedRetentionDays||0,
    refreshEveryDays:c.refreshEveryDays||0,
    fullReadRenewsRetention:c.fullReadRenewsRetention===true,
    evidenceVerification:'reviewed_documentation_plus_live_roundtrip'
  };
}
async function probe(c, requiredBytes, policyMaxAgeDays=180, env=null){
  const policyStart=Date.now();
  let authority;
  if(c.evidenceMode==='documented_api'){
    authority=await validateDocumentedEvidence(c);
  }else{
    const policy=await fetchTimed(c.policyUrl,{method:'GET',headers:{'accept':'application/json'}},8000);
    if(!policy.ok)throw new Error(`POLICY_HTTP_${policy.status}`);
    const policyBody=await policy.json().catch(()=>null);
    authority=validatePublicPolicy(c,policyBody,{requiredBytes,policyMaxAgeDays});
  }
  const policyLatency=Date.now()-policyStart;
  const payload=new Uint8Array(Math.min(authority.maxBytes,Math.max(256,Math.min(requiredBytes||256,1024))));crypto.getRandomValues(payload);
  const objectId=`mel-probe-${rid(12)}`;
  const url=publicHttps(c.urlTemplate.replaceAll('{objectId}',encodeURIComponent(objectId)),'AUTONOMOUS_TARGET').toString();
  const writeStart=Date.now();
  const write=await candidateWrite(c,url,payload,objectId,env);
  const writeLatency=Date.now()-writeStart;
  const readStart=Date.now();
  const got=await candidateReadBytes(c,write.readUrl);const readLatency=Date.now()-readStart;
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
  const minRetentionDays=Math.max(1,Number(env?.MEL_AUTONOMOUS_MIN_RETENTION_DAYS)||90);
  const eligibleRows=[],rejected=[...loaded.rejected];
  for(const c of loaded.candidates){const e=eligible(c,{requiredBytes,policyMaxAgeDays,minRetentionDays});if(e.ok)eligibleRows.push(c);else rejected.push({source:c.source,id:c.id,reason:e.reasons.join(',')});}
  const probed=[];
  for(const c of eligibleRows.slice(0,probeLimit)){try{probed.push(await probe(c,requiredBytes,policyMaxAgeDays,env));}catch(error){rejected.push({source:c.source,id:c.id,reason:String(error?.message||error)});}}
  const selected=choose(probed,selectionCount,maxPerOperator,maxPerProvider);
  const endpointView=(c,verification='reviewed_documentation_plus_live_roundtrip')=>({id:c.id,urlTemplate:c.urlTemplate,method:c.method,maxBytes:c.maxBytes,operatorDomain:c.operatorDomain,providerId:c.providerId,jurisdiction:c.jurisdiction,score:Number(c.score)||0,confidence:Number(c.confidence)||0,autonomous:true,authMode:c.authMode||'none',adapter:c.adapter||null,evidenceMode:c.evidenceMode||null,evidenceVerification:verification,expectedRetentionDays:c.expectedRetentionDays||0,retentionModel:c.retentionModel||'fixed',baseRetentionDays:c.baseRetentionDays||c.expectedRetentionDays||0,refreshEveryDays:c.refreshEveryDays||0,fullReadRenewsRetention:c.fullReadRenewsRetention===true,verifiedAt:c.probe?.checkedAt||null,probeLatencyMs:(Number(c.probe?.writeLatencyMs)||0)+(Number(c.probe?.readLatencyMs)||0)});
  return {
    selected:selected.map(endpointView),
    qualified:probed.map(endpointView),
    eligible:eligibleRows.map(c=>endpointView(c,'reviewed_documentation_candidate')),
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
