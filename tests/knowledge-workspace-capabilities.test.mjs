import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

function makeFetch(url){
  const u=String(url);
  if(u.includes('google.com/search')||u.includes('duckduckgo.com/html')){
    return Promise.resolve(new Response('<html><head><title>Search</title></head><body><a href="https://source-a.example/doc">A</a><a href="https://source-b.example/doc">B</a></body></html>',{status:200,headers:{'content-type':'text/html'}}));
  }
  if(u.includes('source-a.example')) return Promise.resolve(new Response('<html><head><title>Source A</title><meta name="description" content="Evidence A"></head><body>A</body></html>',{status:200,headers:{'content-type':'text/html'}}));
  if(u.includes('source-b.example')) return Promise.resolve(new Response('<html><head><title>Source B</title><meta name="description" content="Evidence B"></head><body>B</body></html>',{status:200,headers:{'content-type':'text/html'}}));
  return Promise.resolve(new Response('<html><head><title>Other</title></head><body>Other</body></html>',{status:200,headers:{'content-type':'text/html'}}));
}

function bucket(){
  const objects=new Map();
  return {
    objects,
    async put(key,value,opts){objects.set(key,{value:String(value),opts});return {key}},
  };
}

test('knowledge.research searches, verifies, classifies, stores a Markdown file and remembers it', async()=>{
  const DB=sqliteD1(),MEDIA_BUCKET=bucket();
  try{
    const runtime=createGen2Runtime({env:{DB,MEDIA_BUCKET,MELITURGOS_USER:'adrien',MEL_WEB_FETCH:makeFetch,MEL_WEB_MIN_INTERVAL_MS:0}});
    const result=await runtime.bus.execute('knowledge.research',{
      query:'histoire du projet test',
      depth:2,
      save_file:true,
      remember:true,
    },{owner:'adrien',permissions:[],requestId:'k1'});
    assert.equal(result.ok,true);
    assert.equal(result.verification.status,'VERIFIED_MULTI_SOURCE');
    assert.equal(result.classification.category,'histoire');
    assert.ok(result.artifact?.id);
    assert.equal(result.artifact.storage,'D1+R2');
    assert.equal(result.memory.stored,true);
    assert.equal(MEDIA_BUCKET.objects.size,1);
    const row=await DB.prepare('SELECT * FROM knowledge_artifacts WHERE id=?').bind(result.artifact.id).first();
    assert.equal(row.filename,result.artifact.filename);
    assert.match(row.content,/## Sources/);
    assert.equal(row.verification_status,'VERIFIED_MULTI_SOURCE');
    const mem=await DB.prepare("SELECT * FROM memories WHERE source='research_workspace' ORDER BY id DESC LIMIT 1").first();
    assert.match(mem.content,/Dossier de recherche enregistré/);
  }finally{DB.close()}
});

test('knowledge.search and knowledge.file.read reuse durable research with integrity verification', async()=>{
  const DB=sqliteD1(),MEDIA_BUCKET=bucket();
  try{
    const runtime=createGen2Runtime({env:{DB,MEDIA_BUCKET,MELITURGOS_USER:'adrien',MEL_WEB_FETCH:makeFetch,MEL_WEB_MIN_INTERVAL_MS:0}});
    const created=await runtime.bus.execute('knowledge.research',{query:'architecture agentique test',depth:2,save_file:true,remember:false},{owner:'adrien',permissions:[],requestId:'k2'});
    const found=await runtime.bus.execute('knowledge.search',{query:'architecture',limit:10},{owner:'adrien',permissions:[],requestId:'k3'});
    assert.equal(found.count,1);
    assert.equal(found.artifacts[0].id,created.artifact.id);
    const read=await runtime.bus.execute('knowledge.file.read',{id:created.artifact.id},{owner:'adrien',permissions:[],requestId:'k4'});
    assert.equal(read.artifact.integrity_ok,true);
    assert.match(read.artifact.content,/architecture agentique test/i);
  }finally{DB.close()}
});

test('knowledge.file.create creates a classified durable note', async()=>{
  const DB=sqliteD1(),MEDIA_BUCKET=bucket();
  try{
    const runtime=createGen2Runtime({env:{DB,MEDIA_BUCKET,MELITURGOS_USER:'adrien'}});
    const out=await runtime.bus.execute('knowledge.file.create',{title:'Note IA',filename:'note-ia.md',content:'Architecture IA et agents.',remember:true},{owner:'adrien',permissions:[],requestId:'k5'});
    assert.equal(out.ok,true);
    assert.equal(out.artifact.filename,'note-ia.md');
    assert.equal(out.classification.category,'technique');
    assert.equal(out.memory.stored,true);
  }finally{DB.close()}
});
