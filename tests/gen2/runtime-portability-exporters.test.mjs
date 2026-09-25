import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coreConfigPortabilitySnapshot,
  createRuntimeProviderNeutralSystemBundle,
  exportRuntimeMemory,
  exportRuntimePlugins,
  exportRuntimeProjects,
  exportRuntimeSkills,
} from '../../src/portability/runtime-exporters.js';
import { verifyProviderNeutralSystemBundle } from '../../src/portability/system-bundle.js';
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
          return { all: async () => ({ results: structuredClone(rows) }) };
        },
      };
    },
  };
}
function project(id = 'p-1') {
  return {
    project_id: id,
    title: 'Portable project',
    objectives: ['survive provider change'],
    status: 'ACTIVE',
    created_at: 1000,
    updated_at: 1000,
    metadata: { source: 'test' },
  };
}

function decision(id = 'd-1', projectId = 'p-1') {
  return {
    decision_id: id,
    project_id: projectId,
    title: 'Keep contracts provider-neutral',
    rationale: 'Avoid lock-in',
    status: 'ADOPTED',
    decided_at: 1100,
    updated_at: 1100,
    source: 'owner',
    confidence: 1,
    metadata: {},
  };
}
function lesson(id = 'l-1', projectId = 'p-1') {
  return {
    lesson_id: id,
    project_id: projectId,
    content: 'Fail closed when an exporter is missing',
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
    capabilities: { echo: async (input) => input },
    activate: async () => {},
    deactivate: async () => {},
  };
}

test('GEN2-49 exports live memory rows through the canonical portable memory format', async () => {
  const value = await exportRuntimeMemory(fakeDb([
    {
      id: 2,
      created_at: 2000,
      kind: 'fact',
      content: 'Provider-neutral memory',
      importance: 0.8,
      confidence: 0.9,
      valid_from: null,
      valid_until: null,
      source: 'owner',
      provenance: '{}',
      metadata: '{}',
      fingerprint: 'abc',
    },
  ]), {
    generatedAt: '2026-09-25T13:30:00.000Z',
    source: 'runtime-test',
  });
  assert.equal(value.manifest.record_count, 1);
  assert.equal(value.records[0].memory.id, '2');
  assert.equal(value.records[0].memory.content, 'Provider-neutral memory');
  assert.match(value.manifest.payload_sha256, /^[0-9a-f]{64}$/);
});

test('GEN2-49 exports projects decisions and lessons through the canonical service', async () => {
  const adapter = createInMemoryProjectAdapter({
    projects: [project()],
    decisions: [decision()],
    lessons: [lesson()],
  });
  const service = createProjectService(adapter);
  const value = await exportRuntimeProjects(service);

  assert.equal(value.schema, 'mel.planning-projects-export/v1');
  assert.deepEqual(value.projects.map(row => row.project_id), ['p-1']);
  assert.deepEqual(value.decisions.map(row => row.decision_id), ['d-1']);
  assert.deepEqual(value.lessons.map(row => row.lesson_id), ['l-1']);
});
test('GEN2-49 exports the actual SkillRegistry snapshot', () => {
  const registry = new SkillRegistry();
  registry.register({
    skillId: 'skill.portable',
    name: 'Portable skill',
    version: '1.0.0',
    capabilities: ['portability.verify'],
    state: 'verified',
    evidence: [{ id: 'e1', status: 'pass' }],
  });
  registry.activate('skill.portable', '1.0.0');

  const snapshot = exportRuntimeSkills(registry);
  assert.equal(snapshot.schema, 'mel.skill-registry/v1');
  assert.equal(snapshot.active['skill.portable'], '1.0.0');
});

test('GEN2-49 plugin export strips executable runtime and secret declarations', async () => {
  const runtime = createPluginRuntime();
  await runtime.register(plugin());
  const value = exportRuntimePlugins(runtime);

  assert.equal(value.schema, 'mel.plugin-runtime-export/v1');
  assert.equal(value.plugins.length, 1);
  assert.equal(value.plugins[0].id, 'mel.portable');
  assert.deepEqual(value.plugins[0].capabilities, ['echo']);
  assert.equal(Object.hasOwn(value.plugins[0], 'secrets_required'), false);
  assert.equal(Object.hasOwn(value.plugins[0], 'plugin'), false);
});

test('GEN2-49 core config export is explicit and contains no environment secrets', () => {
  const value = coreConfigPortabilitySnapshot();
  assert.equal(value.schema, 'mel.core-config-export/v1');
  assert.equal(typeof value.database.schema_version, 'number');
  assert.ok(Array.isArray(value.model_hints.allowed));
  assert.equal(Object.hasOwn(value, 'env'), false);
});

test('GEN2-49 builds and verifies a five-component runtime bundle', async () => {
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
    evidence: [{ id: 'e1', status: 'verified' }],
  });
  skillRegistry.activate('skill.portable', '1.0.0');
  const pluginRuntime = createPluginRuntime();
  await pluginRuntime.register(plugin());

  const bundle = await createRuntimeProviderNeutralSystemBundle({
    db: fakeDb([{ id: 1, content: 'portable', created_at: 1 }]),
    projectService,
    skillRegistry,
    pluginRuntime,
    generatedAt: '2026-09-25T13:30:00.000Z',
    bundleSource: { branch: 'main', commit: 'a'.repeat(40) },
  });

  assert.deepEqual(
    bundle.artifacts.map(row => row.id),
    ['config', 'memory', 'plugins', 'projects', 'skills'],
  );
  const verification = await verifyProviderNeutralSystemBundle(bundle);
  assert.equal(verification.ok, true, JSON.stringify(verification.issues));
  assert.deepEqual(
    bundle.manifest.contracts.map(row => row.id).sort(),
    ['core.config', 'memory.export', 'planning.projects', 'plugins.registry', 'skills.registry'],
  );
});

test('GEN2-49 fails closed when a required runtime exporter is not wired', async () => {
  await assert.rejects(
    () => createRuntimeProviderNeutralSystemBundle({
      db: fakeDb([]),
      generatedAt: '2026-09-25T13:30:00.000Z',
    }),
    error => [
      'PORTABILITY_PLUGIN_RUNTIME_REQUIRED',
      'PORTABILITY_PROJECT_SERVICE_REQUIRED',
      'PORTABILITY_SKILL_REGISTRY_REQUIRED',
    ].includes(error?.code),
  );
});

test('GEN2-49 refuses silent truncation of project collections', async () => {
  const projects = Array.from({ length: 500 }, (_, index) => ({ project_id: `p-${index}` }));
  await assert.rejects(
    () => exportRuntimeProjects({
      listProjects: async () => projects,
      listDecisions: async () => [],
      listLessons: async () => [],
    }),
    error => error?.code === 'PORTABILITY_PROJECTS_INCOMPLETE_PAGINATION_REQUIRED',
  );
});
