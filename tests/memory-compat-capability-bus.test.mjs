import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

test('memory status and export are LOW-risk CapabilityBus tools', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const byId = new Map(runtime.bus.list().map(row => [row.id, row]));
  assert.equal(byId.get('memory.status')?.risk, 'LOW');
  assert.equal(byId.get('memory.export')?.risk, 'LOW');

  const context = { owner: 'test', permissions: [], requestId: 'memory-compat-test' };
  const status = await runtime.bus.execute('memory.status', {}, context);
  assert.equal(status.status, 'UNAVAILABLE');
  assert.equal(status.db_bound, false);
  const exported = await runtime.bus.execute('memory.export', {}, context);
  assert.equal(exported.format, 'meliturgos-memory-export');
  assert.deepEqual(exported.memories, []);
  assert.deepEqual(exported.conversations, []);
});

test('memory.consolidate is a LOW-risk read/proposal capability and never confirms memory', async () => {
  const db = sqliteD1();
  try {
    await db.prepare(`CREATE TABLE memory_candidates (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`).run();
    await db.prepare(`CREATE TABLE memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      importance REAL NOT NULL,
      confidence REAL NOT NULL,
      valid_from INTEGER,
      valid_until INTEGER,
      supersedes_id INTEGER,
      source TEXT NOT NULL,
      provenance TEXT NOT NULL,
      metadata TEXT NOT NULL,
      fingerprint TEXT
    )`).run();
    await db.prepare('INSERT INTO memory_candidates VALUES (?,?,?,?,?,?,?,?)')
      .bind('c1','conv','m1','Projet mémoire',0.55,'chat','PENDING',1).run();
    await db.prepare('INSERT INTO memory_candidates VALUES (?,?,?,?,?,?,?,?)')
      .bind('c2','conv','m2','projet   mémoire',0.82,'archive','PENDING',2).run();

    const runtime = createGen2Runtime({ env: { DB: db } });
    const manifest = new Map(runtime.bus.list().map(row => [row.id, row]));
    assert.equal(manifest.get('memory.consolidate')?.risk, 'LOW');
    assert.equal(manifest.get('memory.consolidate')?.health, 'HEALTHY');

    const result = await runtime.bus.execute('memory.consolidate', { limit: 50 }, { owner: 'test', permissions: [], requestId: 'memory-consolidate-runtime' });
    assert.equal(result.input_count, 2);
    assert.equal(result.proposal_count, 1);
    assert.equal(result.proposals[0].confidence, 0.82);
    assert.equal(result.proposals[0].duplicate_count, 1);
    assert.deepEqual(result.proposals[0].provenance.sources, ['chat', 'archive']);
    assert.equal(result.writes_performed, 0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM memories').first()).n, 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM memory_candidates WHERE status='PENDING'").first()).n, 2);
  } finally {
    db.close();
  }
});

test('memory compatibility HTTP endpoints execute through CapabilityBus', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function maybeHandleMemoryCompatibility');
  const end = source.indexOf('\nfunction busContext', start);
  assert.notEqual(start, -1);
  const handler = source.slice(start, end);
  assert.match(handler, /runtime\.bus\.execute\('memory\.status'/);
  assert.match(handler, /runtime\.bus\.execute\('memory\.export'/);
  assert.match(handler, /runtime\.bus\.execute\('memory\.consolidate'/);
  assert.doesNotMatch(handler, /safeCount\(/);
  assert.doesNotMatch(handler, /safeRows\(/);
});


test('memory.retrieve exposes hybrid filtered search through CapabilityBus and keeps semantic opt-in', async () => {
  const db = sqliteD1();
  try {
    await db.prepare("CREATE TABLE conversations (id TEXT PRIMARY KEY, owner TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', metadata TEXT, updated_at INTEGER NOT NULL)").run();
    await db.prepare("CREATE TABLE archive_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', content TEXT NOT NULL, attachments_json TEXT, timestamp INTEGER NOT NULL, provenance TEXT, metadata TEXT)").run();
    await db.prepare("INSERT INTO conversations VALUES (?,?,?,?,?)").bind('c1','adrien','Projet Orion','{}',100).run();
    await db.prepare("INSERT INTO archive_messages VALUES (?,?,?,?,?,?,?,?)")
      .bind('m1','c1','user','Le repère memsevenbus concerne Orion.',JSON.stringify([{name:'preuve.pdf',mime_type:'application/pdf'}]),100,'chatgpt_export','{}').run();

    let aiCalls=0;
    const runtime = createGen2Runtime({ env: {
      DB: db,
      MELITURGOS_USER: 'adrien',
      MEL_MEMORY_SEMANTIC_ENABLED: 'false',
      AI: { async run() { aiCalls++; throw new Error('semantic should stay disabled'); } },
    } });
    const manifest = new Map(runtime.bus.list().map(row => [row.id, row]));
    assert.equal(manifest.get('memory.retrieve')?.risk, 'LOW');

    const result = await runtime.bus.execute('memory.retrieve', {
      query:'memsevenbus',
      sources:['archive_messages'],
      semantic:true,
      filters:{project:'Orion',conversation_id:'c1',file_type:'pdf',source:'archive_messages',role:'user'}
    }, { owner:'adrien', permissions:[], requestId:'memory-retrieve-runtime' });

    assert.equal(result.total,1);
    assert.equal(result.results[0].id,'m1');
    assert.equal(result.semantic_status,'DISABLED');
    assert.equal(aiCalls,0);
  } finally {
    db.close();
  }
});
