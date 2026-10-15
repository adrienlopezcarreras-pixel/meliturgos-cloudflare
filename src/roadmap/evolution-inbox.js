// Shared ID contract: D1 proposal IDs must remain schedulable by the
// supervised autonomy queue. Namespacing and job IDs are derived from them.
export const EVOLUTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,69}$/;
export function isValidEvolutionId(value) {
 return typeof value === 'string' && EVOLUTION_ID_PATTERN.test(value);
}
// Pure, deterministic evolution inbox. Persistence and authorization are handled by callers.
export const EVOLUTION_SCHEMA = 'mel.roadmap.evolution.v1';
export const EVOLUTION_STATUSES = Object.freeze(['PROPOSED','TRIAGED','APPROVED','IN_PROGRESS','IMPLEMENTED','TESTING','DONE_VERIFIED','DUPLICATE','REJECTED','BLOCKED_HUMAN','BLOCKED_EXTERNAL','FAILED','ROLLED_BACK','REGRESSED']);
const allowed = Object.freeze({
 PROPOSED:['TRIAGED','DUPLICATE','REJECTED'],
 TRIAGED:['APPROVED','DUPLICATE','REJECTED','BLOCKED_HUMAN','BLOCKED_EXTERNAL'],
 APPROVED:['IN_PROGRESS','BLOCKED_HUMAN','BLOCKED_EXTERNAL'],
 IN_PROGRESS:['IMPLEMENTED','FAILED','BLOCKED_HUMAN','BLOCKED_EXTERNAL'],
 IMPLEMENTED:['TESTING','FAILED'],
 TESTING:['DONE_VERIFIED','FAILED','IN_PROGRESS'],
 DONE_VERIFIED:['REGRESSED'],
 REGRESSED:['IN_PROGRESS','BLOCKED_HUMAN','BLOCKED_EXTERNAL'],
 FAILED:['IN_PROGRESS','REJECTED'],
 BLOCKED_HUMAN:['TRIAGED','IN_PROGRESS'],
 BLOCKED_EXTERNAL:['TRIAGED','IN_PROGRESS'],
 ROLLED_BACK:['IN_PROGRESS'],
 DUPLICATE:[], REJECTED:[]
});
export function evolutionKey(title) {
 return String(title ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function requireItem(item) {
 if (!item || typeof item !== 'object' || !String(item.id||'').trim() || !evolutionKey(item.title) || !EVOLUTION_STATUSES.includes(item.status)) throw new Error('EVOLUTION_INVALID_ITEM');
 return item;
}
export function proposeEvolution(items, proposal) {
 if (!Array.isArray(items)) throw new Error('EVOLUTION_INVALID_REGISTRY');
 if (!proposal || !isValidEvolutionId(proposal.id) || !evolutionKey(proposal.title) || !['user','mel','audit','telemetry'].includes(proposal.origin)) throw new Error('EVOLUTION_INVALID_PROPOSAL');
 for (const candidate of items) requireItem(candidate);
 if (items.some(i=>i.id.toLowerCase()===proposal.id.toLowerCase())) throw new Error('EVOLUTION_DUPLICATE_ID');
 const existing=items.find(i=>evolutionKey(i.title)===evolutionKey(proposal.title));
 if (existing) return {created:false, duplicate_of:existing.id,items};
 const candidate=Object.freeze({id:proposal.id,title:String(proposal.title).trim(),origin:proposal.origin,status:'PROPOSED',priority:proposal.priority||'P2',evidence:[],related_initial_id:proposal.related_initial_id||null});
 return {created:true,item:candidate,items:Object.freeze([...items,candidate])};
}
export function transitionEvolution(item,next,{proof=null}={}) {
 requireItem(item);
 if (!allowed[item.status].includes(next)) throw new Error('EVOLUTION_INVALID_TRANSITION');
 if (next==='DONE_VERIFIED') {
  if (!proof || typeof proof.sha !== 'string' || !/^[a-f0-9]{40}$/.test(proof.sha) || proof.ci_passed !== true || proof.real_test_passed !== true || typeof proof.environment !== 'string' || !proof.environment.trim() || typeof proof.reference !== 'string' || !proof.reference.trim()) throw new Error('EVOLUTION_MISSING_VERIFICATION');
 }
 return Object.freeze({...item,status:next,evidence: next==='DONE_VERIFIED'?[...(item.evidence||[]),Object.freeze({...proof})]:(item.evidence||[])});
}
export function evolutionSnapshot({initial,items=[],incidents=null}) {
 if (!initial || !Number.isInteger(initial.total) || !Number.isInteger(initial.verified) || initial.total<0 || initial.verified<0 || initial.verified>initial.total) throw new Error('EVOLUTION_INVALID_BASELINE');
 if (!Array.isArray(items)||(incidents!==null&&!Array.isArray(incidents))) throw new Error('EVOLUTION_INVALID_REGISTRY');
 items.forEach(requireItem);
 const ids=new Set(); for(const item of items){const canonicalId=item.id.toLowerCase();if(ids.has(canonicalId))throw new Error('EVOLUTION_DUPLICATE_ID');ids.add(canonicalId);}
 return Object.freeze({schema:EVOLUTION_SCHEMA,initial:Object.freeze({total:initial.total,verified:initial.verified,percent_verified:initial.total?Math.round(initial.verified/initial.total*100):0}),evolution:Object.freeze({total:items.length,verified:items.filter(i=>i.status==='DONE_VERIFIED').length,proposed:items.filter(i=>i.status==='PROPOSED').length}),health:Object.freeze({status:incidents===null?'NOT_CONNECTED':'CONNECTED',active_incidents:incidents===null?null:incidents.filter(i=>!i.resolved).length,regressed_items:items.filter(i=>i.status==='REGRESSED').length}),items:Object.freeze([...items])});
}
