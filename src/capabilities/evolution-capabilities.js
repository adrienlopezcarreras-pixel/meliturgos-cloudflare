import { prepareGapProposal } from '../roadmap/evolution-gap-capture.js';
import { saveEvolutionProposal, getEvolutionDashboard } from '../roadmap/evolution-storage.js';
import { roadmapSummary } from '../roadmap/master-roadmap.js';

// All operations use the existing CapabilityBus permission and validation gates.
// Schema creation is an explicit deployment migration, never a read side effect.
export function registerEvolutionCapabilities(bus,{db}={}) {
 const common={category:'roadmap',version:'1.0.0',provider:'core',output_schema:{type:'object',additionalProperties:true},health:db?'HEALTHY':'UNAVAILABLE',enabled:true};
 bus.discover({...common,id:'evolution.list',name:'Bac de développement MEL',description:'Read current evolutions without changing the historical roadmap',risk:'LOW',permissions:[],input_schema:{type:'object',properties:{},additionalProperties:false}},async(_input,context={})=>{
  if(!db)throw new Error('EVOLUTION_D1_REQUIRED');
  const initial=roadmapSummary();
  return getEvolutionDashboard(db,context.owner,{total:initial.total,verified:initial.complete});
 });
 bus.discover({...common,id:'evolution.gap.capture',name:'Signaler une compétence absente',description:'Safely assess a capability gap and capture a deduplicated PROPOSED-only evolution',risk:'MEDIUM',permissions:['roadmap.write'],input_schema:{type:'object',properties:{goal:{type:'string',minLength:5,maxLength:240},threshold:{type:'integer',minimum:1,maximum:6}},required:['goal'],additionalProperties:false}},async(input,context={})=>{
  if(!db)throw new Error('EVOLUTION_D1_REQUIRED');
  const prepared=prepareGapProposal({goal:input.goal,threshold:input.threshold,capabilities:bus.list()});
  if(!prepared.proposable)return {created:false,classification:prepared.assessment.classification,reason:'EXISTING_OR_AMBIGUOUS_CAPABILITY',candidates:prepared.assessment.candidates};
  const persisted=await saveEvolutionProposal(db,context.owner,prepared.proposal);
  return {created:persisted.created,classification:prepared.assessment.classification,duplicate_of:persisted.duplicate_of||null,item:persisted.item||null,status:'PROPOSED_ONLY_NOT_APPROVED'};
 });
 bus.discover({...common,id:'evolution.propose',name:'Proposer un développement',description:'Create an evolution proposal, without approving or deploying it',risk:'MEDIUM',permissions:['roadmap.write'],input_schema:{type:'object',properties:{id:{type:'string',minLength:1,maxLength:100},title:{type:'string',minLength:1,maxLength:240},origin:{type:'string',enum:['user','mel','audit','telemetry']}},required:['id','title','origin'],additionalProperties:false}},async(input,context={})=>{
  if(!db)throw new Error('EVOLUTION_D1_REQUIRED');
  return saveEvolutionProposal(db,context.owner,input);
 });
}
