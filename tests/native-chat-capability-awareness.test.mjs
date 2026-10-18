import test from 'node:test';
import assert from 'node:assert/strict';
import { inferNativeCodeCapability, inferConnectedDataCapability, inferExplicitRegisteredCapability, buildRuntimeCapabilityManifest, applyCapabilityExecutionEvidence } from '../src/api/native-chat.js';

test('follow-up access question reuses recent code context and path', () => {
  const recent = [
    { role: 'user', content: 'Peux-tu lire le fichier src/models/ModelRouter.js dans ton dépôt ?' },
    { role: 'assistant', content: 'Oui, je peux inspecter ce code.' }
  ];
  assert.deepEqual(
    inferNativeCodeCapability("Tu m'as dit que tu avais accès ?", recent),
    { id: 'code.read', input: { path: 'src/models/ModelRouter.js' } }
  );
});

test('follow-up access question without code context does not invent code intent', () => {
  const recent = [{ role: 'user', content: 'Tu as accès à mon calendrier ?' }];
  assert.equal(inferNativeCodeCapability("Tu m'as dit que tu avais accès ?", recent), null);
});

test('runtime capability manifest refreshes health and uses the same strict truth vocabulary as audits', async () => {
  let refreshed = false;
  const runtime = {
    bus: {
      async refreshHealthAll() {
        refreshed = true;
        return [
          { id: 'code.read', enabled: true, health: 'HEALTHY', provider: 'github', risk: 'LOW', permissions: ['code.read'] },
          { id: 'code.search', enabled: true, health: 'DEGRADED', implementation_status: 'PARTIAL', provider: 'github', risk: 'LOW', permissions: ['code.read'] },
          { id: 'prototype', enabled: true, health: 'HEALTHY', implementation_status: 'STUB', provider: 'mel', risk: 'LOW', permissions: [] },
          { id: 'future', enabled: true, health: 'HEALTHY', implementation_status: 'NOT_IMPLEMENTED', provider: 'mel', risk: 'LOW', permissions: [] },
          { id: 'teacher.ask', enabled: false, health: 'HEALTHY', provider: 'teacher', risk: 'LOW', permissions: [] }
        ];
      }
    }
  };
  const manifest = await buildRuntimeCapabilityManifest(runtime);
  assert.equal(refreshed, true);
  assert.deepEqual(manifest.map(x => [x.id, x.status]), [
    ['code.read', 'EXISTANT_NON_TESTE'],
    ['code.search', 'PARTIEL'],
    ['prototype', 'STUB'],
    ['future', 'NOT_IMPLEMENTED'],
    ['teacher.ask', 'BLOCKED']
  ]);
  assert.equal(manifest.find(x => x.id === 'prototype').implementation_status, 'STUB');
  assert.equal(manifest.find(x => x.id === 'code.read').implementation_status, null);
  assert.equal(manifest.find(x => x.id === 'code.read').health, 'HEALTHY');
  assert.equal(manifest.find(x => x.id === 'code.read').tested_now, false);
});

test('successful tool execution upgrades only that capability to EXISTANT_ET_TESTE for this request', async () => {
  const manifest = await buildRuntimeCapabilityManifest({
    bus: {
      refreshHealthAll: async () => [
        { id:'code.read', enabled:true, health:'HEALTHY', provider:'github', risk:'LOW', permissions:[] },
        { id:'web.research', enabled:true, health:'HEALTHY', provider:'web', risk:'LOW', permissions:[] },
      ],
    },
  });
  const updated = applyCapabilityExecutionEvidence(manifest, [
    { capability:'code.read', status:'SUCCEEDED', result:{ path:'src/router.js' } },
  ]);
  const code = updated.find(x => x.id === 'code.read');
  const web = updated.find(x => x.id === 'web.research');
  assert.equal(code.status, 'EXISTANT_ET_TESTE');
  assert.equal(code.tested_now, true);
  assert.deepEqual(code.last_execution, { status:'SUCCEEDED' });
  assert.equal(web.status, 'EXISTANT_NON_TESTE');
  assert.equal(web.tested_now, false);
});

test('failed tool execution becomes explicit runtime failure without erasing STUB truth', () => {
  const manifest = [
    { id:'web.research', status:'EXISTANT_NON_TESTE', implementation_status:null, enabled:true, health:'HEALTHY', tested_now:false },
    { id:'prototype', status:'STUB', implementation_status:'STUB', enabled:true, health:'HEALTHY', tested_now:false },
  ];
  const updated = applyCapabilityExecutionEvidence(manifest, [
    { capability:'web.research', status:'FAILED', error:'UPSTREAM_TIMEOUT' },
    { capability:'prototype', status:'FAILED', error:'NO_HANDLER' },
  ]);
  assert.equal(updated[0].status, 'EXISTANT_MAIS_ECHEC_RUNTIME');
  assert.equal(updated[0].last_execution.code, 'UPSTREAM_TIMEOUT');
  assert.equal(updated[1].status, 'STUB');
});


