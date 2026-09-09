import { port, requireValue } from '../core/contracts.js';
export const methods=['append','list','get'];
export const createTimeline = adapters => port('timeline',methods,adapters);
export function timelineEvent(record) { requireValue(record.event_id && record.type && record.title && typeof record.description==='string' && Number.isFinite(record.occurred_at) && record.source && record.confidence>=0 && record.confidence<=1 && record.metadata); return structuredClone(record); }
