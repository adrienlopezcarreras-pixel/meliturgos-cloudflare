import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { migrate } from '../src/persistence/migrations.js';
import { RAGService } from '../src/search/rag-service.js';

test('verified durable knowledge is reusable by normal RAG with provenance and authority', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    await DB.prepare('INSERT INTO knowledge_artifacts(id,owner,filename,title,kind,category,tags_json,query,content,content_sha256,verification_status,sources_json,r2_key,created_at,updated_at,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind('k1','adrien','guadix.md','Guadix','research','histoire','["guadix"]','histoire Guadix','Le repère archivistique zéphyrguadix apparaît dans ce dossier vérifié.','abc123','VERIFIED_MULTI_SOURCE','[{"url":"https://a.example"},{"url":"https://b.example"}]',null,1,2,'{}').run();
    const out=await RAGService.search(DB,'adrien','zéphyrguadix',{limit:10});
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
    const out=await RAGService.search(DB,'adrien','ambreconnaissance',{limit:10});
    const row=out.results.find(x=>x.source==='knowledge_artifacts');
    assert.equal(row.authority,'knowledge_artifact');
  } finally { DB.close(); }
});
