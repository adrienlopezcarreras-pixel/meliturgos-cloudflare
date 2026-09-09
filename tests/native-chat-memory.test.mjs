import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const auth = 'Basic ' + btoa('test:test-only');
function request(text, conversation_id='memory-test') {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ text, conversation_id }),
  });
}

function makeEnv(DB, calls) {
  return {
    DB,
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    AI: { async run(_model, input) { calls.push(input.messages); return { response: 'ok' }; } },
  };
}

test('explicit remember is add-only and reaches later native model context', async () => {
  const DB = sqliteD1();
  const calls = [];
  const env = makeEnv(DB, calls);
  try {
    const first = await worker.fetch(request('Souviens-toi que mon projet est le jardin solaire'), env);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).memory_stored, true);
    const second = await worker.fetch(request('Quel est mon projet ?'), env);
    assert.equal(second.status, 200);
    assert.match(calls.at(-1)[0].content, /jardin solaire/);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM memories').first()).n, 1);
  } finally { DB.close(); }
});

test('secret-like explicit memory is rejected from durable memory', async () => {
  const DB = sqliteD1();
  const calls = [];
  const env = makeEnv(DB, calls);
  try {
    const response = await worker.fetch(request('Souviens-toi que api_key=supersecret'), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).memory_stored, false);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM memories').first()).n, 0);
  } finally { DB.close(); }
});
