import { createPortableMemoryExport } from '../memory/portable-export.js';
import {
  ALLOWED_MODELS,
  APP_NAME,
  APP_VERSION,
  DB_SCHEMA_VERSION,
  DEFAULT_CONVERSATION_MODEL,
  DEFAULTS,
} from '../core/config.js';
import { createProviderNeutralSystemBundle } from './system-bundle.js';

const MAX_MEMORY_RECORDS = 100000;
const SERVICE_PAGE_LIMIT = 500;

function portabilityError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function requireMethod(target, method, code) {
  if (!target || typeof target[method] !== 'function') throw portabilityError(code, 503);
  return target[method].bind(target);
}
function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function ensureCompletePage(rows, code) {
  if (!Array.isArray(rows)) throw portabilityError(code, 500);
  if (rows.length >= SERVICE_PAGE_LIMIT) {
    throw portabilityError(`${code}_PAGINATION_REQUIRED`, 409);
  }
  return rows;
}

function normalizedPluginRecord(record = {}) {
  const manifest = record?.manifest || {};
  return {
    id: String(record?.id || manifest.id || ''),
    version: String(record?.version || manifest.version || ''),
    name: String(manifest.name || ''),
    description: String(manifest.description || ''),
    author: String(manifest.author || ''),
    capabilities: Array.isArray(manifest.capabilities) ? [...manifest.capabilities] : [],
    permissions: Array.isArray(manifest.permissions) ? [...manifest.permissions] : [],
    dependencies: Array.isArray(manifest.dependencies) ? [...manifest.dependencies] : [],
    entrypoint: String(manifest.entrypoint || ''),
    healthcheck: String(manifest.healthcheck || ''),
    risk: String(manifest.risk || ''),
    status: String(record?.status || ''),
    registered_at: Number(record?.registered_at || 0),
    updated_at: Number(record?.updated_at || 0),
    error: record?.error == null ? null : String(record.error),
  };
}

export function coreConfigPortabilitySnapshot() {
  return Object.freeze({
    schema: 'mel.core-config-export/v1',
    app: Object.freeze({
      name: APP_NAME,
      version: APP_VERSION,
    }),
    defaults: Object.freeze(clone(DEFAULTS)),
    model_hints: Object.freeze({
      allowed: Object.freeze([...ALLOWED_MODELS]),
      default_conversation: DEFAULT_CONVERSATION_MODEL,
    }),
    database: Object.freeze({
      schema_version: DB_SCHEMA_VERSION,
    }),
  });
}

export async function exportRuntimeMemory(db, {
  generatedAt = new Date().toISOString(),
  source = 'meliturgos-runtime',
} = {}) {
  if (!db || typeof db.prepare !== 'function') {
    throw portabilityError('PORTABILITY_MEMORY_DB_REQUIRED', 503);
  }
  const result = await db.prepare(`SELECT
      id,created_at,kind,content,importance,confidence,valid_from,valid_until,
      source,provenance,metadata,fingerprint
    FROM memories
    ORDER BY id ASC
    LIMIT ?`).bind(MAX_MEMORY_RECORDS + 1).all();
  const rows = Array.isArray(result?.results) ? result.results : [];
  if (rows.length > MAX_MEMORY_RECORDS) {
    throw portabilityError('PORTABILITY_MEMORY_EXPORT_TOO_LARGE', 409);
  }
  return createPortableMemoryExport(rows.map((row) => ({
    ...row,
    id: String(row.id),
    content: String(row.content || ''),
  })), { generatedAt, source });
}

