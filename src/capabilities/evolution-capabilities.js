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
 bus.discover({...common,id:'evolution.propose',name:'Proposer un développement',description:'Create an evolution proposal, without approving or deploying it',risk:'MEDIUM',permissions:['roadmap.write'],input_schema:{type:'object',properties:{id:{type:'string',minLength:1,maxLength:100},title:{type:'string',minLength:1,maxLength:240},origin:{type:'string',enum:['user','mel','audit','telemetry']}},required:['id','title','origin'],additionalProperties:false}},async(input,context={})=>{
  if(!db)throw new Error('EVOLUTION_D1_REQUIRED');
  return saveEvolutionProposal(db,context.owner,input);
 });
}
