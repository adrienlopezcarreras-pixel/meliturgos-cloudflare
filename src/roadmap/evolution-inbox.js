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
 if (!proposal || !String(proposal.id||'').trim() || !evolutionKey(proposal.title) || !['user','mel','audit','telemetry'].includes(proposal.origin)) throw new Error('EVOLUTION_INVALID_PROPOSAL');
 for (const candidate of items) requireItem(candidate);
 if (items.some(i=>i.id===proposal.id)) throw new Error('EVOLUTION_DUPLICATE_ID');
 const existing=items.find(i=>evolutionKey(i.title)===evolutionKey(proposal.title));
 if (existing) return {created:false, duplicate_of:existing.id,items};
 const candidate=Object.freeze({id:proposal.id,title:String(proposal.title).trim(),origin:proposal.origin,status:'PROPOSED',priority:proposal.priority||'P2',evidence:[],related_initial_id:proposal.related_initial_id||null});
 return {created:true,item:candidate,items:Object.freeze([...items,candidate])};
}
export function transitionEvolution(item,next,{proof=null}={}) {
 requireItem(item);
 if (!allowed[item.status].includes(next)) throw new Error('EVOLUTION_INVALID_TRANSITION');
 if (next==='DONE_VERIFIED') {
  if (!proof || !/^[a-f0-9]{40}$/.test(String(proof.sha||'')) || !proof.ci_passed || !proof.real_test_passed || !proof.environment || !proof.reference) throw new Error('EVOLUTION_MISSING_VERIFICATION');
 }
 return Object.freeze({...item,status:next,evidence: next==='DONE_VERIFIED'?[...(item.evidence||[]),Object.freeze({...proof})]:(item.evidence||[])});
}
export function evolutionSnapshot({initial,items=[],incidents=[]}) {
 if (!initial || !Number.isInteger(initial.total) || !Number.isInteger(initial.verified) || initial.total<0 || initial.verified<0 || initial.verified>initial.total) throw new Error('EVOLUTION_INVALID_BASELINE');
 if (!Array.isArray(items)||!Array.isArray(incidents)) throw new Error('EVOLUTION_INVALID_REGISTRY');
 items.forEach(requireItem);
 const ids=new Set(); for(const item of items){if(ids.has(item.id))throw new Error('EVOLUTION_DUPLICATE_ID');ids.add(item.id);}
 return Object.freeze({schema:EVOLUTION_SCHEMA,initial:Object.freeze({total:initial.total,verified:initial.verified,percent_verified:initial.total?Math.round(initial.verified/initial.total*100):0}),evolution:Object.freeze({total:items.length,verified:items.filter(i=>i.status==='DONE_VERIFIED').length,proposed:items.filter(i=>i.status==='PROPOSED').length}),health:Object.freeze({active_incidents:incidents.filter(i=>!i.resolved).length}),items:Object.freeze([...items])});
}
