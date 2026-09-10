import test from 'node:test';
import assert from 'node:assert/strict';
import { inferNativeCodeCapability, buildRuntimeCapabilityManifest, applyCapabilityExecutionEvidence } from '../src/api/native-chat.js';

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
