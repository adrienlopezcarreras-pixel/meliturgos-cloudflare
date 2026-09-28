function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=240){return String(v||'').trim().slice(0,max);}

export class SchedulerAdapter{
  constructor({id,provider,health,create,list,pause,resume,deleteSchedule,triggerNow}={}){
    this.id=clean(id);this.provider=clean(provider);
    if(!this.id||!this.provider)throw Object.assign(new TypeError('SCHEDULER_DESCRIPTOR_INVALID'),{code:'SCHEDULER_DESCRIPTOR_INVALID'});
    this._health=typeof health==='function'?health:async()=>({ok:true,status:'UNKNOWN'});
    this._create=req(create,'SCHEDULER_CREATE_REQUIRED');
    this._list=req(list,'SCHEDULER_LIST_REQUIRED');
    this._pause=req(pause,'SCHEDULER_PAUSE_REQUIRED');
    this._resume=req(resume,'SCHEDULER_RESUME_REQUIRED');
    this._delete=req(deleteSchedule,'SCHEDULER_DELETE_REQUIRED');
    this._trigger=req(triggerNow,'SCHEDULER_TRIGGER_REQUIRED');
  }
  health(){return this._health();}
  create(input){return this._create(input);}
  list(input){return this._list(input);}
  pause(input){return this._pause(input);}
  resume(input){return this._resume(input);}
  deleteSchedule(input){return this._delete(input);}
  triggerNow(input){return this._trigger(input);}
}

export async function proveSchedulerAdapter(adapter){
  if(!(adapter instanceof SchedulerAdapter))throw Object.assign(new TypeError('SCHEDULER_ADAPTER_REQUIRED'),{code:'SCHEDULER_ADAPTER_REQUIRED'});
  const health=await adapter.health();
  if(health?.ok===false)return{ok:false,status:'SCHEDULER_HEALTH_FAILED',health};

  const externalId='mel-sovereignty-'+crypto.randomUUID();
  const created=await adapter.create({
    external_id:externalId,
    schedule:'0 0 1 1 *',
    payload:{kind:'sovereignty-proof'},
    enabled:true,
  });
  const id=clean(created?.id,200);
  if(created?.ok!==true||!id)return{ok:false,status:'SCHEDULER_CREATE_FAILED'};

  const listed=await adapter.list({external_id:externalId});
  if(listed?.ok!==true||!Array.isArray(listed.schedules)||!listed.schedules.some(row=>row?.id===id)){
    return{ok:false,status:'SCHEDULER_LIST_FAILED'};
  }

  const paused=await adapter.pause({id});
  if(paused?.ok!==true)return{ok:false,status:'SCHEDULER_PAUSE_FAILED'};

  const resumed=await adapter.resume({id});
  if(resumed?.ok!==true)return{ok:false,status:'SCHEDULER_RESUME_FAILED'};

  const fired=await adapter.triggerNow({id,payload:{kind:'sovereignty-proof'}});
  if(fired?.ok!==true)return{ok:false,status:'SCHEDULER_TRIGGER_FAILED'};

  const deleted=await adapter.deleteSchedule({id});
  if(deleted?.ok!==true)return{ok:false,status:'SCHEDULER_DELETE_FAILED'};

  return{
    ok:true,status:'SCHEDULER_ADAPTER_VERIFIED',
    provider:adapter.provider,adapter_id:adapter.id,
    create:true,list:true,pause:true,resume:true,trigger_now:true,delete:true,
  };
}
