/**
 * DEBUG TEST for audit function
 */
import { audit } from '../src/audit/audit-service.js';

class MockDB {
  constructor() { 
    this.logs = []; 
  }
  async prepare(sql) {
    console.log('[MOCK] prepare called with SQL:', sql);
    const stmt = new MockStmt(this, sql);
    return stmt;
  }
}

class MockStmt {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
    console.log('[MOCK] MockStmt created');
  }
  bind(...args) {
    console.log('[MOCK] bind called with', args.length, 'args');
    this.params = args;
    return this;
  }
  async run() {
    console.log('[MOCK] run called');
    this.db.logs.push({ 
      id: this.db.logs.length + 1,
      timestamp: this.params[0],
      action: this.params[1],
      details_json: this.params[3],
    });
    return { results: [{ rowsAffected: 1 }] };
  }
}

(async () => {
  const db = new MockDB();
  try {
    console.log('=== Calling audit... ===');
    await audit(db, 'test_action', null, {});
    console.log('=== Success! logs:', db.logs);
    process.exit(0);
  } catch (e) {
    console.error('=== Error:', e);
    process.exit(1);
  }
})();