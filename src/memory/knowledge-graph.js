import { port, requireValue } from '../core/contracts.js';
export const ENTITY_TYPES=Object.freeze(['PERSON','PROJECT','PLACE','ORGANIZATION','EVENT','DOCUMENT','TOPIC','DECISION','TASK']);
export const methods=['entity','relation','query','supersede'];
export const createKnowledgeGraph = adapters => port('knowledge-graph',methods,adapters);
export function validateEntity(record) { requireValue(ENTITY_TYPES.includes(record.type) && record.name && record.source && record.confidence>=0 && record.confidence<=1); return record; }
export function validateRelation(record) { requireValue(record.subject && record.relation && record.object && record.source && record.confidence>=0 && record.confidence<=1); return record; }
