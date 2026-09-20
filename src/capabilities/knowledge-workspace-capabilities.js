import InternetService from '../services/internet-service.js';

const txt=(v,n=4000)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,n);
const norm=v=>txt(v,8000).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const json=(v,f)=>{try{return JSON.parse(String(v||''))}catch{return f}};
const host=u=>{try{return new URL(String(u||'')).hostname.toLowerCase()}catch{return ''}};
const slug=(v,f='recherche')=>norm(v).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||f;

async function digest(v){
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v||'')));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

export function classifyKnowledgeQuery(query){
  const q=norm(query);
  let category='general';
  if(/\b(?:code|javascript|typescript|node|cloudflare|api|github|logiciel|ia|llm|agent|rag|mcp|modele)\b/.test(q))category='technique';
  else if(/\b(?:histoire|historique|guerre|siecle|archive|genealog|biograph|famille|ancetre)\b/.test(q))category='histoire';
  else if(/\b(?:entreprise|societe|marche|client|vente|seo|marketing|commerce|business)\b/.test(q))category='business';
  else if(/\b(?:science|etude|recherche|publication|medical|sante|biologie|physique|chimie)\b/.test(q))category='science';
  else if(/\b(?:roman|magazine|edition|ecriture|bd|musique|jeu|godot|creation)\b/.test(q))category='creation';
  const stop=new Set(['avec','pour','dans','cette','cela','comme','mais','plus','faire','peux','veux','dois','tout','tous','toute','toutes','quoi','comment','alors','encore','cherche','recherche','trouve','verifie','information','informations']);
  const tags=[...new Set((q.match(/[a-z0-9]{4,}/g)||[]).filter(x=>!stop.has(x)))].slice(0,12);
  return {category,tags};
}

export function verifyResearchSources(sources=[]){
  const rows=(Array.isArray(sources)?sources:[]).filter(x=>txt(x?.url,600));
  const hosts=[...new Set(rows.map(x=>host(x.url)).filter(Boolean))];
  const direct=rows.filter(x=>['DIRECT_SOURCE','OFFICIAL_SEED'].includes(String(x?.source_kind||'').toUpperCase()));
  const official=rows.filter(x=>String(x?.source_kind||'').toUpperCase()==='OFFICIAL_SEED');
  const directHosts=[...new Set(direct.map(x=>host(x.url)).filter(Boolean))];
  let status='UNVERIFIED';
  if(direct.length>=2&&directHosts.length>=2)status='VERIFIED_MULTI_SOURCE';
  else if(official.length>=1)status='VERIFIED_SINGLE_PRIMARY_SOURCE';
  else if(hosts.length>=2)status='EVIDENCE_MULTI_SOURCE';
  else if(rows.length>=1)status='EVIDENCE_SINGLE_SOURCE';
  return {status,source_count:rows.length,distinct_hosts:hosts.length,direct_source_count:direct.length,official_source_count:official.length,source_urls:rows.map(x=>String(x.url)).slice(0,20)};
}

