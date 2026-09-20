import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { migrate } from '../src/persistence/migrations.js';
import { DB_SCHEMA_VERSION } from '../src/core/config.js';

test('canonical migration provisions persistent conversation focus and response quality tables', async () => {
  const DB=sqliteD1();
  try {
    const result=await migrate(DB);
    assert.equal(DB_SCHEMA_VERSION,8);
    assert.equal(result.currentVersion,8);
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
    assert.equal(second.currentVersion,8);
    const rows=await DB.prepare('SELECT version,name FROM schema_migrations WHERE version=8').all();
    assert.equal(rows.results.length,1);
    assert.equal(rows.results[0].name,'conversation_focus_and_response_quality');
  } finally {
    DB.close();
  }
});
