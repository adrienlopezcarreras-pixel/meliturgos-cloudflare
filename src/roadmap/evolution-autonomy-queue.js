import { isValidEvolutionId } from './evolution-inbox.js';
// The evolving inbox is not a second ungoverned scheduler.
// Only explicit APPROVED / already-started / verified-then-REGRESSED work
// can become supervised autonomy work, and only after initial work is exhausted.
const ACTIONABLE = Object.freeze({ APPROVED: 'PLANNED', IN_PROGRESS: 'IN_PROGRESS', REGRESSED: 'PARTIAL' });
const PRIORITIES = new Set(['P0','P1','P2','P3']);

export function approvedEvolutionRoadmap(items) {
 if (!Array.isArray(items)) throw new Error('EVOLUTION_QUEUE_INVALID_ITEMS');
 if (items.length > 10000) throw new Error('EVOLUTION_QUEUE_EXCESSIVE_ITEMS');
 const output=[];
 const namespaces=new Set();
 for (const row of items) {
  if (!row || typeof row !== 'object') throw new Error('EVOLUTION_QUEUE_INVALID_ITEM');
  if (!Object.hasOwn(ACTIONABLE,row.status)) continue;
  const id=String(row.id ?? '');
  const title=String(row.title ?? '').trim();
  const priority=String(row.priority || 'P2');
  if (!isValidEvolutionId(id) || !title || title.length>240 || !PRIORITIES.has(priority)) throw new Error('EVOLUTION_QUEUE_INVALID_APPROVED_ITEM');
  const namespacedId='EVOLUTION-'+id;
  const attemptId=namespacedId.toLowerCase();
  if(namespaces.has(attemptId)) throw new Error('EVOLUTION_QUEUE_DUPLICATE_ID');
  namespaces.add(attemptId);
  output.push(Object.freeze({
   id:namespacedId, phase_id:'EVOLUTION', phase:'Évolution & Développement',
   title, priority, status:ACTIONABLE[row.status],
   next:'Développer sur la candidate canonique, Council/Teacher et tests avant toute promotion',
   evolution_id:id,
  }));
 }
 return output;
}
