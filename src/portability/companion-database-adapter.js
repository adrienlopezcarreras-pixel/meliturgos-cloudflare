import { DatabaseAdapter } from './database-adapter.js';

function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=300){return String(v||'').trim().slice(0,max);}

export function createCompanionDatabaseAdapter({
  execute,
  id='companion-local-db',
  provider='local-companion-sqlite',
  database='mel-sovereignty.sqlite',
}={}){
  const rpc=req(execute,'COMPANION_DATABASE_EXECUTOR_REQUIRED');
  const db=clean(database,240);

  const call=async(action,payload={})=>{
    const result=await rpc({
      capability:'sovereignty.database',
      action,
      database:db,
      payload,
    });
    if(result?.ok!==true){
      throw Object.assign(new Error(result?.code||'COMPANION_DATABASE_FAILED'),{code:result?.code||'COMPANION_DATABASE_FAILED'});
    }
    return result;
  };

  return new DatabaseAdapter({
    id,provider,
    health:async()=>{
      try{
        const result=await call('health');
        return{ok:true,status:'HEALTHY',engine:clean(result?.engine,120)||null};
      }catch(error){
        return{ok:false,status:'UNAVAILABLE',code:error.code||error.message};
      }
    },
    begin:async()=>{
      const result=await call('begin');
      return clean(result?.tx,200);
    },
    commit:async tx=>{await call('commit',{tx:clean(tx,200)});return{ok:true};},
    rollback:async tx=>{await call('rollback',{tx:clean(tx,200)});return{ok:true};},
    execute:async({tx,sql,params=[]})=>{
      const result=await call('execute',{tx:clean(tx,200),sql:String(sql||''),params:Array.isArray(params)?params:[]});
      return{ok:true,changes:Number(result?.changes)||0};
    },
    query:async({tx,sql,params=[]})=>{
      const result=await call('query',{tx:clean(tx,200),sql:String(sql||''),params:Array.isArray(params)?params:[]});
      return{ok:true,rows:Array.isArray(result?.rows)?result.rows:[]};
    },
    exportLogical:async({tx,tables=[]})=>{
      const result=await call('export_logical',{tx:clean(tx,200),tables:Array.isArray(tables)?tables.map(x=>clean(x,200)):[]});
      return{ok:true,snapshot:result?.snapshot};
    },
    importLogical:async({tx,snapshot})=>{
      await call('import_logical',{tx:clean(tx,200),snapshot});
      return{ok:true};
    },
  });
}
