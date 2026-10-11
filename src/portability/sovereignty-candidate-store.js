function clean(v,max=500){return String(v||'').trim().slice(0,max);}
function key(layer,id){return `${clean(layer,80)}::${clean(id,220)}`; }

export function scopeSovereigntyCandidateStore(store,{keys=[]}={}){
  if(!store||typeof store.list!=='function'||typeof store.setStatus!=='function'){
    throw Object.assign(new TypeError('SOVEREIGNTY_CANDIDATE_STORE_REQUIRED'),{code:'SOVEREIGNTY_CANDIDATE_STORE_REQUIRED'});
  }
  const wanted=new Set((Array.isArray(keys)?keys:[]).map(value=>clean(value,320)).filter(Boolean));
  if(!wanted.size){
    throw Object.assign(new TypeError('SOVEREIGNTY_CANDIDATE_SCOPE_REQUIRED'),{code:'SOVEREIGNTY_CANDIDATE_SCOPE_REQUIRED'});
  }
  return Object.freeze({
    async list({status=null,limit=200}={}){
      const cap=Math.max(1,Math.min(500,Number(limit)||200));
      const rows=await store.list({status,limit:500});
      return (Array.isArray(rows)?rows:[])
        .filter(row=>wanted.has(key(row?.layer,row?.id)))
        .slice(0,cap);
    },
    setStatus(input){return store.setStatus(input);},
  });
}

export class SovereigntyCandidateStore{
  constructor(db){
    if(!db)throw Object.assign(new Error('SOVEREIGNTY_CANDIDATE_DB_REQUIRED'),{code:'SOVEREIGNTY_CANDIDATE_DB_REQUIRED'});
    this.db=db;
    this._ready=false;
  }

  async ready(){
    if(this._ready)return this;
    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_sovereignty_candidates (
      candidate_key TEXT PRIMARY KEY,
      layer TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      provider_hint TEXT,
      source_url TEXT,
      source_title TEXT,
      status TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      seen_count INTEGER NOT NULL,
      metadata_json TEXT NOT NULL
    )`).run();
    this._ready=true;
    return this;
  }

  async upsertFromWatch(report,{now=Date.now()}={}){
    await this.ready();
    let touched=0;
    for(const row of Array.isArray(report?.results)?report.results:[]){
      const layer=clean(row?.layer,80);
      for(const candidate of Array.isArray(row?.candidate_hints)?row.candidate_hints:[]){
        const id=clean(candidate?.id,220);
        if(!layer||!id)continue;
        const candidateKey=key(layer,id);
        const existing=await this.db.prepare(
          'SELECT first_seen_at,seen_count,status FROM mel_sovereignty_candidates WHERE candidate_key=?'
        ).bind(candidateKey).first();
        const status=['PREVALIDATED','REJECTED'].includes(String(existing?.status||'').toUpperCase())
          ? String(existing.status).toUpperCase()
          : 'UNVERIFIED';
        const meta={
          prevalidated:false,
          activation_allowed:false,
          source_status:clean(candidate?.status,80)||'UNVERIFIED',
        };
        await this.db.prepare(`INSERT INTO mel_sovereignty_candidates(
          candidate_key,layer,candidate_id,provider_hint,source_url,source_title,status,
          first_seen_at,last_seen_at,seen_count,metadata_json
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(candidate_key) DO UPDATE SET
          provider_hint=excluded.provider_hint,
          source_url=excluded.source_url,
          source_title=excluded.source_title,
          status=excluded.status,
          last_seen_at=excluded.last_seen_at,
          seen_count=mel_sovereignty_candidates.seen_count+1,
          metadata_json=excluded.metadata_json`)
          .bind(
            candidateKey,layer,id,
            clean(candidate?.provider_hint,220)||null,
            clean(candidate?.source_url,500)||null,
            clean(candidate?.source_title,300)||null,
            status,
            Number(existing?.first_seen_at||now),
            now,
            Math.max(1,Number(existing?.seen_count||0)+1),
            JSON.stringify(meta),
          ).run();
        touched++;
      }
    }
    return{ok:true,touched};
  }

  async list({layer=null,status=null,limit=200}={}){
    await this.ready();
    const clauses=[];const args=[];
    if(layer){clauses.push('layer=?');args.push(clean(layer,80));}
    if(status){clauses.push('status=?');args.push(clean(status,80).toUpperCase());}
    const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
    const rows=await this.db.prepare(`SELECT * FROM mel_sovereignty_candidates ${where}
      ORDER BY last_seen_at DESC,candidate_key ASC LIMIT ?`)
      .bind(...args,Math.max(1,Math.min(500,Number(limit)||200))).all();
    return (rows?.results||[]).map(row=>({
      key:row.candidate_key,
      layer:row.layer,
      id:row.candidate_id,
      provider_hint:row.provider_hint||null,
      source_url:row.source_url||null,
      source_title:row.source_title||null,
      status:row.status,
      first_seen_at:Number(row.first_seen_at)||0,
      last_seen_at:Number(row.last_seen_at)||0,
      seen_count:Number(row.seen_count)||0,
      metadata:(()=>{try{return JSON.parse(row.metadata_json||'{}')}catch{return{}}})(),
    }));
  }

  async setStatus({layer,id,status,metadata={}}={}){
    await this.ready();
    const normalized=String(status||'').toUpperCase();
    if(!['UNVERIFIED','TESTING','PREVALIDATED','REJECTED','BLOCKED'].includes(normalized)){
      throw Object.assign(new Error('SOVEREIGNTY_CANDIDATE_STATUS_INVALID'),{code:'SOVEREIGNTY_CANDIDATE_STATUS_INVALID'});
    }
    const candidateKey=key(layer,id);
    const result=await this.db.prepare(`UPDATE mel_sovereignty_candidates
      SET status=?,metadata_json=?,last_seen_at=? WHERE candidate_key=?`)
      .bind(normalized,JSON.stringify(metadata||{}),Date.now(),candidateKey).run();
    return{ok:true,key:candidateKey,status:normalized,changed:Number(result?.meta?.changes||0)};
  }
}
