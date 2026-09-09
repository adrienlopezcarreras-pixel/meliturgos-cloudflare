// Simple test to verify audit service implementation
import('../../src/audit/audit-service.js').then(({ audit }) => {
  console.log('=== Audit Service Test ===');
  
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
      return { results: [{ rowsAffected: 1, lastRowID: 1 }] };
    }
  }
  
  class MockD1Database {
    async prepare(sql) {
      return new MockD1Statement(this, sql);
    }
  }
  
  const db = new MockD1Database();
  
  console.log('\nTest 1: Basic audit call...');
  audit(db, 'test_action', null, { test: true })
    .then(() => console.log('✓ Test 1 passed'))
    .catch(e => { console.error('✗ Test 1 failed:', e.message); process.exit(1); });
    
  console.log('\nTest 2: Audit with request...');
  audit(db, 'test_request', {
    url: 'http://test.com/api/endpoint',
    headers: { get: () => '1.2.3.4' },
    method: 'POST'
  }, { action: 'test' })
    .then(() => {
      console.log('✓ Test 2 passed');
      console.log('\n=== All Tests Passed ===');
      process.exit(0);
    })
    .catch(e => { console.error('✗ Test 2 failed:', e.message); process.exit(1); });
}).catch(e => {
  console.error('=== Import Failed ===');
  console.error(e.message);
  process.exit(1);
});