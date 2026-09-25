import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { D1PlanningStore } from '../src/work/d1-planning-store.js';
import { createWorkPlan } from '../src/work/planning-engine.js';

class Statement {
  constructor(db, sql) { this.db = db; this.sql = String(sql).trim(); this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    if (this.sql.startsWith('CREATE TABLE')) return { success: true };
    if (this.sql.startsWith('INSERT INTO work_plans')) {
      const [id,status,goal,work_dag_id,record_json,created_at,updated_at] = this.args;
      this.db.plans.set(id,{ id,status,goal,work_dag_id,record_json,created_at,updated_at });
      return { success:true };
    }
    if (this.sql.startsWith('INSERT INTO work_plan_events')) {
      const [event_id,plan_id,event_type,detail_json,created_at] = this.args;
      this.db.events.push({ event_id,plan_id,event_type,detail_json,created_at });
      return { success:true };
    }
    if (this.sql.startsWith('UPDATE work_plans SET status=')) {
      const [status,record_json,updated_at,id] = this.args;
      const row=this.db.plans.get(id); Object.assign(row,{status,record_json,updated_at}); return { success:true };
    }
    if (this.sql.startsWith('UPDATE work_plans SET work_dag_id=')) {
      const [work_dag_id,record_json,updated_at,id] = this.args;
      const row=this.db.plans.get(id); Object.assign(row,{work_dag_id,record_json,updated_at}); return { success:true };
    }
    if (this.sql.startsWith('INSERT INTO work_dags')) {
      const [id,job_id,status,record_json,created_at,updated_at] = this.args;
      this.db.dags.set(id,{id,job_id,status,record_json,created_at,updated_at}); return { success:true };
    }
    throw new Error(`UNEXPECTED_RUN:${this.sql}`);
  }
  async first() {
    if (this.sql.startsWith('SELECT record_json FROM work_plans WHERE id=')) {
      const row=this.db.plans.get(this.args[0]); return row ? {record_json:row.record_json}:null;
    }
    if (this.sql.startsWith('SELECT record_json FROM work_dags WHERE id=')) {
      const row=this.db.dags.get(this.args[0]); return row ? {record_json:row.record_json}:null;
    }
    throw new Error(`UNEXPECTED_FIRST:${this.sql}`);
  }
  async all() {
    if (this.sql.startsWith('SELECT event_id,event_type')) {
      const [planId,limit] = this.args;
      return {results:this.db.events.filter(e=>e.plan_id===planId).sort((a,b)=>a.created_at-b.created_at).slice(0,limit)};
    }
    if (this.sql.startsWith('SELECT id,status,goal,work_dag_id')) {
      let rows=[...this.db.plans.values()];
      let limit;
      if (this.sql.includes(' WHERE status=?')) {
        const [status,bounded]=this.args; rows=rows.filter(r=>r.status===status); limit=bounded;
      } else {
        [limit]=this.args;
      }
      rows.sort((a,b)=>b.updated_at-a.updated_at);
      return {results:rows.slice(0,limit)};
    }
    throw new Error(`UNEXPECTED_ALL:${this.sql}`);
  }
}

class FakeD1 {
  constructor(){ this.plans=new Map(); this.events=[]; this.dags=new Map(); }
  prepare(sql){ return new Statement(this,sql); }
}

test('GEN2-38 durable planning persists Goal, Tasks and append-only history', async () => {
  const db=new FakeD1();
  const store=new D1PlanningStore(db);
  const plan=createWorkPlan({
    id:'durable-plan',
    goal:'Finir un travail multi-étapes',
    steps:[
      {id:'a',capability:'echo',input:{value:'a'},idempotent:true},
      {id:'b',capability:'echo',input:{value:'b'},dependsOn:['a'],idempotent:true},
    ],
  });

  const created=await store.create(plan);
  assert.equal(created.status,'PLANNED');
  assert.equal(created.tasks.length,2);
  assert.equal(created.tasks[0].status,'PENDING');

  let history=await store.history('durable-plan');
  assert.deepEqual(history.map(e=>e.event_type),['PLAN_CREATED']);

  const active=await store.updateTask('durable-plan','a','RUNNING',{reason:'start',token:'must-not-persist',note:'Bearer abcdefghijklmnop'});
  assert.equal(active.status,'ACTIVE');
  const afterA=await store.updateTask('durable-plan','a','COMPLETED');
  assert.equal(afterA.status,'ACTIVE');
  await store.updateTask('durable-plan','b','RUNNING');
  const done=await store.updateTask('durable-plan','b','COMPLETED');
  assert.equal(done.status,'COMPLETED');

  history=await store.history('durable-plan');
  assert.deepEqual(history.map(e=>e.event_type),[
    'PLAN_CREATED','TASK_STATUS_CHANGED','TASK_STATUS_CHANGED','TASK_STATUS_CHANGED','TASK_STATUS_CHANGED'
  ]);
  assert.equal(Object.hasOwn(history[1].detail.detail,'token'),false);
  assert.equal(history[1].detail.detail.note,'[REDACTED]');
  assert.equal((await store.list({status:'COMPLETED'}))[0].id,'durable-plan');
});