async function ensureMemory(db){
  if(!db)return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'fact',
    content TEXT NOT NULL,
    importance REAL NOT NULL DEFAULT 0.8,
    confidence REAL NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'explicit_user',
    provenance TEXT NOT NULL DEFAULT 'native-chat',
    valid_until INTEGER,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    revoked_at INTEGER
  )`).run();
}

async function ensureTables(db){
  if(!db)throw Object.assign(new Error('DB_BINDING_MISSING'),{code:'DB_BINDING_MISSING'});
  await db.prepare(`CREATE TABLE IF NOT EXISTS knowledge_artifacts (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'research',
    category TEXT NOT NULL DEFAULT 'general',
    tags_json TEXT NOT NULL DEFAULT '[]',
    query TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
    sources_json TEXT NOT NULL DEFAULT '[]',
    r2_key TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_knowledge_artifacts_owner_updated ON knowledge_artifacts(owner, updated_at DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_knowledge_artifacts_filename ON knowledge_artifacts(filename)').run();
}

function researchMarkdown(query,title,classification,verification,research,createdAt){
  const a=['# '+title,'','- Requête : '+query,'- Date : '+new Date(createdAt).toISOString(),'- Catégorie : '+classification.category,'- Tags : '+(classification.tags.join(', ')||'aucun'),'- Vérification : '+verification.status,'- Sources : '+verification.source_count+' ('+verification.distinct_hosts+' hôte(s) distinct(s))','','## Synthèse de collecte','',txt(research?.summary||'Aucune synthèse disponible.',4000),'','## Sources',''];
  const sources=Array.isArray(research?.sources)?research.sources:[];
  if(!sources.length)a.push('Aucune source exploitable n’a été récupérée.');
  sources.forEach((s,i)=>{
    a.push('### '+(i+1)+'. '+txt(s?.title||s?.url||'Source',300));
    a.push('- URL : '+txt(s?.url,800));
    a.push('- Type : '+txt(s?.source_kind||'UNKNOWN',120));
    a.push('- Extrait : '+txt(s?.snippet||'',1200));
    if(s?.provenance?.fetched_at)a.push('- Récupéré : '+txt(s.provenance.fetched_at,120));
    a.push('');
  });
  a.push('## Note de vérification','','Ce dossier conserve les éléments de preuve et leur provenance. Le statut de vérification décrit la diversité et la nature des sources récupérées ; il ne transforme pas automatiquement chaque phrase des sources en fait vrai.');
  return a.join('\n');
}

async function persistArtifact(env,o){
  await ensureTables(env.DB);
  const id=crypto.randomUUID(),now=Date.now(),filename=txt(o.filename,180)||slug(o.title||o.query)+'.md';
  const hash=await digest(o.content);
  let r2Key=null;
  if(env?.MEDIA_BUCKET?.put){
    r2Key='knowledge/'+new Date(now).toISOString().slice(0,10)+'/'+id+'/'+filename;
    await env.MEDIA_BUCKET.put(r2Key,o.content,{httpMetadata:{contentType:'text/markdown; charset=utf-8'},customMetadata:{artifact_id:id,sha256:hash,kind:String(o.kind||'research').slice(0,40)}});
  }
  await env.DB.prepare('INSERT INTO knowledge_artifacts(id,owner,filename,title,kind,category,tags_json,query,content,content_sha256,verification_status,sources_json,r2_key,created_at,updated_at,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,env.MELITURGOS_USER||'owner',filename,txt(o.title,300),txt(o.kind,40)||'research',txt(o.category,80)||'general',JSON.stringify(o.tags||[]),txt(o.query,2000),String(o.content||'').slice(0,250000),hash,txt(o.verificationStatus,80)||'UNVERIFIED',JSON.stringify(o.sources||[]),r2Key,now,now,JSON.stringify(o.metadata||{})).run();
  return {id,filename,sha256:hash,r2_key:r2Key,storage:r2Key?'D1+R2':'D1',created_at:now};
}

async function rememberArtifact(env,artifact,meta){
  if(!env?.DB)return {stored:false,reason:'NO_DB'};
  try{
    await ensureMemory(env.DB);
    const c=['Dossier de recherche enregistré : '+meta.title+'.','Requête : '+meta.query+'.','Catégorie : '+meta.classification.category+'.','Tags : '+(meta.classification.tags.join(', ')||'aucun')+'.','Statut de vérification : '+meta.verification.status+'.','Artifact : '+artifact.id+' ('+artifact.filename+').','Sources : '+(meta.verification.source_urls.join(', ')||'aucune')+'.'].join(' ');
    await env.DB.prepare('INSERT INTO memories(kind,content,importance,confidence,source,provenance,valid_until,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind('research_reference',c.slice(0,8000),0.9,meta.verification.status.startsWith('VERIFIED')?0.95:meta.verification.status.startsWith('EVIDENCE')?0.7:0.4,'research_workspace','knowledge.research',null,JSON.stringify({artifact_id:artifact.id,filename:artifact.filename,category:meta.classification.category,tags:meta.classification.tags,verification_status:meta.verification.status,source_urls:meta.verification.source_urls}),Date.now()).run();
    return {stored:true,reason:'RESEARCH_REFERENCE',artifact_id:artifact.id};
  }catch(e){return {stored:false,reason:String(e?.code||e?.message||'MEMORY_STORE_FAILED')}}
}

async function researchAndSave(env,input){
  const query=txt(input?.query,2000);
  if(!query)throw Object.assign(new Error('QUERY_REQUIRED'),{code:'QUERY_REQUIRED'});
  const service=new InternetService(env);
  service.minInterval=Math.max(0,Math.min(5000,Number(env.MEL_WEB_MIN_INTERVAL_MS??1000)||0));
  const research=await service.research(query,Array.isArray(input?.domains)?input.domains.slice(0,3):null,Math.max(1,Math.min(3,Number(input?.depth)||2)),Array.isArray(input?.seed_urls)?input.seed_urls.slice(0,6):null);
  const classification=classifyKnowledgeQuery(query);
  if(txt(input?.category,80))classification.category=txt(input.category,80);
  if(Array.isArray(input?.tags)&&input.tags.length)classification.tags=[...new Set([...classification.tags,...input.tags.map(x=>txt(x,80)).filter(Boolean)])].slice(0,24);
  const verification=verifyResearchSources(research.sources);
  const saveFile=input?.save_file!==false,remember=input?.remember!==false&&saveFile;
  let artifact=null,memory={stored:false,reason:'NOT_REQUESTED'};
  if(saveFile){
    const title=txt(input?.title,300)||'Recherche — '+query;
    const filename=txt(input?.filename,180)||slug(query)+'.md';
    const createdAt=Date.now();
    const content=researchMarkdown(query,title,classification,verification,research,createdAt);
    artifact=await persistArtifact(env,{title,filename,kind:'research',query,content,category:classification.category,tags:classification.tags,verificationStatus:verification.status,sources:(research.sources||[]).map(s=>({url:s.url,title:s.title,source_kind:s.source_kind,provenance:s.provenance||null})),metadata:{research_provenance:research.provenance||null,discovery:research.discovery||null}});
    if(remember)memory=await rememberArtifact(env,artifact,{query,title,classification,verification});
  }
  return {ok:true,query,classification,verification,research:{summary:research.summary,citation:research.citation,citations_count:research.citations_count,sources:(research.sources||[]).map(s=>({url:s.url,title:s.title,snippet:s.snippet,source_kind:s.source_kind,provenance:s.provenance||null})),provenance:research.provenance||null},artifact,memory};
}

async function createFile(env,input){
  const title=txt(input?.title,300)||'Note MEL',content=String(input?.content||'').trim();
  if(!content)throw Object.assign(new Error('CONTENT_REQUIRED'),{code:'CONTENT_REQUIRED'});
  const classification=classifyKnowledgeQuery(title+' '+content.slice(0,2000));
  if(txt(input?.category,80))classification.category=txt(input.category,80);
  if(Array.isArray(input?.tags)&&input.tags.length)classification.tags=[...new Set([...classification.tags,...input.tags.map(x=>txt(x,80)).filter(Boolean)])].slice(0,24);
  const artifact=await persistArtifact(env,{title,filename:txt(input?.filename,180)||slug(title,'note')+'.md',kind:'note',content,category:classification.category,tags:classification.tags,metadata:{created_by:'knowledge.file.create'}});
  let memory={stored:false,reason:'NOT_REQUESTED'};
  if(input?.remember===true)memory=await rememberArtifact(env,artifact,{query:title,title,classification,verification:{status:'USER_PROVIDED',source_urls:[]}});
  return {ok:true,artifact,classification,memory};
}

async function searchArtifacts(env,input){
  await ensureTables(env.DB);
  const query=txt(input?.query,1000);
  if(!query)throw Object.assign(new Error('QUERY_REQUIRED'),{code:'QUERY_REQUIRED'});
  const limit=Math.max(1,Math.min(50,Number(input?.limit)||10)),like='%'+query.replace(/[%_]/g,'')+'%';
  const rows=await env.DB.prepare('SELECT id,filename,title,kind,category,tags_json,query,content_sha256,verification_status,sources_json,r2_key,created_at,updated_at,content FROM knowledge_artifacts WHERE owner=? AND (title LIKE ? OR filename LIKE ? OR query LIKE ? OR category LIKE ? OR tags_json LIKE ? OR content LIKE ?) ORDER BY updated_at DESC LIMIT ?')
    .bind(env.MELITURGOS_USER||'owner',like,like,like,like,like,like,limit).all();
  return {ok:true,query,count:(rows.results||[]).length,artifacts:(rows.results||[]).map(r=>({id:r.id,filename:r.filename,title:r.title,kind:r.kind,category:r.category,tags:json(r.tags_json,[]),verification_status:r.verification_status,source_count:json(r.sources_json,[]).length,r2_key:r.r2_key||null,sha256:r.content_sha256,updated_at:Number(r.updated_at||0),excerpt:txt(r.content,1000)}))};
}

async function readArtifact(env,input){
  await ensureTables(env.DB);
  const id=txt(input?.id,200),filename=txt(input?.filename,180);
  if(!id&&!filename)throw Object.assign(new Error('ARTIFACT_ID_OR_FILENAME_REQUIRED'),{code:'ARTIFACT_ID_OR_FILENAME_REQUIRED'});
  const r=id?await env.DB.prepare('SELECT * FROM knowledge_artifacts WHERE owner=? AND id=? LIMIT 1').bind(env.MELITURGOS_USER||'owner',id).first():await env.DB.prepare('SELECT * FROM knowledge_artifacts WHERE owner=? AND filename=? ORDER BY updated_at DESC LIMIT 1').bind(env.MELITURGOS_USER||'owner',filename).first();
  if(!r)throw Object.assign(new Error('KNOWLEDGE_ARTIFACT_NOT_FOUND'),{code:'KNOWLEDGE_ARTIFACT_NOT_FOUND',status:404});
  return {ok:true,artifact:{id:r.id,filename:r.filename,title:r.title,kind:r.kind,category:r.category,tags:json(r.tags_json,[]),query:r.query,content:r.content,sha256:r.content_sha256,integrity_ok:(await digest(r.content))===r.content_sha256,verification_status:r.verification_status,sources:json(r.sources_json,[]),r2_key:r.r2_key||null,created_at:Number(r.created_at||0),updated_at:Number(r.updated_at||0),metadata:json(r.metadata_json,{})}};
}

export function registerKnowledgeWorkspaceCapabilities(bus,env={}){
  const health=env.DB?'HEALTHY':'UNAVAILABLE';
  bus.discover({id:'knowledge.research',name:'Recherche, vérification et dossier durable',category:'knowledge',version:'1.0.0',provider:'mel',description:'Recherche le web public, classe les informations, mesure la diversité des preuves, crée un vrai dossier Markdown durable dans D1/R2 et peut enregistrer une référence mémoire.',input_schema:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:2000},domains:{type:'array',maxItems:3,items:{type:'string'}},seed_urls:{type:'array',maxItems:6,items:{type:'string'}},depth:{type:'integer',minimum:1,maximum:3},title:{type:'string'},filename:{type:'string'},category:{type:'string'},tags:{type:'array',maxItems:24,items:{type:'string'}},save_file:{type:'boolean'},remember:{type:'boolean'}},required:['query'],additionalProperties:false},output_schema:{type:'object',additionalProperties:true},risk:'MEDIUM',permissions:[],health,enabled:true},input=>researchAndSave(env,input||{}));
  bus.discover({id:'knowledge.search',name:'Rechercher dans les dossiers MEL',category:'knowledge',version:'1.0.0',provider:'mel',description:'Retrouve les dossiers et notes durables créés par MEL, avec classification, vérification, provenance et intégrité.',input_schema:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:1000},limit:{type:'integer',minimum:1,maximum:50}},required:['query'],additionalProperties:false},output_schema:{type:'object',additionalProperties:true},risk:'LOW',permissions:[],health,enabled:true},input=>searchArtifacts(env,input||{}));
  bus.discover({id:'knowledge.file.create',name:'Créer un fichier de connaissance',category:'knowledge',version:'1.0.0',provider:'mel',description:'Crée un fichier Markdown durable, classé et vérifiable dans D1/R2 à partir d’un contenu fourni.',input_schema:{type:'object',properties:{title:{type:'string'},filename:{type:'string'},content:{type:'string',minLength:1,maxLength:250000},category:{type:'string'},tags:{type:'array',maxItems:24,items:{type:'string'}},remember:{type:'boolean'}},required:['content'],additionalProperties:false},output_schema:{type:'object',additionalProperties:true},risk:'MEDIUM',permissions:[],health,enabled:true},input=>createFile(env,input||{}));
  bus.discover({id:'knowledge.file.read',name:'Lire et vérifier un fichier de connaissance',category:'knowledge',version:'1.0.0',provider:'mel',description:'Relit un fichier durable MEL et vérifie son SHA-256 avant utilisation.',input_schema:{type:'object',properties:{id:{type:'string'},filename:{type:'string'}},additionalProperties:false},output_schema:{type:'object',additionalProperties:true},risk:'LOW',permissions:[],health,enabled:true},input=>readArtifact(env,input||{}));
}

export const __knowledgeWorkspaceTest=Object.freeze({classifyKnowledgeQuery,verifyResearchSources});
