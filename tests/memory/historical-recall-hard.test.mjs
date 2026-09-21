import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { prepareGen2 } from '../../src/persistence/gen2-schema.js';
import { importChatGPTArchive } from '../../src/persistence/chatgpt-archive-importer.js';
import { createMemoryService } from '../../src/memory/memory-service.js';

test('MEL-MEM-09 retrieves difficult evidence across multiple historical conversations with origin preserved', async () => {
  const DB=sqliteD1();
  try {
    await prepareGen2(DB);
    const env={DB,MELITURGOS_USER:'adrien'};
    await importChatGPTArchive(env,[
      {
        id:'hard-a',
        title:'Ancienne décision projet',
        collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:1},
        messages:[{id:'u1',role:'user',content:'Le code repère orionviolet correspond à la décision de conserver le projet Atlas.',timestamp:100}]
      },
      {
        id:'hard-b',
        title:'Préférence durable',
        collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:1},
        messages:[{id:'u2',role:'user',content:'Pour orionviolet, je préfère travailler avec peu d’interactions et des tâches automatisées.',timestamp:200}]
      }
    ],{preview:false});

    const service=createMemoryService(DB);
    const result=await service.retrieve({
      owner:'adrien',
      query:'orionviolet',
      limit:10,
      semantic:false,
      sources:['archive_messages','memories']
    });

    const archiveRows=result.results.filter(row => (row.source||row.provenance?.table)==='archive_messages');
    assert.equal(archiveRows.length,2);
    assert.deepEqual(new Set(archiveRows.map(row=>row.provenance?.conversation_id)),new Set(['chatgpt:hard-a','chatgpt:hard-b']));
    assert.ok(archiveRows.every(row=>row.authority==='historical_user_message'));
    assert.ok(archiveRows.every(row=>row.provenance?.id));
  } finally { DB.close(); }
});

test('MEL-MEM-09 ranks a newer explicit user correction above older assistant output and preserves authority labels', async () => {
  const DB=sqliteD1();
  try {
    await prepareGen2(DB);
    const env={DB,MELITURGOS_USER:'adrien'};
    await importChatGPTArchive(env,[{
      id:'hard-conflict',
      title:'Correction historique',
      collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:2},
      messages:[
        {id:'a1',role:'assistant',content:'Le repère cuivreunique signifie que le projet est abandonné.',timestamp:100},
        {id:'u1',role:'user',content:'Correction : cuivreunique signifie que le projet continue finalement.',timestamp:300}
      ]
    }],{preview:false});

    const service=createMemoryService(DB);
    const result=await service.retrieve({
      owner:'adrien',
      query:'cuivreunique',
      limit:10,
      semantic:false,
      sources:['archive_messages']
    });

    assert.equal(result.results[0].role,'user');
    assert.equal(result.results[0].authority,'historical_user_message');
    assert.match(result.results[0].content,/continue finalement/);
    const assistant=result.results.find(row=>row.role==='assistant');
    assert.equal(assistant?.authority,'historical_assistant_output');
    assert.equal(assistant?.provenance?.conversation_id,'chatgpt:hard-conflict');
  } finally { DB.close(); }
});

test('MEL-MEM-09 exact filters can isolate one historical conversation without leaking another source', async () => {
  const DB=sqliteD1();
  try {
    await prepareGen2(DB);
    const env={DB,MELITURGOS_USER:'adrien'};
    await importChatGPTArchive(env,[
      {
        id:'filter-one',
        title:'Projet Grenat',
        collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:1},
        messages:[{id:'u1',role:'user',content:'Le marqueur grenatmemo appartient au projet Grenat.',timestamp:1000}]
      },
      {
        id:'filter-two',
        title:'Projet Saphir',
        collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:1},
        messages:[{id:'u2',role:'user',content:'Le marqueur grenatmemo apparaît aussi ici mais ne doit pas sortir avec le filtre.',timestamp:1100}]
      }
    ],{preview:false});

    const service=createMemoryService(DB);
    const result=await service.retrieve({
      owner:'adrien',
      query:'grenatmemo',
      limit:10,
      semantic:false,
      sources:['archive_messages'],
      filters:{conversation_id:'chatgpt:filter-one'}
    });
    assert.equal(result.results.length,1);
    assert.equal(result.results[0].provenance?.conversation_id,'chatgpt:filter-one');
  } finally { DB.close(); }
});
