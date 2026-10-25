import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from '../helpers/sqlite-d1.mjs';
import {startMaintenanceLease,finishMaintenanceLease} from '../../src/maintenance/maintenance-gate.js';
import {tryAcquireAutonomyRuntimeLease,releaseAutonomyRuntimeLease} from '../../src/evolution/autonomy-runtime-lease.js';

test('MAX runtime lease cannot be inserted or renewed under maintenance, even after expiry; verified release resumes',async()=>{
 const db=sqliteD1({maintenanceFence:true});
 try {
  await startMaintenanceLease(db,{leaseId:'global',now:1,ttlMs:1000});
  assert.equal((await tryAcquireAutonomyRuntimeLease({db,owner:'blocked',now:2000})).acquired,false);
  await finishMaintenanceLease(db,{leaseId:'global',reconciled:true,now:2001});
  assert.equal((await tryAcquireAutonomyRuntimeLease({db,owner:'initial',now:2002})).acquired,true);
  await startMaintenanceLease(db,{leaseId:'next',now:2003,ttlMs:1000});
  assert.equal((await tryAcquireAutonomyRuntimeLease({db,owner:'replacement',now:1000000})).acquired,false);
  // Existing owner may drain/release; maintenance must not prohibit safe completion.
  assert.equal(await releaseAutonomyRuntimeLease({db,owner:'initial'}),true);
  assert.equal((await tryAcquireAutonomyRuntimeLease({db,owner:'replacement',now:1000001})).acquired,false);
  await finishMaintenanceLease(db,{leaseId:'next',reconciled:true,now:1000002});
  assert.equal((await tryAcquireAutonomyRuntimeLease({db,owner:'replacement',now:1000003})).acquired,true);
 }finally{db.close();}
});
