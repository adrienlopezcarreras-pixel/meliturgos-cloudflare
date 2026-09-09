import test from 'node:test';
import assert from 'node:assert/strict';
import { inferNativeCodeCapability, buildRuntimeCapabilityManifest } from '../src/api/native-chat.js';

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

test('runtime capability manifest refreshes health and exposes bounded truthful states', async () => {
  let refreshed = false;
  const runtime = {
    bus: {
      async refreshHealthAll() {
        refreshed = true;
        return [
          { id: 'code.read', enabled: true, health: 'HEALTHY', provider: 'github', risk: 'low', permissions: ['code.read'] },
          { id: 'code.search', enabled: true, health: 'DEGRADED', provider: 'github', risk: 'low', permissions: ['code.read'] },
          { id: 'teacher.ask', enabled: false, health: 'HEALTHY', provider: 'teacher', risk: 'low', permissions: [] }
        ];
      }
    }
  };
  const manifest = await buildRuntimeCapabilityManifest(runtime);
  assert.equal(refreshed, true);
  assert.deepEqual(manifest.map(x => [x.id, x.status]), [
    ['code.read', 'HEALTHY'],
    ['code.search', 'DEGRADED'],
    ['teacher.ask', 'BLOCKED_EXTERNAL']
  ]);
});
