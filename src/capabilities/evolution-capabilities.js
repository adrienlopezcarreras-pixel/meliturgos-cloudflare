import { prepareGapProposal } from '../roadmap/evolution-gap-capture.js';
import { saveEvolutionProposal, getEvolutionDashboard, changeEvolutionStatus } from '../roadmap/evolution-storage.js';
import { roadmapSummary } from '../roadmap/master-roadmap.js';

// All operations use the existing CapabilityBus permission and validation gates.
// Schema creation is an explicit deployment migration, never a read side effect.
export function registerEvolutionCapabilities(bus,{db}={}) {
 const healthcheck=async()=>{
  if(!db||typeof db.prepare!=='function')return {status:'UNAVAILABLE',reason:'EVOLUTION_D1_REQUIRED'};
  try {
   await db.prepare('SELECT 1 FROM mel_evolution_items LIMIT 1').first();
   await db.prepare('SELECT 1 FROM mel_evolution_initial_archive LIMIT 1').first();
   return {status:'HEALTHY'};
  }catch{return {status:'UNAVAILABLE',reason:'EVOLUTION_SCHEMA_V18_NOT_READY'};}
 };
 const common={category:'roadmap',version:'1.0.0',provider:'core',output_schema:{type:'object',additionalProperties:true},health:db?'UNTESTED':'UNAVAILABLE',healthcheck,enabled:true};
 bus.discover({...common,id:'evolution.list',name:'Bac de développement MEL',description:'Read current evolutions without changing the historical roadmap',risk:'LOW',permissions:[],input_schema:{type:'object',properties:{},additionalProperties:false}},async(_input,context={})=>{
  if(!db)throw new Error('EVOLUTION_D1_REQUIRED');
  const initial=roadmapSummary();
  const result=await getEvolutionDashboard(db,context.owner,{total:initial.total,verified:initial.complete});
  const reviewAllowed=Array.isArray(context.permissions)&&context.permissions.includes('roadmap.approve');
  return {...result,review_access:{
   available:reviewAllowed,required_permission:'roadmap.approve',
   confirmation_required:true,auto_approval:false
  }};
 });
 bus.discover({...common,id:'evolution.gap.capture',name:'Signaler une compétence absente',description:'Safely assess a capability gap and capture a deduplicated PROPOSED-only evolution',risk:'MEDIUM',permissions:['roadmap.write'],input_schema:{type:'object',properties:{goal:{type:'string',minLength:5,maxLength:240},threshold:{type:'integer',minimum:1,maximum:6}},required:['goal'],additionalProperties:false}},async(input,context={})=>{
  if(!db)throw new Error('EVOLUTION_D1_REQUIRED');
  const prepared=prepareGapProposal({goal:input.goal,threshold:input.threshold,capabilities:bus.list()});
  if(!prepared.proposable)return {created:false,classification:prepared.assessment.classification,reason:'EXISTING_OR_AMBIGUOUS_CAPABILITY',candidates:prepared.assessment.candidates};
  const persisted=await saveEvolutionProposal(db,context.owner,prepared.proposal);
  return {created:persisted.created,classification:prepared.assessment.classification,duplicate_of:persisted.duplicate_of||null,item:persisted.item||null,status:'PROPOSED_ONLY_NOT_APPROVED'};
 });
 bus.discover({...common,
  id:'evolution.review',name:'Examiner et approuver un développement MEL',
  description:'Explicit owner-only review: PROPOSED to TRIAGED, TRIAGED to APPROVED or REJECTED. Never deploys or verifies.',
  risk:'HIGH',permissions:['roadmap.approve'],
  approval:{required:true,scope:'evolution.review',reason:'Explicit owner review required'},
  input_schema:{type:'object',properties:{
   id:{type:'string',minLength:1,maxLength:100},
   expected_revision:{type:'integer',minimum:1},
   next:{type:'string',enum:['TRIAGED','APPROVED','REJECTED']}
  },required:['id','expected_revision','next'],additionalProperties:false}
 },async(input,context={})=>{
  if(!db)throw new Error('EVOLUTION_D1_REQUIRED');
  const changed=await changeEvolutionStatus(db,context.owner,input.id,input.expected_revision,input.next);
  return {item:changed.item,revision:changed.revision,authorized_review:true,auto_deployed:false};
 });
 bus.discover({...common,id:'evolution.propose',name:'Proposer un développement',description:'Create an evolution proposal, without approving or deploying it',risk:'MEDIUM',permissions:['roadmap.write'],input_schema:{type:'object',properties:{id:{type:'string',minLength:1,maxLength:70},title:{type:'string',minLength:1,maxLength:240},origin:{type:'string',enum:['user','mel','audit','telemetry']}},required:['id','title','origin'],additionalProperties:false}},async(input,context={})=>{
  if(!db)throw new Error('EVOLUTION_D1_REQUIRED');
  return saveEvolutionProposal(db,context.owner,input);
 });
}
