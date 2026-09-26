import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const auth='Basic '+btoa('test:test-only');
function request(text){
  return new Request('http://localhost/api/chat',{
    method:'POST',
    headers:{authorization:auth,'content-type':'application/json'},
    body:JSON.stringify({text,conversation_id:'knowledge-native'}),
  });
}
function webFetch(url){
  const u=String(url);
  if(u.includes('google.com/search')||u.includes('duckduckgo.com/html')){
    return Promise.resolve(new Response('<html><head><title>Search</title></head><body><a href="https://source-a.example/doc">A</a><a href="https://source-b.example/doc">B</a></body></html>',{status:200,headers:{'content-type':'text/html'}}));
  }
  if(u.includes('source-a.example'))return Promise.resolve(new Response('<html><head><title>A</title><meta name="description" content="preuve A"></head><body>A</body></html>',{status:200,headers:{'content-type':'text/html'}}));
  if(u.includes('source-b.example'))return Promise.resolve(new Response('<html><head><title>B</title><meta name="description" content="preuve B"></head><body>B</body></html>',{status:200,headers:{'content-type':'text/html'}}));
  return Promise.resolve(new Response('<html><head><title>Other</title></head><body>Other</body></html>',{status:200,headers:{'content-type':'text/html'}}));
}
function bucket(){const objects=new Map();return {objects,async put(k,v,o){objects.set(k,{value:String(v),opts:o});return {key:k}}}}

test('native chat can research, verify, classify, create a file and remember it from one natural request',async()=>{
  const DB=sqliteD1(),MEDIA_BUCKET=bucket();
  try{
    const env={
      DB,MEDIA_BUCKET,
      MELITURGOS_USER:'test',
      MELITURGOS_PASSWORD:'test-only',
      MEL_WEB_FETCH:webFetch,
      MEL_WEB_MIN_INTERVAL_MS:0,
      AI:{async run(){return {response:"Je ne peux pas faire de recherche sur internet ni créer de fichier."}}},
    };
    const response=await worker.fetch(request("cherche sur internet l'histoire de Guadix, vérifie avec plusieurs sources, crée un dossier, classe les informations et mémorise-les"),env);
    assert.equal(response.status,200);
    const data=await response.json();
    assert.ok(data.capability_used.includes('knowledge.research'));
    const tool=data.tool_results.find(x=>x.capability==='knowledge.research');
    assert.equal(tool.status,'SUCCEEDED');
    assert.equal(tool.result.artifact.storage,'D1+R2');
    assert.equal(tool.result.memory.stored,true);
    assert.equal(data.memory_stored,true);
    assert.match(data.text,/J’ai effectué la recherche/i);
    assert.doesNotMatch(data.text,/je ne peux pas/i);
    assert.equal(data.display?.type,'web_sources');
    assert.match(data.display?.title||'',/Sources/i);
    assert.equal(data.display?.items?.length,2);
    assert.equal(data.display.items[0].url,'https://source-a.example/doc');
    assert.equal(data.display.items[0].title,'A');
    assert.equal(data.display.items[0].snippet,'preuve A');
    const artifact=await DB.prepare('SELECT * FROM knowledge_artifacts ORDER BY created_at DESC LIMIT 1').first();
    assert.ok(artifact?.id);
    assert.equal(MEDIA_BUCKET.objects.size,1);
  }finally{DB.close()}
});
