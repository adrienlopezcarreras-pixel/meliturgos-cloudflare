import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { migrate } from '../src/persistence/migrations.js';
import { RAGService } from '../src/search/rag-service.js';
import { importChatGPTArchive } from '../src/persistence/chatgpt-archive-importer.js';

test('verified durable knowledge is reusable by normal RAG with provenance and authority', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    await DB.prepare('INSERT INTO knowledge_artifacts(id,owner,filename,title,kind,category,tags_json,query,content,content_sha256,verification_status,sources_json,r2_key,created_at,updated_at,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind('k1','adrien','guadix.md','Guadix','research','histoire','["guadix"]','histoire Guadix','Le repère archivistique zéphyrguadix apparaît dans ce dossier vérifié.','abc123','VERIFIED_MULTI_SOURCE','[{"url":"https://a.example"},{"url":"https://b.example"}]',null,1,2,'{}').run();
    const out=await RAGService.search(DB,'adrien','zéphyrguadix',{sources:['knowledge_artifacts'],limit:10});
    const row=out.results.find(x=>x.source==='knowledge_artifacts');
    assert.ok(row);
    assert.equal(row.authority,'verified_knowledge_artifact');
    assert.equal(row.provenance.filename,'guadix.md');
    assert.equal(row.provenance.sha256,'abc123');
  } finally { DB.close(); }
});

test('unverified knowledge is reusable but never mislabeled as verified', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    await DB.prepare('INSERT INTO knowledge_artifacts(id,owner,filename,title,kind,category,tags_json,query,content,content_sha256,verification_status,sources_json,r2_key,created_at,updated_at,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind('k2','adrien','note.md','Note','research','general','[]','repère test','Le repère ambreconnaissance reste à confirmer.','def456','EVIDENCE_SINGLE_SOURCE','[]',null,1,2,'{}').run();
    const out=await RAGService.search(DB,'adrien','ambreconnaissance',{sources:['knowledge_artifacts'],limit:10});
    const row=out.results.find(x=>x.source==='knowledge_artifacts');
    assert.equal(row.authority,'knowledge_artifact');
  } finally { DB.close(); }
});


test('collector-aware RAG preserves provenance and prioritizes user-authored history', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    await importChatGPTArchive({DB,MELITURGOS_USER:'adrien'}, [{
      id:'collector-rag-1',
      title:'Décision projet cobalt',
      collector:{source:'firefox_dom',version:'0.2.0',partial:false,totalMessages:2},
      messages:[
        {id:'u1',role:'user',content:'Pour le projet cobalt, je veux garder le phare comme repère principal.',timestamp:10},
        {id:'a1',role:'assistant',content:'Pour le projet cobalt, je propose de remplacer le phare par une tour.',timestamp:11},
      ],
    }], {preview:false});
    const out=await RAGService.searchCollector(DB,'adrien','projet cobalt phare',{limit:10});
    assert.equal(out.retrieval,'collector-lexical');
    assert.equal(out.results[0].role,'user');
    assert.equal(out.results[0].authority,'historical_user_message');
    assert.equal(out.results[0].conversation_title,'Décision projet cobalt');
    assert.equal(out.results[0].provenance.collector_source,'firefox_dom');
    assert.equal(out.results[0].provenance.collector_complete,true);
  } finally { DB.close(); }
});


test('collector RAG finds attachment metadata even when the message has no text', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    await importChatGPTArchive({DB,MELITURGOS_USER:'adrien'}, [{
      id:'collector-file-rag',
      title:'Fichier de référence',
      collector:{source:'firefox_dom',version:'0.6.2',partial:false,totalMessages:1},
      messages:[{
        id:'file-only',
        role:'user',
        content:'',
        timestamp:22,
        attachments:[{id:'asset-77',name:'plan-ultraviolet.pdf',mime_type:'application/pdf',size_bytes:2048}],
      }],
    }], {preview:false});
    const out=await RAGService.searchCollector(DB,'adrien','ultraviolet',{limit:10});
    assert.equal(out.total,1);
    assert.equal(out.results[0].id,'chatgpt:collector-file-rag:file-only');
    assert.equal(out.results[0].content,'');
    assert.equal(out.results[0].attachments.length,1);
    assert.equal(out.results[0].attachments[0].name,'plan-ultraviolet.pdf');
    assert.equal(out.results[0].provenance.attachment_count,1);
    assert.equal(out.results[0].provenance.attachment_binary_content_indexed,false);
  } finally { DB.close(); }
});
