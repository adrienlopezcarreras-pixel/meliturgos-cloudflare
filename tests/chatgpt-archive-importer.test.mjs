import test from 'node:test';
import assert from 'node:assert/strict';
import { getChatGPTImportStatus, importChatGPTArchive, normalizeChatGPTArchive, recordChatGPTCollectorCoverage } from '../src/persistence/chatgpt-archive-importer.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import worker from '../src/index.js';

const sample = [{
  id: 'conv-1',
  title: 'Projet MEL',
  create_time: 1700000000,
  mapping: {
    a: { id: 'a', parent: null, message: { id: 'm1', author: { role: 'user' }, create_time: 1700000001, content: { parts: ['Bonjour MEL'] } } },
    b: { id: 'b', parent: 'a', message: { id: 'm2', author: { role: 'assistant' }, create_time: 1700000002, content: { parts: ['Bonjour Adrien'] } } }
  }
}];

test('normalizer recognizes conversations.json mapping and preserves provenance-ready ids', () => {
  const out = normalizeChatGPTArchive(sample);
  assert.equal(out.summary.conversations, 1);
  assert.equal(out.summary.messages, 2);
  assert.equal(out.conversations[0].id, 'chatgpt:conv-1');
  assert.equal(out.conversations[0].messages[0].role, 'user');
  assert.equal(out.conversations[0].messages[1].content, 'Bonjour Adrien');
});

test('explicit archive endpoint supports safe preview without touching D1', async () => {
  const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
  const request = new Request('https://mel.test/api/gen2/import/chatgpt-archive', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ archive: sample, preview: true })
  });
  const response = await worker.fetch(request, { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test' }, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.preview, true);
  assert.equal(body.conversations, 1);
  assert.equal(body.messages, 2);
});


test('ChatGPT import status is fail-closed when persistent DB is unavailable', async () => {
  const status = await getChatGPTImportStatus({});
  assert.equal(status.ok, false);
  assert.equal(status.status, 'UNAVAILABLE');
  assert.equal(status.db_bound, false);
  assert.equal(status.messages, 0);
});

