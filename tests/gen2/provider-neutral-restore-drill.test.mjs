import test from 'node:test';
import assert from 'node:assert/strict';

import {
  drillProviderNeutralBundleRestore,
  restoreProviderNeutralBundleToAlternateRuntime,
} from '../../src/portability/alternate-runtime-restore.js';
import {
  createRuntimeProviderNeutralSystemBundle,
} from '../../src/portability/runtime-exporters.js';
import {
  createProviderNeutralSystemBundle,
} from '../../src/portability/system-bundle.js';
import {
  createInMemoryProjectAdapter,
  createProjectService,
} from '../../src/planning/project-service.js';
import { SkillRegistry } from '../../src/evolution/skill-registry.js';
import { createPluginRuntime } from '../../src/plugins/runtime.js';

function fakeDb(rows) {
  return {
    prepare() {
      return {
        bind() {
          return {
            all: async () => ({ results: structuredClone(rows) }),
          };
        },
      };
    },
  };
}

function project() {
  return {
    project_id: 'p-1',
    title: 'Portable project',
    objectives: ['survive provider migration'],
    status: 'ACTIVE',
    created_at: 1000,
    updated_at: 1000,
    metadata: { source: 'test' },
  };
}

function decision() {
  return {
    decision_id: 'd-1',
    project_id: 'p-1',
    title: 'Use portable contracts',
    rationale: 'Avoid lock-in',
    status: 'ADOPTED',
    decided_at: 1100,
    updated_at: 1100,
    source: 'owner',
    confidence: 1,
    metadata: {},
  };
}

function lesson() {
  return {
    lesson_id: 'l-1',
    project_id: 'p-1',
    content: 'Restore must fail closed.',
    learned_at: 1200,
    source: 'runtime',
    metadata: {},
  };
}

function plugin() {
  return {
    manifest: {
      id: 'mel.portable',
      name: 'Portable',
      version: '1.0.0',
      description: 'Portable plugin fixture',
      author: 'MEL',
      capabilities: ['echo'],
      permissions: [],
      secrets_required: [],
      dependencies: [],
      entrypoint: 'plugins/portable.js',
      healthcheck: 'echo.health',
      risk: 'LOW',
    },
    capabilities: { echo: async input => input },
    activate: async () => {},
    deactivate: async () => {},
  };
}

async function runtimeBundle() {
  const projectService = createProjectService(createInMemoryProjectAdapter({
    projects: [project()],
    decisions: [decision()],
    lessons: [lesson()],
  }));

  const skillRegistry = new SkillRegistry();
  skillRegistry.register({
    skillId: 'skill.portable',
    name: 'Portable skill',
    version: '1.0.0',
    capabilities: ['portability.verify'],
    state: 'verified',
    evidence: [{ id: 'e1', status: 'pass' }],
  });
  skillRegistry.activate('skill.portable', '1.0.0');

  const pluginRuntime = createPluginRuntime();
  await pluginRuntime.register(plugin());

  return createRuntimeProviderNeutralSystemBundle({
    db: fakeDb([{
      id: 1,
      created_at: 100,
      kind: 'fact',
      content: 'Portable memory',
      importance: 0.8,
      confidence: 1,
      valid_from: null,
      valid_until: null,
      source: 'owner',
      provenance: '{}',
      metadata: '{}',
      fingerprint: 'f-1',
    }]),
    projectService,
    skillRegistry,
    pluginRuntime,
    generatedAt: '2026-09-25T15:00:00.000Z',
    bundleSource: {
      branch: 'main',
      commit: 'a'.repeat(40),
    },
  });
}

test('GEN2-49 restores all five required runtime contracts into provider-neutral alternate runtime', async () => {
  const bundle = await runtimeBundle();
  const runtime = await restoreProviderNeutralBundleToAlternateRuntime(bundle, {
    runtimeId: 'local-memory-test',
    now: () => '2026-09-25T15:01:00.000Z',
  });

  assert.equal(runtime.schema, 'mel.provider-neutral-alternate-runtime/v1');
  assert.equal(runtime.runtime_id, 'local-memory-test');
  assert.equal(runtime.provider, null);
  assert.equal(runtime.external_side_effects, 0);
  assert.deepEqual(runtime.required_contracts, [
    'core.config',
    'memory.export',
    'planning.projects',
    'plugins.registry',
    'skills.registry',
  ]);
  assert.deepEqual(runtime.restored_contracts, runtime.required_contracts);

  assert.equal(runtime.get('memory.export').count, 1);
  assert.equal(runtime.get('memory.export').records.get('1').content, 'Portable memory');

  const projects = runtime.get('planning.projects');
  assert.deepEqual(projects.counts, { projects: 1, decisions: 1, lessons: 1 });
  assert.equal((await projects.service.getProject({ project_id: 'p-1' })).title, 'Portable project');

  const skills = runtime.get('skills.registry');
  assert.equal(skills.registry.resolve('skill.portable').version, '1.0.0');

  const plugins = runtime.get('plugins.registry');
  assert.equal(plugins.count, 1);
  assert.equal(plugins.executable_bindings, 0);
  assert.equal(plugins.records.get('mel.portable@1.0.0').name, 'Portable');

  assert.equal(runtime.get('core.config').snapshot.schema, 'mel.core-config-export/v1');
});

