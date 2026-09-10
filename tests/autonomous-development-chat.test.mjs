import test from 'node:test';
import assert from 'node:assert/strict';
import { isAutonomousDevelopmentCommand } from '../src/evolution/chat-intent.js';
import { maybeQueueAutonomousDevelopment } from '../src/evolution/development-chat.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const auth = 'Basic ' + Buffer.from('test:test-only').toString('base64');

function request(text, authorized = true) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorized ? { authorization: auth } : {}),
    },
    body: JSON.stringify({ text, conversation_id: 'dev-chat', device_id: 'ubuntu' }),
  });
}

test('autonomous development intent requires an explicit MEL self-development command', () => {
  assert.equal(isAutonomousDevelopmentCommand('Explique-moi comment fonctionne une classe JavaScript'), false);
  assert.equal(isAutonomousDevelopmentCommand('Écris un exemple de code Python'), false);
  assert.equal(isAutonomousDevelopmentCommand('Continue ta feuille de route de développement'), true);
  assert.equal(isAutonomousDevelopmentCommand('MEL, développe ton code et améliore ton autonomie'), true);
  assert.equal(isAutonomousDevelopmentCommand('Reprends le Mentor Dev Bridge et poursuis le développement autonome'), true);
});

test('explicit autonomous command creates a real queued D1 job', async () => {
  const DB = sqliteD1();
  const env = { DB, MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only' };
  try {
    const response = await maybeQueueAutonomousDevelopment(request('Continue ta feuille de route de développement et améliore ton autonomie.'), env);
    const data = await response.json();
    assert.equal(response.status, 202, JSON.stringify(data));
    assert.equal(data.development_job, true);
    assert.equal(data.release_requires_approval, true);
    assert.ok(data.job_id);
    const row = await DB.prepare('SELECT * FROM dev_jobs WHERE id=?').bind(data.job_id).first();
    assert.equal(row.status, 'QUEUED');
    assert.match(row.goal, /feuille de route/i);
    assert.equal(row.requested_by, 'mel-chat');
  } finally { DB.close(); }
});

test('ordinary programming chat is not intercepted', async () => {
  const DB = sqliteD1();
  try {
    const response = await maybeQueueAutonomousDevelopment(request('Peux-tu expliquer ce code JavaScript ?'), {
      DB, MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only'
    });
    assert.equal(response, null);
    const rows = (await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dev_jobs'").all()).results;
    assert.equal(rows.length, 0);
  } finally { DB.close(); }
});

test('autonomous development queue requires MEL authentication', async () => {
  const DB = sqliteD1();
  try {
    const response = await maybeQueueAutonomousDevelopment(request('Continue ta feuille de route de développement.', false), {
      DB, MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only'
    });
    assert.equal(response.status, 401);
    const rows = (await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dev_jobs'").all()).results;
    assert.equal(rows.length, 0);
  } finally { DB.close(); }
});
