import { createMentorEngine } from '../learning/mentor-engine.js';
import { MentorMemoryRepository } from '../learning/mentor-memory.js';

const inspectedFileSchema = {
  type: 'object',
  properties: {
    path: { type: 'string', minLength: 1, maxLength: 300 },
    content: { type: 'string', minLength: 0, maxLength: 45000 },
  },
  required: ['path', 'content'],
  additionalProperties: false,
};

const proposeSchema = {
  type: 'object',
  properties: {
    jobId: { type: 'string', minLength: 0, maxLength: 200 },
    goal: { type: 'string', minLength: 1, maxLength: 12000 },
    inspectedFiles: { type: 'array', items: inspectedFileSchema },
    previousAttempts: { type: 'array', items: { type: 'object', additionalProperties: true } },
    mode: { type: 'string', enum: ['implement', 'repair'] },
  },
  required: ['goal', 'inspectedFiles'],
  additionalProperties: false,
};

const learnSchema = {
  type: 'object',
  properties: {
    jobId: { type: 'string', minLength: 0, maxLength: 200 },
    goal: { type: 'string', minLength: 0, maxLength: 4000 },
    outcome: { type: 'string', minLength: 1, maxLength: 80 },
    lesson: { type: 'string', minLength: 1, maxLength: 8000 },
    evidence: { type: 'object', additionalProperties: true },
    score: { type: 'number', minimum: -100, maximum: 100 },
    tags: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 80 } },
  },
  required: ['outcome', 'lesson'],
  additionalProperties: false,
};

const recentSchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 50 },
    kind: { type: 'string', minLength: 1, maxLength: 80 },
    outcome: { type: 'string', minLength: 1, maxLength: 80 },
  },
  additionalProperties: false,
};

function capabilityError(message) {
  const error = new Error(message);
  error.code = message;
  return error;
}

export function registerMentorCapabilities(bus, env = {}) {
  bus.discover({
    id: 'mentor.propose',
    name: 'Mentor — proposer du code candidat',
    category: 'learning',
    version: '1.0.0',
    provider: 'mel',
    description: 'Uses the zero-added-cost Mentor Council to generate a bounded candidate implementation or repair proposal from inspected repository files.',
    input_schema: proposeSchema,
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM',
    permissions: [],
    health: env.AI && env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async (input) => {
    if (!env.AI) throw capabilityError('AI_BINDING_MISSING');
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    const engine = createMentorEngine(env);
    return engine.propose({
      env,
      jobId: input.jobId || null,
      goal: input.goal,
      inspectedFiles: input.inspectedFiles,
      previousAttempts: input.previousAttempts || [],
      mode: input.mode || 'implement',
    });
  });

  bus.discover({
    id: 'mentor.learn',
    name: 'Mentor — enregistrer une leçon de développement',
    category: 'learning',
    version: '1.0.0',
    provider: 'mel',
    description: 'Stores a bounded development outcome so later autonomous work can reuse proven lessons.',
    input_schema: learnSchema,
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async (input) => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    const engine = createMentorEngine(env);
    return engine.recordOutcome({
      jobId: input.jobId || null,
      goal: input.goal || '',
      outcome: input.outcome,
      lesson: input.lesson,
      evidence: input.evidence || null,
      score: input.score || 0,
      tags: input.tags || [],
    });
  });

  bus.discover({
    id: 'mentor.recent',
    name: 'Mentor — lire les leçons récentes',
    category: 'learning',
    version: '1.0.0',
    provider: 'mel',
    description: 'Returns recent persistent Mentor development lessons without exposing secrets.',
    input_schema: recentSchema,
    output_schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
    risk: 'LOW',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async (input) => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    const repository = new MentorMemoryRepository(env.DB);
    return repository.recent({
      limit: input.limit || 12,
      kind: input.kind || null,
      outcome: input.outcome || null,
    });
  });
}
