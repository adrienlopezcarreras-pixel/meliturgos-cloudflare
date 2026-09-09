import assert from 'node:assert/strict';

const start = Date.now();
const testWorker = '/tmp/debug-test.mjs';
const {copyFile} = await import('node:fs/promises');
await copyFile('./worker.js', testWorker);
const {default: worker} = await import(`file:///${testWorker}?v=${Date.now()}`);

console.log('Test setup takes', Date.now() - start, 'ms\n');

const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');

console.log('Creating mock S3 env...');
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
      if (sql.includes('PRAGMA quick_check')) s.first = async () => ({ quick_check: 'ok' });
      return s;
    }
  },
  MEDIA_BUCKET: { put() { } },
  AI: {
    run(model) {
      console.log(`AI.run called with ${model}`);
      if (Math.random() > 0.5) throw new Error('MODEL_UNAVAILABLE');
      return { response: 'Réponse', model };
    }
  }
};

console.log('Calling /api/tools/registry...');
const response1 = await worker.fetch(
  new Request('https://meliturgos.test/api/tools/registry', {
    headers: { Authorization: auth }
  }),
  env
);
const body1 = await response1.json();
console.log('Registry status:', response1.status);
console.log('Number of tools:', body1.tools.length);
console.log('AI tool available:', body1.tools.find(t => t.id === 'workers_ai_chat')?.available);

console.log('\nDone! Test completed in', Date.now() - start, 'ms');