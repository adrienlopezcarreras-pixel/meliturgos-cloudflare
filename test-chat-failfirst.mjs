import assert from 'node:assert/strict';
import {copyFile} from 'node:fs/promises';

const testWorker = '/tmp/meliturgos-chat-fail.mjs';
await copyFile('./worker.js', testWorker);
const {default: worker} = await import(`file:///${testWorker}?v=${Date.now()}`);

const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');

console.log('Testing /api/chat with failFirst=true...\n');

async function testFailFirst() {
  let aiCallCount = 0;
  let calledWithFailFirst = false;

  const env = {
    MELITURGOS_USER: 'adrien',
    MELITURGOS_PASSWORD: 'test',
    OWNER_NAME: 'Adrien',
    DB: {
      prepare(sql) {
        const s = Object.create({
          bind() { return this },
          run() { return { meta: { changes: 1, last_row_id: null } } },
          first() { return { n: 0, id: 'session' } },
          all() { return { results: [] } }
        });
        if (String(sql).includes('PRAGMA quick_check')) s.first = async () => ({ quick_check: 'ok' });
        return s;
      }
    },
    MEDIA_BUCKET: { put() { } },
    AI: {
      run(model) {
        aiCallCount++;
        if (aiCallCount === 1 && Math.random() > 0.5) {
          console.log('AI call #1 failed with MODEL_UNAVAILABLE');
          throw new Error('MODEL_UNAVAILABLE');
        }
        return { response: 'Réponse de test', model };
      }
    }
  };

  const response = await worker.fetch(
    new Request('https://meliturgos.test/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ text: 'Écris du code JavaScript', failFirst: true })
    }),
    env
  );

  const body = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response body:', JSON.stringify(body, null, 2));
  
  assert.equal(response.status, 200, 'Should return 200 OK');
  assert.equal(typeof body.model, 'string', 'body.model should be defined');
  assert.equal(typeof body.fallback_used, 'boolean', 'body.fallback_used should be defined');
  assert.equal(typeof body.model_attempts, 'number', 'body.model_attempts should be defined');
  assert.equal(body.model_attempts, 2, 'Should have attempted 2 models');
  assert.equal(body.tool_succeeded, true, 'tool_succeeded should be true');
  
  console.log('\n✓ All assertions passed!');
  console.log('✓ failFirst behavior verified: The chat endpoint accepts failFirst=true but simulates the failure\n');
}

testFailFirst().catch(error => {
  console.error('\n✗ Test failed:', error.message);
  process.exit(1);
});