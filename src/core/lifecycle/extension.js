import { requireValue } from '../contracts.js';
export const MODULE_STATES = Object.freeze(['DRAFT','GENERATED','VALIDATED','TESTED','CANDIDATE','ACTIVE','DISABLED','FAILED','ROLLED_BACK']);
export const PLUGIN_STATES = Object.freeze(['DISCOVERED','VALIDATED','CANDIDATE','TESTED','ACTIVE','DISABLED','FAILED','ROLLED_BACK']);
export const MODULE_PIPELINE = Object.freeze(['NEED','SPEC','MANIFEST','GENERATE','VALIDATE','TEST','SANDBOX','SECURITY_REVIEW','CANDIDATE','ACTIVATE','MONITOR','ROLLBACK']);
const edges = {
 module: {DRAFT:['GENERATED'], GENERATED:['VALIDATED'], VALIDATED:['TESTED'], TESTED:['CANDIDATE'], CANDIDATE:['ACTIVE'], ACTIVE:['DISABLED','ROLLED_BACK'], DISABLED:['CANDIDATE'], FAILED:['DRAFT'], ROLLED_BACK:['DRAFT']},
 plugin: {DISCOVERED:['VALIDATED'], VALIDATED:['CANDIDATE'], CANDIDATE:['TESTED'], TESTED:['ACTIVE'], ACTIVE:['DISABLED','ROLLED_BACK'], DISABLED:['CANDIDATE'], FAILED:['DISCOVERED'], ROLLED_BACK:['DISCOVERED']}
};
/** Proofs must be loaded from server-owned test/review records for this exact version. */
export function transition(record, next, proofs = {}, kind = 'module') {
  requireValue(edges[kind]?.[record.status]?.includes(next) || (next === 'FAILED' && record.status !== 'ACTIVE'), 'INVALID_TRANSITION', 409);
  if (next === 'TESTED') requireValue(proofs.tests === true && proofs.version === record.version, 'TEST_EVIDENCE_REQUIRED', 409);
  if (next === 'ACTIVE' || (kind === 'module' && next === 'CANDIDATE')) requireValue(proofs.tests === true && proofs.sandbox === true && proofs.security === true && proofs.version === record.version, 'REVIEW_EVIDENCE_REQUIRED', 409);
  if (next === 'ACTIVE') requireValue(proofs.activation === true, 'ACTIVATION_REQUIRED', 409);
  return {...record,status:next,updated_at:Date.now()};
}