test('GEN2-38 durable planning rejects illegal task rewinds', async () => {
  const db=new FakeD1();
  const store=new D1PlanningStore(db);
  await store.create(createWorkPlan({
    id:'no-rewind',
    goal:'No invalid rewind',
    steps:[{id:'a',capability:'echo',input:{value:'a'},idempotent:true}],
  }));
  await store.updateTask('no-rewind','a','RUNNING');
  await store.updateTask('no-rewind','a','COMPLETED');
  await assert.rejects(()=>store.updateTask('no-rewind','a','RUNNING'),error=>error.code==='WORK_TASK_TRANSITION_INVALID');
});

test('CapabilityBus can save a plan, materialize it into persistent Work, and recover after restart', async () => {
  const db=new FakeD1();
  const first=createDefaultCapabilityBus({env:{DB:db}});
  const saved=await first.execute('work.plan.save',{
    id:'cap-plan',
    goal:'Persist then materialize',
    steps:[
      {id:'one',capability:'echo',input:{value:'1'},idempotent:true},
      {id:'two',capability:'echo',input:{value:'2'},dependsOn:['one'],idempotent:true},
    ],
  },{owner:'adrien',requestId:'plan-save',permissions:[]});
  assert.equal(saved.status,'PLANNED');

  const materialized=await first.execute('work.plan.materialize',{id:'cap-plan'},{
    owner:'adrien',requestId:'plan-materialize',permissions:[]
  });
  assert.equal(materialized.plan.work_dag_id,'work-cap-plan');
  assert.equal(materialized.work.status,'RUNNING');

  const executed=await first.execute('work.run',{id:'work-cap-plan'},{
    owner:'adrien',requestId:'plan-run',permissions:[]
  });
  assert.equal(executed.status,'COMPLETED');

  const synced=await first.execute('work.plan.sync',{id:'cap-plan'},{
    owner:'adrien',requestId:'plan-sync',permissions:[]
  });
  assert.equal(synced.plan.status,'COMPLETED');
  assert.deepEqual(synced.plan.tasks.map(task=>task.status),['COMPLETED','COMPLETED']);

  const second=createDefaultCapabilityBus({env:{DB:db}});
  const recovered=await second.execute('work.plan.get',{id:'cap-plan'},{
    owner:'adrien',requestId:'plan-get',permissions:[]
  });
  assert.equal(recovered.work_dag_id,'work-cap-plan');
  assert.equal(recovered.status,'COMPLETED');
  assert.equal((await second.execute('work.plan.history',{id:'cap-plan'},{
    owner:'adrien',requestId:'plan-history',permissions:[]
  })).events.at(-1).event_type,'WORK_DAG_SYNCED');
});


test('work.plan.materialize rejects a persisted plan that references an unknown capability', async () => {
  const db=new FakeD1();
  const bus=createDefaultCapabilityBus({env:{DB:db}});
  await bus.execute('work.plan.save',{
    id:'unknown-cap-plan',
    goal:'Must fail closed before Work DAG creation',
    steps:[{id:'x',capability:'imaginary.capability',input:{},idempotent:true}],
  },{owner:'adrien',requestId:'unknown-save',permissions:[]});

  await assert.rejects(
    ()=>bus.execute('work.plan.materialize',{id:'unknown-cap-plan'},{
      owner:'adrien',requestId:'unknown-materialize',permissions:[]
    }),
    error=>error.code==='WORK_PLAN_CAPABILITY_NOT_FOUND'
  );
  assert.equal(db.dags.size,0);
});
