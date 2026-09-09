#!/bin/bash

# Simple test to verify audit service implementation
echo "Testing audit service..."
node --input-type=module -e "
import('./src/audit/audit-service.js').then(({ audit }) => {
  console.log('Audit service imported');
  
  // Proper mock that mimics D1's statement chaining pattern
  class MockD1Statement {
    constructor(db, sql) {
      this.db = db;
      this.sql = sql;
      this.params = [];
    }
    bind(...args) {
      this.params = args;
      return this; // CRITICAL: Must return this for chaining
    }
    async run() {
      console.log('Mock run called with', this.params.length, 'parameters');
      // Just verify it's being called
      return { results: [{ rowsAffected: 1, lastRowID: 1 }] };
    }
  }
  
  class MockD1Database {
    async prepare(sql) {
      console.log('prepare called');
      return new MockD1Statement(this, sql);
    }
  }
  
  const db = new MockD1Database();
  const db2 = new MockD1Database();
  
  audit(db, 'test1', null, { test: true })
    .then(() => console.log('Test 1 passed'))
    .catch(e => { console.error('Test 1 failed:', e.message); process.exit(1); });
    
  audit(db2, 'test2', {
    url: 'http://test.com/api/endpoint',
    headers: { get: () => '1.2.3.4' },
    method: 'POST'
  }, { action: 'test' })
    .then(() => console.log('Test 2 passed'))
    .catch(e => { console.error('Test 2 failed:', e.message); process.exit(1); });
}).catch(e => {
  console.error('Import failed:', e);
  process.exit(1);
});
"