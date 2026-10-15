import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionSovereigntyExecutor} from '../../src/portability/companion-sovereignty-executor.js';
function fakeDb({claimed=false}={}){
 const commands=new Map(),updates=[];
 const db={
  prepare(sql){
   return{
    bind(...args){
     return{
      async first(){
       if(sql.includes('FROM computer_commands'))return {status:claimed?'RUNNING':'PENDING'};
       if(sql.includes('FROM computer_devices'))return null;
       return null;
      },
      async all(){
       if(sql.includes('FROM computer_devices'))return{results:[{
         id:'my-win-pc',platform:'windows',halted:0,last_seen_at:Date.now(),
         metadata:JSON.stringify({engine_heartbeat_at:Date.now(),engine_version:'1.4.1'})
       }]};
       return{results:[]};
      },
      async run(){
       if(sql.includes('INSERT INTO computer_commands')){commands.set(args[0],{status:'PENDING'});return{meta:{changes:1}};}
       if(sql.includes('UPDATE computer_commands')){
         updates.push({sql,args});
         return{meta:{changes:claimed?0:1}};
       }
       return{meta:{changes:0}};
      }
     };
    },
    async run(){return {meta:{changes:0}};}
   };
  }
 };
 return{db,commands,updates};
}
test('pending sovereignty commands are removed from executable queue on timeout',async()=>{
 const {db,updates}=fakeDb();
 const execute=createCompanionSovereigntyExecutor({DB:db},{timeoutMs:1000,pollIntervalMs:100});
 const result=await execute({capability:'sovereignty.source_control',action:'health'});
 assert.equal(result.code,'COMPANION_SOVEREIGNTY_TIMEOUT');
 assert.equal(result.pending_cancelled,true);
 assert.equal(result.work_may_still_run,false);
 assert.equal(updates.length,1);
 assert.match(updates[0].sql,/status='PENDING'/);
});
test('claimed work is not falsely reported as cancelled',async()=>{
 const {db}=fakeDb({claimed:true});
 const execute=createCompanionSovereigntyExecutor({DB:db},{timeoutMs:1000,pollIntervalMs:100});
 const result=await execute({capability:'sovereignty.source_control',action:'health'});
 assert.equal(result.pending_cancelled,false);
 assert.equal(result.work_may_still_run,true);
 assert.equal(result.last_known_status,'RUNNING');
});
