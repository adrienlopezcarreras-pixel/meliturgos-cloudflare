// ChatGPT-GPT6 / MEL-MENTOR-FALLBACK consent regression tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMentorCompanionFallback } from '../src/learning/mentor-companion-provider.js';
import { D1AlternativeRegistryStore } from '../src/portability/d1-alternative-registry-store.js';
import { createAlternativeRegistry } from '../src/portability/prevalidated-alternative-registry.js';
import { ZeroEuroGovernor } from '../src/augmentio/zero-euro-governor.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

function approval(now) {
  return {
    id: 'companion-local-ai', layer: 'ai', provider: 'local-companion-ai',
    adapter_id: 'companion-local-ai',
    endpoint_class: 'paired-windows-localhost-ai',
    cost_mode: 'ZERO_EURO_VERIFIED', added_cost_eur: 0,
    proof: {
      isolated_test: true, smoke: true, rollback: true,
      export: true, import: true, activate: true,
      verified_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + 3600000).toISOString(),
    },
  };
}

test('local mentor fallback requires prevalidation, live engine and owner compute consent', async () => {
  const DB = sqliteD1();
  try {
    assert.equal(await createMentorCompanionFallback({ DB }), null);
    const now = Date.now();
    await new D1AlternativeRegistryStore(DB).save(createAlternativeRegistry([approval(now)]));
    await DB.prepare(`CREATE TABLE computer_devices (
      id TEXT PRIMARY KEY, platform TEXT, halted INTEGER,
      last_seen_at INTEGER, metadata TEXT
    )`).run();
    const metadata = {
      engine_heartbeat_at: now, engine_version: '1.3.2',
      local_compute_enabled: true, local_compute_profile: 'light',
      local_compute_telemetry: {
        observed_at: now, cpu_percent: 15, free_ram_mb: 4096,
        on_battery: false, user_busy: false, gpu_available: false, active_jobs: 0,
      },
    };
    await DB.prepare('INSERT INTO computer_devices VALUES(?,?,?,?,?)')
      .bind('owner-pc', 'windows', 0, now, JSON.stringify(metadata)).run();
    const ready = await createMentorCompanionFallback({ DB });
    assert.equal(ready?.id, 'companion-local-ai');
    assert.ok(ready?.capabilities.includes('CODE'));
    assert.equal(new ZeroEuroGovernor().allows(ready), true);

    metadata.local_compute_enabled = false;
    await DB.prepare('UPDATE computer_devices SET metadata=? WHERE id=?')
      .bind(JSON.stringify(metadata), 'owner-pc').run();
    assert.equal(await createMentorCompanionFallback({ DB }), null);
  } finally {
    DB.close();
  }
});

test('no D1 implies no PC inference fallback', async () => {
  assert.equal(await createMentorCompanionFallback({}), null);
});
