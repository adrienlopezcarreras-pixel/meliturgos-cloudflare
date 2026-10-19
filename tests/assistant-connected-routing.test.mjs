import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNativeChat, inferConnectedDataCapability, inferConnectedReadPlan } from '../src/api/native-chat.js';
import { inferKnowledgeCapability } from '../src/api/knowledge-intent.js';
import { privateConnectedDataRequest } from '../src/api/connected-data-intent.js';
import { parisTimeWindow } from '../src/api/assistant-time.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

test('everyday owner requests reach the right connector', () => {
  const cases = {
    'quels sont mes rendez-vous demain ?': 'calendar.events.read',
    'ai-je des réunions cette semaine ?': 'calendar.events.read',
    'qu’est-ce que j’ai de prévu aujourd’hui ?': 'calendar.events.read',
    'lis mes derniers mails': 'gmail.messages.search',
    'cherche dans mes mails la facture EDF': 'gmail.messages.search',
    'ai-je des mails non lus ?': 'gmail.messages.search',
    'cherche dans outlook le devis': 'mail.messages.search',
    'montre mes tâches': 'tasks.tasklists.read',
    'liste mes fichiers Google Drive': 'drive.files.list',
    'liste mon onedrive': 'files.list',
  };
  for (const [text, id] of Object.entries(cases)) {
    assert.equal(inferConnectedDataCapability(text)?.id, id, text);
  }
});

test('mail search keeps only the useful words of the request', () => {
  assert.deepEqual(inferConnectedDataCapability('cherche dans mes mails la facture EDF').input, { query: 'facture EDF', limit: 15 });
  assert.deepEqual(inferConnectedDataCapability('lis mes derniers mails').input, { query: 'newer_than:7d', limit: 15 });
  assert.equal(inferConnectedDataCapability('ai-je des mails non lus ?').input.query, 'is:unread newer_than:14d');
});

test('general questions are not hijacked into private data', () => {
  for (const text of ['qu’est-ce qu’un rendez-vous galant ?', 'explique le protocole SMTP des mails', 'cherche sur internet la météo à Paris', 'raconte-moi une histoire']) {
    assert.equal(privateConnectedDataRequest(text), false, text);
    assert.equal(inferConnectedDataCapability(text), null, text);
  }
});

test('private mail searches never go to public knowledge or web research', () => {
  assert.equal(inferKnowledgeCapability('cherche dans mes mails la facture EDF'), null);
  assert.notEqual(inferKnowledgeCapability('cherche sur internet la météo à Paris'), undefined);
});

test('calendar windows are computed in Paris time', () => {
  const saturday = new Date('2026-10-17T10:00:00Z'); // samedi 12h à Paris (UTC+2)
  assert.deepEqual(parisTimeWindow('mes rendez-vous demain', saturday), { time_min: '2026-10-18T00:00:00+02:00', time_max: '2026-10-19T00:00:00+02:00' });
  assert.deepEqual(parisTimeWindow('après-demain', saturday), { time_min: '2026-10-19T00:00:00+02:00', time_max: '2026-10-20T00:00:00+02:00' });
  assert.deepEqual(parisTimeWindow('la semaine prochaine', saturday), { time_min: '2026-10-19T00:00:00+02:00', time_max: '2026-10-26T00:00:00+01:00' });
  assert.deepEqual(parisTimeWindow('mardi', saturday), { time_min: '2026-10-20T00:00:00+02:00', time_max: '2026-10-21T00:00:00+02:00' });
  assert.equal(parisTimeWindow('aujourd’hui', saturday).time_max, '2026-10-18T00:00:00+02:00');
});

test('with the production owner configuration, a mail search really calls Gmail with the extracted query', async () => {
  const DB = sqliteD1();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const u = String(url);
    const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('/messages?')) return json({ messages: [{ id: 'm1', threadId: 't1' }], resultSizeEstimate: 1 });
    if (u.includes('/messages/m1?')) return json({ snippet: 'Votre facture EDF est disponible', labelIds: ['UNREAD'], payload: { headers: [{ name: 'Subject', value: 'Facture EDF octobre' }, { name: 'From', value: 'EDF <noreply@edf.fr>' }, { name: 'Date', value: 'Fri, 16 Oct 2026 09:00:00 +0200' }] } });
    if (u.includes('gmail.googleapis.com')) return json({ emailAddress: 'adrien@example.com' });
    return new Response('{}', { status: 404 });
  };
  try {
    const env = { DB, MEL_OWNER_PERSONAL_AGENT: 'true', GMAIL_ACCESS_TOKEN: 'test-token', AI: { async run() { return { response: 'Aucun mail correspondant.' }; } } };
    const response = await handleNativeChat(new Request('https://mel.example/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'cherche dans mes mails la facture EDF', conversation_id: 'mail-1', use_companion_compute: false }),
    }), env, { authorized: true });
    const payload = await response.json();
    const tool = payload.tool_results.find(t => t.capability === 'gmail.messages.search');
    assert.ok(tool, JSON.stringify(payload.tool_results));
    assert.equal(tool.status, 'SUCCEEDED', JSON.stringify(tool));
    const gmailCall = calls.find(u => u.includes('/messages?'));
    assert.ok(gmailCall);
    assert.equal(new URL(gmailCall).searchParams.get('q'), 'facture EDF');
    assert.ok(calls.some(u => u.includes('/messages/m1?') && u.includes('format=metadata')), 'subject and sender are fetched, never the body');
    assert.ok(!calls.some(u => u.includes('format=full')));
  } finally {
    globalThis.fetch = originalFetch;
    DB.close();
  }
});

test('a request naming Gmail, Agenda and Drive plans three reads', () => {
  const plan = inferConnectedReadPlan('Vérifie les connexions Pipedream à Gmail, Google Agenda et Google Drive. Effectue un test réel de lecture pour chacun des trois services, sans modifier de données.');
  assert.deepEqual(plan.map(step => step.id), ['gmail.messages.search', 'calendar.events.read', 'drive.files.list']);
  assert.equal(plan[0].input.query, 'in:inbox');
  assert.equal(plan[0].input.limit, 5);
  const asked = inferConnectedReadPlan('Lis exactement 5 messages Gmail de la boîte de réception, 5 événements à venir de Google Agenda, et 5 fichiers Google Drive. Une seule fois.');
  assert.equal(asked[0].input.query, 'in:inbox');
  assert.deepEqual(inferConnectedReadPlan('lis mes derniers mails'), []);
});
