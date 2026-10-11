function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=240){return String(v||'').trim().slice(0,max);}

export class DatabaseAdapter{
  constructor({id,provider,health,begin,commit,rollback,execute,query,exportLogical,importLogical}={}){
    this.id=clean(id);this.provider=clean(provider);
    if(!this.id||!this.provider)throw Object.assign(new TypeError('DATABASE_DESCRIPTOR_INVALID'),{code:'DATABASE_DESCRIPTOR_INVALID'});
    this._health=typeof health==='function'?health:async()=>({ok:true,status:'UNKNOWN'});
    this._begin=req(begin,'DATABASE_BEGIN_REQUIRED');
    this._commit=req(commit,'DATABASE_COMMIT_REQUIRED');
    this._rollback=req(rollback,'DATABASE_ROLLBACK_REQUIRED');
    this._execute=req(execute,'DATABASE_EXECUTE_REQUIRED');
    this._query=req(query,'DATABASE_QUERY_REQUIRED');
    this._export=req(exportLogical,'DATABASE_EXPORT_REQUIRED');
    this._import=req(importLogical,'DATABASE_IMPORT_REQUIRED');
  }
  health(){return this._health();}
  begin(){return this._begin();}
  commit(tx){return this._commit(tx);}
  rollback(tx){return this._rollback(tx);}
  execute(input){return this._execute(input);}
  query(input){return this._query(input);}
  exportLogical(input){return this._export(input);}
  importLogical(input){return this._import(input);}
}

export async function proveDatabaseAdapter(adapter){
  if(!(adapter instanceof DatabaseAdapter))throw Object.assign(new TypeError('DATABASE_ADAPTER_REQUIRED'),{code:'DATABASE_ADAPTER_REQUIRED'});
  const health=await adapter.health();
  if(health?.ok===false)return{ok:false,status:'DATABASE_HEALTH_FAILED',health};

  const tx=await adapter.begin();
  if(!tx)return{ok:false,status:'DATABASE_BEGIN_FAILED'};

  const table='mel_sovereignty_probe';
  const probeId=`probe-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  let tx2=null;
  try{
    const created=await adapter.execute({tx,sql:`CREATE TABLE IF NOT EXISTS ${table}(id TEXT PRIMARY KEY,value TEXT NOT NULL)`,params:[]});
    if(created?.ok!==true)return{ok:false,status:'DATABASE_DDL_FAILED'};

    const inserted=await adapter.execute({tx,sql:`INSERT INTO ${table}(id,value) VALUES(?,?)`,params:[probeId,'ok']});
    if(inserted?.ok!==true)return{ok:false,status:'DATABASE_WRITE_FAILED'};

    const rows=await adapter.query({tx,sql:`SELECT id,value FROM ${table} WHERE id=?`,params:[probeId]});
    if(rows?.ok!==true||!Array.isArray(rows.rows)||rows.rows[0]?.value!=='ok'){
      return{ok:false,status:'DATABASE_READ_FAILED'};
    }

    const exported=await adapter.exportLogical({tx,tables:[table]});
    if(exported?.ok!==true||!exported?.snapshot)return{ok:false,status:'DATABASE_EXPORT_FAILED'};

    const rolled=await adapter.rollback(tx);
    if(rolled?.ok!==true)return{ok:false,status:'DATABASE_ROLLBACK_FAILED'};

    tx2=await adapter.begin();
    const imported=await adapter.importLogical({tx:tx2,snapshot:exported.snapshot});
    if(imported?.ok!==true)return{ok:false,status:'DATABASE_IMPORT_FAILED'};
    const readback=await adapter.query({tx:tx2,sql:`SELECT id,value FROM ${table} WHERE id=?`,params:[probeId]});
    if(readback?.ok!==true||readback.rows?.[0]?.value!=='ok'){
      await adapter.rollback(tx2).catch(()=>{});
      return{ok:false,status:'DATABASE_IMPORT_VERIFY_FAILED'};
    }
    const committed=await adapter.commit(tx2);
    if(committed?.ok!==true)return{ok:false,status:'DATABASE_COMMIT_FAILED'};

    return{
      ok:true,status:'DATABASE_ADAPTER_VERIFIED',
      provider:adapter.provider,adapter_id:adapter.id,
      ddl:true,write:true,read:true,export:true,import:true,rollback:true,commit:true,
    };
  }catch(error){
    if(tx2){
      try{await adapter.rollback(tx2);}catch{}
    }else{
      try{await adapter.rollback(tx);}catch{}
    }
    return{ok:false,status:'DATABASE_PROOF_EXCEPTION',code:clean(error?.code||error?.message,180)};
  }
}
