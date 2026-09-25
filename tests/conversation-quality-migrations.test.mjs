import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { migrate } from '../src/persistence/migrations.js';
import { DB_SCHEMA_VERSION } from '../src/core/config.js';

test('canonical migration provisions persistent conversation focus and response quality tables', async () => {
  const DB=sqliteD1();
  try {
    const result=await migrate(DB);
    assert.equal(result.currentVersion,DB_SCHEMA_VERSION);
    const focus=await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_focus_state'").first();
    const quality=await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mel_response_quality_events'").first();
    assert.equal(focus?.name,'conversation_focus_state');
    assert.equal(quality?.name,'mel_response_quality_events');
    const focusIndex=await DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_conversation_focus_updated'").first();
    const qualityIndex=await DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_mel_response_quality_events_conversation'").first();
    assert.equal(focusIndex?.name,'idx_conversation_focus_updated');
    assert.equal(qualityIndex?.name,'idx_mel_response_quality_events_conversation');
  } finally {
    DB.close();
  }
});

test('migration v8 is idempotent', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    const second=await migrate(DB);
    assert.equal(second.currentVersion,DB_SCHEMA_VERSION);
    const rows=await DB.prepare('SELECT version,name FROM schema_migrations WHERE version=8').all();
    assert.equal(rows.results.length,1);
    assert.equal(rows.results[0].name,'conversation_focus_and_response_quality');
  } finally {
    DB.close();
  }
});


test('canonical migration provisions computer and terminal runtime state', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    for (const name of ['computer_devices','computer_commands','device_tokens','device_pair_codes','device_status']) {
      const row=await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();
      assert.equal(row?.name,name);
    }
    const index=await DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_computer_commands_device_status'").first();
    assert.equal(index?.name,'idx_computer_commands_device_status');
    const migration=await DB.prepare('SELECT name FROM schema_migrations WHERE version=9').first();
    assert.equal(migration?.name,'device_runtime_state');
  } finally {
    DB.close();
  }
});


test('canonical migration provisions durable knowledge workspace', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    const table=await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_artifacts'").first();
    assert.equal(table?.name,'knowledge_artifacts');
    const index=await DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_knowledge_artifacts_owner_updated'").first();
    assert.equal(index?.name,'idx_knowledge_artifacts_owner_updated');
    const migration=await DB.prepare('SELECT name FROM schema_migrations WHERE version=10').first();
    assert.equal(migration?.name,'knowledge_workspace');
  } finally {
    DB.close();
  }
});


test('migration v11 provisions Collector coverage state and remains idempotent', async () => {
  const DB=sqliteD1();
  try {
    const first=await migrate(DB);
    const second=await migrate(DB);
    assert.equal(first.currentVersion,DB_SCHEMA_VERSION);
    assert.equal(second.currentVersion,DB_SCHEMA_VERSION);
    const table=await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chatgpt_collector_coverage'").first();
    assert.equal(table?.name,'chatgpt_collector_coverage');
    const rows=await DB.prepare('SELECT version,name FROM schema_migrations WHERE version=11').all();
    assert.equal(rows.results.length,1);
    assert.equal(rows.results[0].name,'chatgpt_collector_coverage');
  } finally {
    DB.close();
  }
});


test('migration v12 provisions memory candidates for live exchange sync and remains idempotent', async () => {
  const DB=sqliteD1();
  try {
    const first=await migrate(DB);
    const second=await migrate(DB);
    assert.equal(first.currentVersion,DB_SCHEMA_VERSION);
    assert.equal(second.currentVersion,DB_SCHEMA_VERSION);
    const table=await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_candidates'").first();
    assert.equal(table?.name,'memory_candidates');
    const rows=await DB.prepare('SELECT version,name FROM schema_migrations WHERE version=12').all();
    assert.equal(rows.results.length,1);
    assert.equal(rows.results[0].name,'memory_candidates_runtime_sync');
    const columns=await DB.prepare("PRAGMA table_info(memory_candidates)").all();
    assert.deepEqual(columns.results.map(row => row.name), [
      'id','conversation_id','message_id','content','confidence','source','status','created_at'
    ]);
  } finally {
    DB.close();
  }
});