export async function exportRuntimeProjects(projectService) {
  const listProjects = requireMethod(projectService, 'listProjects', 'PORTABILITY_PROJECT_SERVICE_REQUIRED');
  const listDecisions = requireMethod(projectService, 'listDecisions', 'PORTABILITY_PROJECT_SERVICE_REQUIRED');
  const listLessons = requireMethod(projectService, 'listLessons', 'PORTABILITY_PROJECT_SERVICE_REQUIRED');
  const projects = ensureCompletePage(
    await listProjects({ limit: SERVICE_PAGE_LIMIT, order: 'asc' }),
    'PORTABILITY_PROJECTS_INCOMPLETE',
  );

  const decisions = [];
  const lessons = [];
  for (const project of projects) {
    const projectId = String(project?.project_id || '');
    if (!projectId) throw portabilityError('PORTABILITY_PROJECT_ID_INVALID', 500);
    const projectDecisions = ensureCompletePage(
      await listDecisions({ project_id: projectId, limit: SERVICE_PAGE_LIMIT, order: 'asc' }),
      'PORTABILITY_DECISIONS_INCOMPLETE',
    );
    const projectLessons = ensureCompletePage(
      await listLessons({ project_id: projectId, limit: SERVICE_PAGE_LIMIT, order: 'asc' }),
      'PORTABILITY_LESSONS_INCOMPLETE',
    );
    decisions.push(...projectDecisions);
    lessons.push(...projectLessons);
  }

  decisions.sort((a, b) => String(a.decision_id).localeCompare(String(b.decision_id)));
  lessons.sort((a, b) => String(a.lesson_id).localeCompare(String(b.lesson_id)));
  return Object.freeze({
    schema: 'mel.planning-projects-export/v1',
    projects: Object.freeze(projects.map(clone)),
    decisions: Object.freeze(decisions.map(clone)),
    lessons: Object.freeze(lessons.map(clone)),
  });
}

export function exportRuntimeSkills(skillRegistry) {
  const exportSnapshot = requireMethod(skillRegistry, 'exportSnapshot', 'PORTABILITY_SKILL_REGISTRY_REQUIRED');
  return exportSnapshot();
}

export function exportRuntimePlugins(pluginRuntime) {
  const list = requireMethod(pluginRuntime, 'list', 'PORTABILITY_PLUGIN_RUNTIME_REQUIRED');
  const plugins = list();
  if (!Array.isArray(plugins)) throw portabilityError('PORTABILITY_PLUGIN_LIST_INVALID', 500);
  return Object.freeze({
    schema: 'mel.plugin-runtime-export/v1',
    plugins: Object.freeze(plugins.map(normalizedPluginRecord)
      .sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version))),
  });
}

export function createRuntimePortabilityComponents({
  db,
  projectService,
  skillRegistry,
  pluginRuntime,
  generatedAt = new Date().toISOString(),
  source = 'meliturgos-runtime',
} = {}) {
  return [
    {
      id: 'memory',
      contract: {
        id: 'memory.export',
        version: '1.0.0',
        required: true,
        description: 'Portable cognitive memory records from the live D1 memory table',
      },
      format: 'application/json',
      export: () => exportRuntimeMemory(db, { generatedAt, source }),
    },
    {
      id: 'projects',
      contract: {
        id: 'planning.projects',
        version: '1',
        required: true,
        description: 'Projects, decisions and lessons from the canonical planning service',
      },
      format: 'application/json',
      export: () => exportRuntimeProjects(projectService),
    },
    {
      id: 'skills',
      contract: {
        id: 'skills.registry',
        version: '1',
        required: true,
        description: 'Canonical skill registry snapshot',
      },
      format: 'application/json',
      export: async () => exportRuntimeSkills(skillRegistry),
    },
    {
      id: 'plugins',
      contract: {
        id: 'plugins.registry',
        version: '1',
        required: true,
        description: 'Installed plugin runtime records without runtime bindings',
      },
      format: 'application/json',
      export: async () => exportRuntimePlugins(pluginRuntime),
    },
    {
      id: 'config',
      contract: {
        id: 'core.config',
        version: '1',
        required: true,
        description: 'Portable non-secret core runtime configuration',
      },
      format: 'application/json',
      export: async () => coreConfigPortabilitySnapshot(),
    },
  ];
}

export async function createRuntimeProviderNeutralSystemBundle({
  db,
  projectService,
  skillRegistry,
  pluginRuntime,
  generatedAt = new Date().toISOString(),
  exportSource = 'meliturgos-runtime',
  bundleSource = {},
  adapters = [],
  metadata = {},
} = {}) {
  return createProviderNeutralSystemBundle({
    generated_at: generatedAt,
    source: bundleSource,
    components: createRuntimePortabilityComponents({
      db,
      projectService,
      skillRegistry,
      pluginRuntime,
      generatedAt,
      source: exportSource,
    }),
    adapters,
    metadata,
  });
}
