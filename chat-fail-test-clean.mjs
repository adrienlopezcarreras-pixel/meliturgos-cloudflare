import assert from 'node:assert/strict';
import {copyFile} from 'node:fs/promises';

const testWorker = '/tmp/chat-fail-test.mjs';
await copyFile('./worker.js', testWorker);
const {default: worker} = await import(`file:///${testWorker}?v=${Date.now()}`);

const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');

console.log('Test: /api/chat failFirst=true (simulated failure in AI.run)\n');

async function doTest() {
  let callCount = 0;
  
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
        callCount++;
        if (callCount === 1) {
          console.log(`AI.run #1: throwing MODEL_UNAVAILABLE`);
          throw new Error('MODEL_UNAVAILABLE');
        }
        console.log(`AI.run #${callCount}: success with ${model}`);
        return { response: 'Réponse de test', model };
      }
    }
  };

  const response = await worker.fetch(
    new Request('https://meliturgos.test/api/chat', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': auth 
      },
      body: JSON.stringify({ 
        text: 'Écris du code JavaScript', 
        failFirst: true 
      })
    }),
    env
  );

  console.log('Response status:', response.status);
  const body = await response.json();
  console.log('Response body:', JSON.stringify(body, null, 2));


  if (response.status !== 200) {
    console.error(`\n✗ Expected status 200, got ${response.status}`);
    console.error('This means the failFirst simulation is NOT working correctly');
    return;
  }

  try {
    assert.equal(response.status, 200);
    assert.equal(typeof body.model, 'string', 'body.model should be a string');
    assert.equal(body.model, '@cf/google/gemma-3-12b-it', `model should be gemma, got ${body.model}`);
    assert.equal(typeof body.fallback_used, 'boolean', 'body.fallback_used should be a boolean');
    assert.equal(body.fallback_used, true, 'fallback_used should be true');
    assert.equal(typeof body.model_attempts, 'number', 'body.model_attempts should be a number');
    assert.equal(body.model_attempts, 2, 'Should have attempted 2 models');
    assert.equal(body.tool_succeeded, true, 'tool_succeeded should be true');
    
    console.log('\n✓ All assertions passed!');
    console.log('✓ Chat endpoint correctly handles failFirst=true by simulating the failure\n');
  } catch (e) {
    console.error('\n✗ Assertion failed:', e.message);
    process.exit(1);
  }
}

doTest().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});