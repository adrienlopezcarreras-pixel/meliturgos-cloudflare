import assert from 'node:assert/strict';
import {copyFile} from 'node:fs/promises';

const testWorker = '/tmp/chat-fail-test.mjs';
await copyFile('./worker.js', testWorker);
const {default: worker} = await import(`file:///${testWorker}?v=${Date.now()}`);

const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
let aiCallCount = 0;

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
        all() { return { results: [] } },
        batch() { return Promise.resolve({ meta: { changes: 0 } }) }
      });
      if (sql.includes('PRAGMA quick_check')) s.first = async () => ({ quick_check: 'ok' });
      return s;
    }
  },
  MEDIA_BUCKET: { put() { } },
  AI: {
    run(model) {
      aiCallCount++;
      if (aiCallCount === 1) {
        console.log('AI.run called #1 - throwing MODEL_UNAVAILABLE');
        throw new Error('MODEL_UNAVAILABLE');
      }
      console.log(`AI.run called #${aiCallCount} - returning success: ${model}`);
      return { response: 'Réponse de test', model };
    }
  }
};

console.log('Test: /api/chat with failFirst=true\n');

const response = await worker.fetch(
  new Request('https://meliturgos.test/api/chat', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': auth 
    },
    body: JSON.stringify({ text: 'Écris du code JavaScript', failFirst: true })
  }),
  env
);

console.log('Response status:', response.status);

const body = await response.json();
console.log('Response body:', JSON.stringify(body, null, 2));

try {
  assert.equal(response.status, 200);
  assert.equal(typeof body.model, 'string');
  assert.equal(typeof body.fallback_used, 'boolean');
  assert.equal(body.model_attempts, 2);
  assert.equal(body.tool_succeeded, true);
  console.log('\n✓ All assertions passed!');
} catch (e) {
  console.error('\n✗ Assertion failed:', e.message);
  process.exit(1);
}