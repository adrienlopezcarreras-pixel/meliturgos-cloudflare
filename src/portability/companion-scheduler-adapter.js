import { SchedulerAdapter } from './scheduler-adapter.js';

function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=240){return String(v||'').trim().slice(0,max);}

export function createCompanionSchedulerAdapter({
  execute,
  id='companion-local-scheduler',
  provider='local-companion-scheduler',
}={}){
  const rpc=req(execute,'COMPANION_SCHEDULER_EXECUTOR_REQUIRED');
  const call=async(action,payload={})=>{
    const result=await rpc({
      capability:'sovereignty.scheduler',
      action,
      payload,
    });
    if(result?.ok!==true){
      throw Object.assign(new Error(result?.code||'COMPANION_SCHEDULER_FAILED'),{code:result?.code||'COMPANION_SCHEDULER_FAILED'});
    }
    return result;
  };

  return new SchedulerAdapter({
    id,
    provider,
    health:async()=>{
      try{
        const result=await call('health');
        return{ok:true,status:'HEALTHY',backend:clean(result?.backend,120)||null};
      }catch(error){
        return{ok:false,status:'UNAVAILABLE',code:error.code||error.message};
      }
    },
    create:async input=>{
      const result=await call('create',{
        external_id:clean(input?.external_id,240),
        schedule:clean(input?.schedule,120),
        payload:input?.payload||{},
        enabled:input?.enabled!==false,
      });
      return{ok:true,id:clean(result?.id,200)};
    },
    list:async({external_id})=>{
      const result=await call('list',{external_id:clean(external_id,240)});
      return{ok:true,schedules:Array.isArray(result?.schedules)?result.schedules:[]};
    },
    pause:async({id})=>{await call('pause',{id:clean(id,200)});return{ok:true};},
    resume:async({id})=>{await call('resume',{id:clean(id,200)});return{ok:true};},
    deleteSchedule:async({id})=>{await call('delete',{id:clean(id,200)});return{ok:true};},
    triggerNow:async({id,payload})=>{
      const result=await call('trigger_now',{id:clean(id,200),payload:payload||{}});
      return{ok:true,run_id:clean(result?.run_id,200)||null};
    },
  });
}
