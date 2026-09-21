import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { importChatGPTArchive } from '../../src/persistence/chatgpt-archive-importer.js';
import { createMemoryService } from '../../src/memory/memory-service.js';

const archive=[{
  id:'rebuild-parity',
  title:'Reconstruction mémoire',
  collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:2},
  messages:[
    {id:'u1',role:'user',content:'Le repère rebuildambre correspond à une décision historique stable.',timestamp:100},
    {id:'u2',role:'user',content:'Pour rebuildambre je préfère une exécution automatisée et traçable.',timestamp:200}
  ]
}];

async function buildSnapshot() {
  const DB=sqliteD1();
  const env={DB,MELITURGOS_USER:'adrien'};
  await importChatGPTArchive(env,archive,{preview:false});
  const service=createMemoryService(DB);
  const retrieval=await service.retrieve({
    owner:'adrien',
    query:'rebuildambre',
    limit:10,
    semantic:false,
    sources:['archive_messages','memories']
  });
  const candidates=(await DB.prepare(`
    SELECT id,conversation_id,message_id,content,confidence,source,status,created_at,
           provenance_json,metadata_json,observed_at,fragment,contradictions_json
    FROM memory_candidates
    ORDER BY id
  `).all()).results || [];
  const consolidated=await service.consolidate({limit:50});
  return {DB,retrieval,candidates,consolidated};
}

function stableRetrieval(rows=[]){
  return rows.map(row=>({
    id:String(row.id),
    content:String(row.content),
    authority:String(row.authority||''),
    conversation_id:String(row.provenance?.conversation_id||row.conversation_id||''),
    source:String(row.source||row.provenance?.table||'')
  })).sort((a,b)=>a.id.localeCompare(b.id));
}

function stableCandidates(rows=[]){
  return rows.map(row=>({
    id:row.id,
    conversation_id:row.conversation_id,
    message_id:row.message_id,
    content:row.content,
    confidence:Number(row.confidence),
    source:row.source,
    status:row.status,
    observed_at:Number(row.observed_at),
    fragment:row.fragment,
    provenance:JSON.parse(row.provenance_json||'{}'),
    contradictions:JSON.parse(row.contradictions_json||'[]')
  }));
}

test('MEL-MEM-10 rebuilds identical retrieval and provenance-rich candidates from the same archive', async () => {
  const first=await buildSnapshot();
  const second=await buildSnapshot();
  try {
    assert.deepEqual(stableRetrieval(second.retrieval.results),stableRetrieval(first.retrieval.results));
    assert.deepEqual(stableCandidates(second.candidates),stableCandidates(first.candidates));
    assert.deepEqual(second.consolidated.proposals,first.consolidated.proposals);
    assert.ok(first.consolidated.proposals.every(row=>row.provenance?.fragments?.length>0));
    assert.ok(first.consolidated.proposals.every(row=>row.provenance?.observed_at?.length>0));
  } finally {
    first.DB.close();
    second.DB.close();
  }
});
