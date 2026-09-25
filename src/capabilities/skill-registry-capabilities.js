import { restoreD1SkillRegistry } from '../evolution/d1-skill-registry-store.js';
import { SkillRegistryEvidenceBridge } from '../evolution/skill-registry-evidence-bridge.js';
import { createLearningEngine } from '../learning/learning-engine.js';

function skillError(code, status = 503) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

const ID = { type:'string', minLength:1, maxLength:200 };
const NAME = { type:'string', minLength:1, maxLength:500 };
const VERSION = { type:'string', minLength:1, maxLength:200 };
const CAPABILITIES = {
  type:'array',
  items:{ type:'string', minLength:1, maxLength:200 },
  minItems:1,
  maxItems:100,
};
const METADATA = { type:'object', maxProperties:100, additionalProperties:true };
const EVIDENCE_OBJECT = { type:'object', maxProperties:100, additionalProperties:true };

function requireDb(db) {
  if (!db) throw skillError('SKILL_REGISTRY_DB_REQUIRED');
}

async function runtime(db) {
  requireDb(db);
  const registry = await restoreD1SkillRegistry(db, { registryKey:'system' });
  return {
    registry,
    bridge: new SkillRegistryEvidenceBridge(registry),
  };
}

function capability(bus, record, execute) {
  bus.discover({
    version:'1.0.0',
    provider:'core',
    permissions:[],
    enabled:true,
    ...record,
  }, execute);
}

export function registerSkillRegistryCapabilities(bus, { env = {} } = {}) {
  const db = env.DB;
  const health = db ? 'HEALTHY' : 'UNAVAILABLE';

  capability(bus, {
    id:'skill.list',
    name:'Lister le Skill Registry',
    category:'evolution',
    description:'Lists the durable portable Skill Registry with optional capability and active-version filters.',
    input_schema:{
      type:'object',
      properties:{
        capability:ID,
        active_only:{ type:'boolean' },
      },
      additionalProperties:false,
    },
    output_schema:{ type:'array', items:{ type:'object', additionalProperties:true } },
    risk:'LOW',
    health,
  }, async input => {
    const { registry } = await runtime(db);
    return registry.list({
      capability: input.capability || null,
      activeOnly: input.active_only === true,
    });
  });

  capability(bus, {
    id:'skill.resolve',
    name:'Résoudre une compétence',
    category:'evolution',
    description:'Resolves an active or explicitly versioned immutable skill record.',
    input_schema:{
      type:'object',
      properties:{ skill_id:ID, version:VERSION },
      required:['skill_id'],
      additionalProperties:false,
    },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'LOW',
    health,
  }, async input => {
    const { registry } = await runtime(db);
    return registry.resolve(input.skill_id, input.version || null);
  });

  capability(bus, {
    id:'skill.history',
    name:'Historique de compétence',
    category:'evolution',
    description:'Reads every immutable version registered for one skill.',
    input_schema:{
      type:'object',
      properties:{ skill_id:ID },
      required:['skill_id'],
      additionalProperties:false,
    },
    output_schema:{ type:'array', items:{ type:'object', additionalProperties:true } },
    risk:'LOW',
    health,
  }, async input => {
    const { registry } = await runtime(db);
    return registry.history(input.skill_id);
  });

  capability(bus, {
    id:'skill.snapshot.export',
    name:'Exporter le Skill Registry',
    category:'evolution',
    description:'Exports the portable mel.skill-registry/v1 snapshot without modifying D1.',
    input_schema:{ type:'object', additionalProperties:false },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'LOW',
    health,
  }, async () => {
    const { registry } = await runtime(db);
    return registry.exportSnapshot();
  });

  capability(bus, {
    id:'skill.module.candidate.register',
    name:'Enregistrer une compétence candidate Module Lab',
    category:'evolution',
    description:'Registers a non-activatable candidate skill only after the complete Module Lab candidate pipeline has passed.',
    input_schema:{
      type:'object',
      properties:{
        skill_id:ID,
        name:NAME,
        version:VERSION,
        capabilities:CAPABILITIES,
        pipeline:EVIDENCE_OBJECT,
        metadata:METADATA,
      },
      required:['skill_id','name','version','capabilities','pipeline'],
      additionalProperties:false,
    },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'MEDIUM',
    health,
  }, async input => {
    const { bridge } = await runtime(db);
    return bridge.registerModuleCandidate({
      skillId:input.skill_id,
      name:input.name,
      version:input.version,
      capabilities:input.capabilities,
      pipeline:input.pipeline,
      metadata:input.metadata || {},
      persist:true,
    });
  });

  capability(bus, {
    id:'skill.module.release.verify',
    name:'Vérifier et activer une compétence Module Lab',
    category:'evolution',
    description:'Creates a distinct verified immutable skill version from a candidate only with approval, tests, sandbox, security, artifact digest and exact source SHA.',
    input_schema:{
      type:'object',
      properties:{
        skill_id:ID,
        name:NAME,
        candidate_version:VERSION,
        verified_version:VERSION,
        capabilities:CAPABILITIES,
        release_evidence:EVIDENCE_OBJECT,
        metadata:METADATA,
        activate:{ type:'boolean' },
      },
      required:['skill_id','candidate_version','verified_version','release_evidence'],
      additionalProperties:false,
    },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'HIGH',
    health,
  }, async input => {
    const { bridge } = await runtime(db);
    return bridge.verifyModuleRelease({
      skillId:input.skill_id,
      name:input.name,
      candidateVersion:input.candidate_version,
      verifiedVersion:input.verified_version,
      capabilities:input.capabilities,
      releaseEvidence:input.release_evidence,
      metadata:input.metadata || {},
      activate:input.activate !== false,
      persist:true,
    });
  });

  capability(bus, {
    id:'skill.learning.sync',
    name:'Compiler un adaptateur appris dans le Skill Registry',
    category:'evolution',
    description:'Compiles the currently active LearningEngine adapter into a verified skill only when its persisted approval and benchmark promotion evidence are valid.',
    input_schema:{
      type:'object',
      properties:{
        skill_id:ID,
        name:NAME,
        version:VERSION,
        capabilities:CAPABILITIES,
        metadata:METADATA,
        activate:{ type:'boolean' },
      },
      required:['skill_id','name','version','capabilities'],
      additionalProperties:false,
    },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'HIGH',
    health,
  }, async input => {
    const { bridge } = await runtime(db);
    return bridge.syncLearningEngine({
      learningEngine:createLearningEngine(env),
      skillId:input.skill_id,
      name:input.name,
      version:input.version,
      capabilities:input.capabilities,
      metadata:input.metadata || {},
      activate:input.activate !== false,
      persist:true,
    });
  });

  capability(bus, {
    id:'skill.rollback',
    name:'Rollback de compétence',
    category:'evolution',
    description:'Rolls one skill back only to a previously verified immutable version and persists the activation history.',
    input_schema:{
      type:'object',
      properties:{ skill_id:ID, target_version:VERSION },
      required:['skill_id'],
      additionalProperties:false,
    },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'HIGH',
    health,
  }, async input => {
    const { registry } = await runtime(db);
    const result = registry.rollback(input.skill_id, input.target_version || null);
    await registry.persist();
    return result;
  });
}
