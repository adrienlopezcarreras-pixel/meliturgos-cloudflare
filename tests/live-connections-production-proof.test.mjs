import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowUrl=new URL('../.github/workflows/live-connections-production-proof.yml',import.meta.url);

test('live connection proof accepts a healthy Pipedream Google Calendar fallback without masking Tasks',async()=>{
  const source=await readFile(workflowUrl,'utf8');
  assert.match(source,/GOOGLE_CALENDAR_OK=0/);
  assert.match(source,/has_pd_app google_calendar/);
  assert.match(source,/google_calendar: \{"ok":true,"provider":"pipedream","app":"google_calendar","linked_account":true\}/);
  assert.match(source,/GOOGLE_TASKS_OK=0/);
  assert.match(source,/has_pd_app google_tasks/);
  assert.match(source,/if \[ "\$\{GOOGLE_TASKS_OK\}" != "1" \]; then FAILURES=\$\(\(FAILURES\+1\)\); fi/);
});

test('live connection proof persists precise partial evidence even when a connector remains unavailable',async()=>{
  const source=await readFile(workflowUrl,'utf8');
  assert.match(source,/complete:Number\(process\.env\.FAILURES\|\|0\)===0/);
  assert.match(source,/failure_count:Number\(process\.env\.FAILURES\|\|0\)/);
  assert.match(source,/calendar:process\.env\.GOOGLE_CALENDAR_OK==='1'/);
  assert.match(source,/tasks:process\.env\.GOOGLE_TASKS_OK==='1'/);
  assert.match(source,/yahoo_or_ymail:process\.env\.YAHOO_OK==='1'/);
  assert.match(source,/authenticated_target_probe:process\.env\.VERCEL_OK==='1'/);
  assert.match(source,/- name: Upload sanitized live proof\n\s+if: always\(\)/);
  assert.match(source,/secret_values_exposed:false/);
});
