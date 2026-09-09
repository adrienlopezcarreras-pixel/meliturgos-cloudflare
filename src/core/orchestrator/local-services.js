/** Deterministic local adapters for services whose real providers are external.
 * They are deliberately in-memory and safe for tests; production persistence is injected later.
 */
export function createLocalServices() {
  const entities = new Map(), timeline = [], automations = new Map(), backups = new Map(), fixes = new Map();
  return {
    knowledgeGraph: {
      async entity(v) { const id=v.id||crypto.randomUUID(); const row={...v,id}; entities.set(id,row); return row; },
      async relation(v) { return {...v,id:v.id||crypto.randomUUID()}; },
      async query({type}={}) { return [...entities.values()].filter(x=>!type||x.type===type); },
      async supersede({id, supersedes_id}) { const row=entities.get(id); if(row) row.supersedes_id=supersedes_id; return row; }
    },
    timeline: {
      async append(v) { const row={...v,event_id:v.event_id||crypto.randomUUID()}; timeline.push(row); return row; },
      async list() { return [...timeline]; }, async get({event_id}) { return timeline.find(x=>x.event_id===event_id)||null; }
    },
    modelCouncil: {
      async queryMultiple({models=[], input}) { return models.map(model=>({model,content:`mock:${input}`})); },
      async compare({responses=[]}) { return {responses, winner:responses[0]?.model||null}; },
      async score({response}) { return {response, score: response ? 1 : 0}; },
      async synthesize({responses=[]}) { return {content:responses[0]?.content||'', provenance:{mode:'mock-council'}}; }
    },
    teachers: {
      async teach({prompt}) { return {content:`mock lesson: ${prompt}`,confidence:1,provenance:{teacher:'local'}}; },
      async critique({answer}) { return {content:'mock critique',score:answer?1:0,confidence:1,provenance:{teacher:'local'}}; },
      async evaluate({answer}) { return {score:answer?1:0,confidence:1,provenance:{teacher:'local'}}; },
      async proposeLesson({topic}) { return {content:`lesson: ${topic}`,confidence:1,provenance:{teacher:'local'}}; }
    },
    professor: {
      async createSession(v) { return {...v,id:v.id||crypto.randomUUID(),turns:[]}; },
      async submitTurn(v) { return { ...v, id: v.id||crypto.randomUUID(), better_answer:'mock answer', provenance:{teacher:'local'} }; },
      async critique(v) { return {score:1,confidence:1,provenance:{teacher:'local'},...v}; },
      async correct(v) { return {better_answer:v.answer||'mock correction',provenance:{teacher:'local'}}; },
      async createLesson(v) { return {id:crypto.randomUUID(),...v}; },
      async score() { return {score:1,confidence:1}; }, async summarizeSession() { return {summary:'mock summary',provenance:{teacher:'local'}}; }
    },
    automations: {
      async create(v) { const row={...v,id:v.id||crypto.randomUUID(),enabled:false,history:[]}; automations.set(row.id,row); return row; },
      async update(v) { const row={...automations.get(v.id),...v}; automations.set(v.id,row); return row; },
      async enable({id}) { const row=automations.get(id); row.enabled=true; return row; }, async disable({id}) { const row=automations.get(id); row.enabled=false; return row; },
      async run({id}) { const row=automations.get(id); const result={id:crypto.randomUUID(),status:row?.enabled?'SUCCEEDED':'SKIPPED'}; row?.history.push(result); return result; },
      async history({id}) { return automations.get(id)?.history||[]; }
    },
    selfHealing: {
      async health(v) { return v; }, async detect(v) { return {failure:v.failure,detected:true}; }, async diagnose(v) { return {root_cause:v.failure}; },
      async knownFix(v) { fixes.set(v.failure,v); return v; }, async candidate(v) { return {...v,status:'CANDIDATE'}; }, async test(v) { return {...v,passed:true}; }, async rollback(v) { return {...v,status:'ROLLED_BACK'}; }
    },
    backup: {
      async create(v) { const row={id:crypto.randomUUID(),payload:v}; backups.set(row.id,row); return row; }, async verify({id}) { return {id,valid:backups.has(id)}; }, async list() { return [...backups.values()]; }
    }
  };
}