test('GEN2-49 restore drill proves exact payload checksums after alternate-runtime import', async () => {
  const bundle = await runtimeBundle();
  const drill = await drillProviderNeutralBundleRestore(bundle, {
    runtimeId: 'portable-drill',
  });

  assert.equal(drill.schema, 'mel.provider-neutral-restore-drill/v1');
  assert.equal(drill.ok, true);
  assert.equal(drill.artifact_count, 5);
  assert.equal(drill.provider_calls, 0);
  assert.equal(drill.external_side_effects, 0);
  assert.equal(drill.runtime.provider, null);
  assert.ok(drill.artifacts.every(row => row.restored === true));
  assert.ok(drill.artifacts.every(row => /^sha256:[0-9a-f]{64}$/.test(row.checksum)));

  const expected = new Map(bundle.artifacts.map(row => [row.contract_id, row.checksum]));
  for (const row of drill.artifacts) {
    assert.equal(row.checksum, expected.get(row.contract_id));
  }
});

test('GEN2-49 rejects tampered bundle before any restore occurs', async () => {
  const bundle = structuredClone(await runtimeBundle());
  bundle.artifacts.find(row => row.contract_id === 'memory.export').payload.records[0].memory.content = 'tampered';

  await assert.rejects(
    () => restoreProviderNeutralBundleToAlternateRuntime(bundle),
    error => {
      assert.equal(error?.code, 'PORTABILITY_RESTORE_BUNDLE_INVALID');
      assert.ok(Array.isArray(error.issues));
      return true;
    },
  );
});

test('GEN2-49 rejects semantically invalid project references even when bundle checksums are valid', async () => {
  const bundle = await createProviderNeutralSystemBundle({
    generated_at: '2026-09-25T15:00:00.000Z',
    components: [{
      id: 'projects',
      contract: {
        id: 'planning.projects',
        required: true,
      },
      export: async () => ({
        schema: 'mel.planning-projects-export/v1',
        projects: [project()],
        decisions: [{ ...decision(), project_id: 'missing-project' }],
        lessons: [],
      }),
    }],
  });

  await assert.rejects(
    () => restoreProviderNeutralBundleToAlternateRuntime(bundle),
    error => {
      assert.match(error?.code || error?.message || '', /PROJECT_NOT_FOUND/);
      return true;
    },
  );
});

test('GEN2-49 rejects plugin executable bindings in portable metadata', async () => {
  const bundle = await createProviderNeutralSystemBundle({
    generated_at: '2026-09-25T15:00:00.000Z',
    components: [{
      id: 'plugins',
      contract: {
        id: 'plugins.registry',
        required: true,
      },
      export: async () => ({
        schema: 'mel.plugin-runtime-export/v1',
        plugins: [{
          id: 'unsafe',
          version: '1.0.0',
          capabilities: ['echo'],
          permissions: [],
          plugin: 'embedded-executable-reference',
        }],
      }),
    }],
  });

  await assert.rejects(
    () => restoreProviderNeutralBundleToAlternateRuntime(bundle),
    error => error?.code === 'PORTABILITY_RESTORE_PLUGIN_EXECUTABLE_FORBIDDEN',
  );
});

test('GEN2-49 fails closed when a required future contract has no importer', async () => {
  const bundle = await createProviderNeutralSystemBundle({
    generated_at: '2026-09-25T15:00:00.000Z',
    components: [{
      id: 'future',
      contract: {
        id: 'future.required',
        version: '1',
        required: true,
      },
      export: async () => ({ schema: 'future/v1', rows: [] }),
    }],
  });

  await assert.rejects(
    () => restoreProviderNeutralBundleToAlternateRuntime(bundle),
    error => error?.code === 'PORTABILITY_RESTORE_IMPORTER_MISSING:future.required',
  );
});

test('GEN2-49 safely ignores unknown optional contract while restoring all required known contracts', async () => {
  const base = await runtimeBundle();
  const components = base.artifacts.map(artifact => ({
    id: artifact.id,
    contract: base.manifest.contracts.find(row => row.id === artifact.contract_id),
    format: artifact.format,
    export: async () => structuredClone(artifact.payload),
  }));
  components.push({
    id: 'future-optional',
    contract: {
      id: 'future.optional',
      version: '1',
      required: false,
    },
    export: async () => ({ schema: 'future.optional/v1', rows: [{ id: 'x' }] }),
  });

  const bundle = await createProviderNeutralSystemBundle({
    generated_at: '2026-09-25T15:00:00.000Z',
    components,
  });
  const drill = await drillProviderNeutralBundleRestore(bundle);

  assert.equal(drill.ok, true);
  assert.equal(drill.restored_contracts.includes('future.optional'), false);
  assert.equal(drill.required_contracts.includes('future.optional'), false);
  assert.equal(drill.artifact_count, 5);
});

test('GEN2-49 alternate runtime never exposes raw executable plugin or provider bindings', async () => {
  const runtime = await restoreProviderNeutralBundleToAlternateRuntime(await runtimeBundle());
  const plugins = runtime.get('plugins.registry');

  assert.equal(plugins.executable_bindings, 0);
  assert.equal(runtime.provider, null);
  assert.equal(runtime.external_side_effects, 0);
  assert.equal(JSON.stringify([...plugins.records.values()]).includes('secrets_required'), false);
});
