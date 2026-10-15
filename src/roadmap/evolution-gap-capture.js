import { detectCapabilityGap } from '../evolution/capability-gap-detector.js';

// Only a confident *absence* may open a proposal. Ambiguous matches,
// blocked dependencies and existing healthy/degraded capabilities are not
// evidence that new code is needed.
export function prepareGapProposal({ goal, capabilities=[], threshold=2 } = {}) {
 const normalizedGoal=String(goal||'').trim().replace(/\s+/g,' ');
 if (normalizedGoal.length<5 || normalizedGoal.length>240) throw new Error('EVOLUTION_GAP_GOAL_INVALID');
 const result=detectCapabilityGap({goal:normalizedGoal,capabilities,threshold});
 if(result.classification!=='POSSIBLE_GAP') {
  return {proposable:false,assessment:result,reason:result.classification};
 }
 const idPart=normalizedGoal.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,58).replace(/-$/,'');
 if (!idPart) throw new Error('EVOLUTION_GAP_ID_INVALID');
 return {
  proposable:true,
  assessment:result,
  proposal:{id:'EVOL-'+idPart,title:normalizedGoal,origin:'mel',priority:'P2'}
 };
}
