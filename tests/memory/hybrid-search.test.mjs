import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { prepareGen2 } from '../../src/persistence/gen2-schema.js';
import { importChatGPTArchive } from '../../src/persistence/chatgpt-archive-importer.js';
import { createMemoryService } from '../../src/memory/memory-service.js';

function fakeSemanticProvider(texts) {
  return Promise.resolve(texts.map(text => {
    const value=String(text||'').toLowerCase();
    if (/orchard|fruit trees|pommiers|verger/.test(value)) return [1,0,0];
    if (/software|javascript|programme|code/.test(value)) return [0,1,0];
    return [0,0,1];
  }));
}

test('MEL-MEM-07 hybrid retrieval finds semantic evidence with no lexical overlap', async () => {
  const DB=sqliteD1();
  try {
    await prepareGen2(DB);
    await importChatGPTArchive({DB,MELITURGOS_USER:'adrien'}, [{
      id:'mem07-verger',
      title:'Projet Verger familial',
      collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:1},
      messages:[{
        id:'u1',role:'user',
        content:'Je cultive des pommiers et des poiriers dans le verger familial.',
        timestamp:100,
        attachments:[{id:'a1',name:'plan-verger.pdf',mime_type:'application/pdf',size_bytes:1200}]
      }],
    },{
      id:'mem07-code',
      title:'Projet logiciel',
      collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:1},
      messages:[{
        id:'u2',role:'user',
        content:'Je programme un service JavaScript pour automatiser le site.',
        timestamp:200,
        attachments:[{id:'a2',name:'notes-code.txt',mime_type:'text/plain',size_bytes:300}]
      }],
    }], {preview:false});

    const service=createMemoryService(DB,{semanticProvider:fakeSemanticProvider});
    const out=await service.retrieve({
      owner:'adrien',
      query:'orchard fruit trees',
      limit:5,
      sources:['archive_messages'],
    });

    assert.equal(out.semantic_used,true);
    assert.equal(out.retrieval,'unified-operational-memory-hybrid');
    assert.ok(out.results.length>=1);
    assert.match(out.results[0].content,/pommiers/i);
    assert.equal(out.results[0].retrieval,'hybrid');
    assert.ok(out.results[0].semantic_similarity>=0.99);
    assert.equal(out.results[0].similarity,0);
  } finally { DB.close(); }
});

test('MEL-MEM-07 supports exact search and structured filters for project, conversation, date and file type', async () => {
  const DB=sqliteD1();
  try {
    await prepareGen2(DB);
    await importChatGPTArchive({DB,MELITURGOS_USER:'adrien'}, [{
      id:'mem07-filter-a',
      title:'Projet Verger Alpha',
      collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:1},
      messages:[{
        id:'u1',role:'user',
        content:'Le repère exact memseventhoney concerne les pommiers.',
        timestamp:1000,
        attachments:[{id:'a1',name:'preuve.pdf',mime_type:'application/pdf',size_bytes:700}]
      }],
    },{
      id:'mem07-filter-b',
      title:'Projet Verger Beta',
      collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:1},
      messages:[{
        id:'u2',role:'user',
        content:'Le repère exact memseventhoney concerne le logiciel.',
        timestamp:2000,
        attachments:[{id:'a2',name:'preuve.txt',mime_type:'text/plain',size_bytes:500}]
      }],
    }], {preview:false});

    const service=createMemoryService(DB);
    const base=await service.retrieve({
      owner:'adrien',query:'memseventhoney',limit:10,sources:['archive_messages'],exact:true
    });
    assert.equal(base.semantic_used,false);
    assert.equal(base.results.length,2);
    assert.ok(base.results.every(row=>row.exact_match===true));

    const alpha=base.results.find(row=>/pommiers/.test(row.content));
    assert.ok(alpha);

    const filtered=await service.retrieve({
      owner:'adrien',
      query:'memseventhoney',
      limit:10,
      sources:['archive_messages'],
      exact:true,
      filters:{
        project:'Verger Alpha',
        conversation_id:alpha.conversation_id,
        from:900,
        to:1100,
        file_types:['pdf'],
      },
    });
    assert.equal(filtered.results.length,1);
    assert.equal(filtered.results[0].conversation_id,alpha.conversation_id);
    assert.match(filtered.results[0].content,/pommiers/);
    assert.equal(filtered.filters_applied.project,'Verger Alpha');

    const none=await service.retrieve({
      owner:'adrien',
      query:'memseventhoney',
      limit:10,
      sources:['archive_messages'],
      exact:true,
      filters:{file_types:['docx']},
    });
    assert.equal(none.results.length,0);
  } finally { DB.close(); }
});