test('connected private-data routing maps natural read requests to real capabilities', () => {
  assert.deepEqual(
    inferConnectedDataCapability('Regarde mes mails Outlook'),
    { id:'mail.messages.search', input:{ limit:20 } },
  );
  assert.deepEqual(
    inferConnectedDataCapability('Liste mes fichiers OneDrive'),
    { id:'files.list', input:{ limit:20 } },
  );
  assert.deepEqual(
    inferConnectedDataCapability('Cherche facture dans Google Drive'),
    { id:'drive.files.search', input:{ query:'facture', limit:20 } },
  );
  const agenda = inferConnectedDataCapability("Qu'est-ce que j'ai dans mon agenda ?");
  assert.equal(agenda.id, 'calendar.events.read');
  assert.equal(agenda.input.limit, 20);
  // Calendar reads now carry a real Paris-time window (default: next 7 days).
  assert.match(agenda.input.time_min, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(agenda.input.time_max, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(
    inferConnectedDataCapability('Montre mes tâches Google Tasks'),
    { id:'tasks.tasklists.read', input:{ limit:20 } },
  );
});

test('connected private-data routing only plans an email mutation when recipient subject and body are explicit', () => {
  assert.deepEqual(
    inferConnectedDataCapability('Envoie un mail Outlook à test@example.com objet: Test MEL message: Bonjour'),
    {
      id:'mail.messages.send',
      input:{ to:['test@example.com'], subject:'Test MEL', body:'Bonjour' },
      execution_intent:'CONNECTED_DATA_MUTATION',
    },
  );
  assert.equal(
    inferConnectedDataCapability('Envoie un mail Outlook à test@example.com'),
    null,
  );
});


test('all registered capabilities remain visible to MEL chat, including IDs beyond index 96', async () => {
  const rows = Array.from({length: 164}, (_, i) => ({
    id: 'fixture.' + i, name: 'Fixture ' + i, category:'fixture',
    enabled:true, health:'HEALTHY', risk:'LOW', permissions:[],
  }));
  rows.push({
    id:'media.video.generate', name:'Video generation', category:'media',
    enabled:true, health:'UNAVAILABLE', risk:'MEDIUM', permissions:[],
  });
  const manifest = await buildRuntimeCapabilityManifest({
    bus: { refreshHealthAll: async () => rows },
  });
  assert.equal(manifest.length, 165);
  assert.equal(manifest[164].id, 'media.video.generate');
  assert.equal(manifest[164].status, 'BLOCKED_EXTERNAL');
  assert.equal(manifest[164].tested_now, false);
});

test('explicit low-risk capability requests route through the normal runtime bus', () => {
  const descriptors = {
    'skill.list': { id:'skill.list', enabled:true, risk:'LOW', approval:{required:false} },
    'd1.schema.read': { id:'d1.schema.read', enabled:true, risk:'LOW' },
    'd1.sql.write': { id:'d1.sql.write', enabled:true, risk:'HIGH' },
    'danger.approval': { id:'danger.approval', enabled:true, risk:'LOW', approval:{required:true} },
    'offline.tool': { id:'offline.tool', enabled:false, risk:'LOW' },
  };
  const runtime = { bus: { describe(id) {
    if (!descriptors[id]) throw new Error('CAPABILITY_NOT_FOUND');
    return descriptors[id];
  } } };
  assert.deepEqual(inferExplicitRegisteredCapability('utilise la compétence skill.list', runtime), {
    id:'skill.list', input:{}, execution_intent:'EXPLICIT_REGISTERED_CAPABILITY',
  });
  assert.deepEqual(inferExplicitRegisteredCapability('exécute l’outil d1.schema.read avec {"table":"jobs"}', runtime), {
    id:'d1.schema.read', input:{table:'jobs'}, execution_intent:'EXPLICIT_REGISTERED_CAPABILITY',
  });
  assert.equal(inferExplicitRegisteredCapability('utilise la compétence d1.sql.write', runtime), null);
  assert.equal(inferExplicitRegisteredCapability('utilise la compétence danger.approval', runtime), null);
  assert.equal(inferExplicitRegisteredCapability('utilise la compétence offline.tool', runtime), null);
  assert.equal(inferExplicitRegisteredCapability('utilise la compétence invented.tool', runtime), null);
  assert.equal(inferExplicitRegisteredCapability('utilise la compétence skill.list avec {oops}', runtime), null);
  assert.equal(inferExplicitRegisteredCapability('parle-moi de skill.list', runtime), null);
});