test('authenticated ChatGPT import status endpoint exposes server-side ingestion state', async () => {
  const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
  const request = new Request('https://mel.test/api/gen2/import/chatgpt-status', {
    method: 'GET',
    headers: { authorization: auth }
  });
  const response = await worker.fetch(request, { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test' }, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'UNAVAILABLE');
  assert.equal(body.db_bound, false);
});

test('server status distinguishes partial Collector receipts from a later complete capture', async () => {
  const DB = sqliteD1();
  try {
    const env = { DB, MELITURGOS_USER: 'adrien' };
    const partial = [{
      id: 'collector-completeness',
      title: 'Conversation longue',
      collector: { source: 'firefox_dom', version: '0.5.1', partial: true, totalMessages: 4 },
      messages: [
        { id: 'm3', role: 'user', content: 'troisième', timestamp: 3 },
        { id: 'm4', role: 'assistant', content: 'quatrième', timestamp: 4 },
      ],
    }];

    const first = await importChatGPTArchive(env, partial, { preview: false });
    assert.equal(first.conversations, 1);
    let status = await getChatGPTImportStatus(env);
    assert.equal(status.tracked_conversations, 1);
    assert.equal(status.complete_conversations, 0);
    assert.equal(status.partial_conversations, 1);
    assert.equal(status.unknown_completeness, 0);
    assert.equal(status.full_archive_confirmed, false);
    assert.equal(status.expected_messages, 4);

    const full = [{
      id: 'collector-completeness',
      title: 'Conversation longue',
      collector: { source: 'firefox_dom', version: '0.5.1', partial: false, totalMessages: 4 },
      messages: [
        { id: 'm1', role: 'user', content: 'premier', timestamp: 1 },
        { id: 'm2', role: 'assistant', content: 'deuxième', timestamp: 2 },
        { id: 'm3', role: 'user', content: 'troisième', timestamp: 3 },
        { id: 'm4', role: 'assistant', content: 'quatrième', timestamp: 4 },
      ],
    }];

    await importChatGPTArchive(env, full, { preview: false });
    status = await getChatGPTImportStatus(env);
    assert.equal(status.complete_conversations, 1);
    assert.equal(status.partial_conversations, 0);
    assert.equal(status.unknown_completeness, 0);
    assert.equal(status.server_archive_complete, true);
    assert.equal(status.collector_inventory_confirmed, false);
    assert.equal(status.full_archive_confirmed, false);
    assert.equal(status.expected_messages, 4);
  } finally {
    DB.close();
  }
});

test('a smaller later DOM snapshot cannot falsely downgrade expected Collector completeness', async () => {
  const DB = sqliteD1();
  try {
    const env = { DB, MELITURGOS_USER: 'adrien' };
    await importChatGPTArchive(env, [{
      id: 'collector-no-downgrade',
      title: 'Conversation incomplète',
      collector: { source: 'firefox_dom', version: '0.5.1', partial: true, totalMessages: 6 },
      messages: [
        { id: 'm5', role: 'user', content: 'cinquième', timestamp: 5 },
        { id: 'm6', role: 'assistant', content: 'sixième', timestamp: 6 },
      ],
    }], { preview: false });

    await importChatGPTArchive(env, [{
      id: 'collector-no-downgrade',
      title: 'Conversation incomplète',
      collector: { source: 'firefox_dom', version: '0.5.1', partial: false, totalMessages: 4 },
      messages: [
        { id: 'm1', role: 'user', content: 'premier', timestamp: 1 },
        { id: 'm2', role: 'assistant', content: 'deuxième', timestamp: 2 },
        { id: 'm3', role: 'user', content: 'troisième', timestamp: 3 },
        { id: 'm4', role: 'assistant', content: 'quatrième', timestamp: 4 },
      ],
    }], { preview: false });

    const status = await getChatGPTImportStatus(env);
    assert.equal(status.expected_messages, 6);
    assert.equal(status.complete_conversations, 0);
    assert.equal(status.partial_conversations, 1);
    assert.equal(status.full_archive_confirmed, false);
  } finally {
    DB.close();
  }
});


test('collector coverage manifest is required before full archive completeness can be confirmed', async () => {
  const DB = sqliteD1();
  try {
    const env = { DB, MELITURGOS_USER: 'adrien' };
    await importChatGPTArchive(env, [{ id:'coverage-a',title:'A',collector:{source:'firefox_dom',version:'0.6.2',partial:false,totalMessages:2},messages:[{id:'m1',role:'user',content:'un',timestamp:1},{id:'m2',role:'assistant',content:'deux',timestamp:2}] }], { preview:false });
    let status=await getChatGPTImportStatus(env);
    assert.equal(status.server_archive_complete,true);
    assert.equal(status.collector_inventory_confirmed,false);
    assert.equal(status.full_archive_confirmed,false);
    const receipt=await recordChatGPTCollectorCoverage(env,{collector_version:'0.6.2',deep_discovery_done:true,discovered_count:1,captured_at:123,items:[{id:'coverage-a',status:'DONE',messages:2}]});
    assert.equal(receipt.ok,true);assert.match(receipt.manifest_sha256,/^[0-9a-f]{64}$/);
    status=await getChatGPTImportStatus(env);
    assert.equal(status.collector_inventory_confirmed,true);
    assert.equal(status.collector_inventory.missing_done_from_archive,0);
    assert.equal(status.collector_inventory.unresolved_recoverable,0);
    assert.equal(status.full_archive_confirmed,true);
    await recordChatGPTCollectorCoverage(env,{collector_version:'0.6.2',deep_discovery_done:true,discovered_count:2,items:[{id:'coverage-a',status:'DONE',messages:2},{id:'coverage-b',status:'QUEUED',messages:0}]});
    status=await getChatGPTImportStatus(env);
    assert.equal(status.collector_inventory_confirmed,false);
    assert.equal(status.collector_inventory.unresolved_recoverable,1);
    assert.equal(status.full_archive_confirmed,false);
  } finally { DB.close(); }
});

test('authenticated collector coverage endpoint persists a bounded coverage proof', async () => {
  const DB=sqliteD1();
  try {
    const auth='Basic '+Buffer.from('adrien:test').toString('base64');
    const request=new Request('https://mel.test/api/gen2/import/chatgpt-coverage',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({coverage:{collector_version:'0.6.2',deep_discovery_done:true,discovered_count:1,items:[{id:'abc',status:'UNAVAILABLE',messages:0}]}})});
    const response=await worker.fetch(request,{DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'},{});
    assert.equal(response.status,200);const body=await response.json();assert.equal(body.ok,true);assert.equal(body.deep_discovery_done,true);assert.equal(body.discovered_count,1);
  } finally { DB.close(); }
});


test('attachment-only ChatGPT messages are preserved with bounded searchable descriptors', async () => {
  const DB=sqliteD1();
  try {
    const env={DB,MELITURGOS_USER:'adrien'};
    const archive=[{
      id:'attachment-only',
      title:'Pièce jointe',
      mapping:{
        n1:{id:'n1',parent:null,message:{
          id:'file-msg',
          author:{role:'user'},
          create_time:1700000100,
          content:{parts:[]},
          metadata:{attachments:[{id:'file-1',name:'plan-ultraviolet.pdf',mime_type:'application/pdf',size_bytes:1234}]}
        }}
      }
    }];
    const normalized=normalizeChatGPTArchive(archive);
    assert.equal(normalized.summary.messages,1);
    assert.equal(normalized.conversations[0].messages[0].content,'');
    assert.equal(normalized.conversations[0].messages[0].attachments.length,1);
    assert.equal(normalized.conversations[0].messages[0].attachments[0].name,'plan-ultraviolet.pdf');

    const result=await importChatGPTArchive(env,archive,{preview:false});
    assert.equal(result.inserted,1);
    const row=await DB.prepare("SELECT content,attachments_json,metadata FROM archive_messages WHERE id=?").bind('chatgpt:attachment-only:file-msg').first();
    assert.equal(row.content,'');
    const attachments=JSON.parse(row.attachments_json);
    assert.equal(attachments.length,1);
    assert.equal(attachments[0].mime_type,'application/pdf');
    assert.equal(attachments[0].binary_content_indexed,false);
    const metadata=JSON.parse(row.metadata);
    assert.equal(metadata.attachment_count,1);

    const status=await getChatGPTImportStatus(env);
    assert.equal(status.attachment_index.messages_with_attachments,1);
    assert.equal(status.attachment_index.descriptors,1);
    assert.equal(status.attachment_index.metadata_searchable,true);
    assert.equal(status.attachment_index.binary_content_indexed,false);
  } finally { DB.close(); }
});


test('completeness proof scans beyond 2000 archived conversations and requires a receipt for every one', async () => {
  const DB = sqliteD1();
  try {
    const env = { DB, MELITURGOS_USER: 'adrien' };
    const items = Array.from({ length: 2001 }, (_, index) => ({
      id: \`bulk-\${index + 1}\`,
      status: 'DONE',
      messages: 1,
    }));
    await recordChatGPTCollectorCoverage(env, {
      collector_version: '0.6.5',
      deep_discovery_done: true,
      discovered_count: items.length,
      items,
    });

    await DB.prepare(\`WITH RECURSIVE seq(n) AS (
        SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 2001
      )
      INSERT INTO conversations(id,owner,title,metadata,created_at,updated_at)
      SELECT 'chatgpt:bulk-' || n, 'adrien', 'Bulk ' || n,
        '{"chatgpt_import":{"complete":true,"partial":false,"expected_messages":1}}',
        1, 1 FROM seq\`).run();

    await DB.prepare(\`WITH RECURSIVE seq(n) AS (
        SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 2001
      )
      INSERT INTO archive_messages(id,conversation_id,role,content,timestamp,provenance,metadata)
      SELECT 'bulk-message-' || n, 'chatgpt:bulk-' || n, 'user', 'message ' || n, n, 'chatgpt_export', '{}'
      FROM seq\`).run();

    let status = await getChatGPTImportStatus(env);
    assert.equal(status.tracked_conversations, 2001);
    assert.equal(status.complete_conversations, 2001);
    assert.equal(status.unknown_completeness, 0);
    assert.equal(status.collector_inventory.archived_missing_from_inventory, 0);
    assert.equal(status.collector_inventory.done_archived_count_match, true);
    assert.equal(status.full_archive_confirmed, true);

    await DB.prepare("UPDATE conversations SET metadata='{}' WHERE id='chatgpt:bulk-2001'").run();
    status = await getChatGPTImportStatus(env);
    assert.equal(status.tracked_conversations, 2000);
    assert.equal(status.unknown_completeness, 1);
    assert.equal(status.server_archive_complete, false);
    assert.equal(status.full_archive_confirmed, false);
  } finally { DB.close(); }
});

test('server completeness requires stored message count to reach each receipt expected count', async () => {
  const DB = sqliteD1();
  try {
    const env = { DB, MELITURGOS_USER: 'adrien' };
    await recordChatGPTCollectorCoverage(env, {
      collector_version: '0.6.5',
      deep_discovery_done: true,
      discovered_count: 1,
      items: [{ id: 'underfilled-receipt', status: 'DONE', messages: 1 }],
    });
    await DB.prepare(\`INSERT INTO conversations(id,owner,title,metadata,created_at,updated_at)
      VALUES ('chatgpt:underfilled-receipt','adrien','Underfilled',
      '{"chatgpt_import":{"complete":true,"partial":false,"expected_messages":2}}',1,1)\`).run();
    await DB.prepare(\`INSERT INTO archive_messages(id,conversation_id,role,content,timestamp,provenance,metadata)
      VALUES ('underfilled-message','chatgpt:underfilled-receipt','user','only one',1,'chatgpt_export','{}')\`).run();

    const status = await getChatGPTImportStatus(env);
    assert.equal(status.underfilled_conversations, 1);
    assert.equal(status.missing_expected_messages, 1);
    assert.equal(status.server_archive_complete, false);
    assert.equal(status.full_archive_confirmed, false);
  } finally { DB.close(); }
});

test('collector inventory cannot omit an already archived conversation', async () => {
  const DB = sqliteD1();
  try {
    const env = { DB, MELITURGOS_USER: 'adrien' };
    await importChatGPTArchive(env, [
      { id:'inventory-a', title:'A', collector:{source:'firefox_dom',version:'0.6.5',partial:false,totalMessages:1}, messages:[{id:'m1',role:'user',content:'A',timestamp:1}] },
      { id:'inventory-b', title:'B', collector:{source:'firefox_dom',version:'0.6.5',partial:false,totalMessages:1}, messages:[{id:'m1',role:'user',content:'B',timestamp:2}] },
    ], { preview:false });
    await recordChatGPTCollectorCoverage(env, {
      collector_version: '0.6.5',
      deep_discovery_done: true,
      discovered_count: 1,
      items: [{ id:'inventory-a', status:'DONE', messages:1 }],
    });

    const status = await getChatGPTImportStatus(env);
    assert.equal(status.server_archive_complete, true);
    assert.equal(status.collector_inventory.archived_missing_from_inventory, 1);
    assert.equal(status.collector_inventory.done_archived_count_match, false);
    assert.equal(status.collector_inventory_confirmed, false);
    assert.equal(status.full_archive_confirmed, false);
  } finally { DB.close(); }
});
