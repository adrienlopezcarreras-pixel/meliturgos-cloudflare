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

test('live connection proof logs only sanitized actionable connector diagnostics',async()=>{
  const source=await readFile(new URL('../.github/workflows/live-connections-production-proof.yml',import.meta.url),'utf8');
  assert.match(source,/upstream_status:Number\(d\?\.upstream_status\|\|0\)\|\|null/);
  assert.match(source,/action_required:d\?\.action_required\|\|null/);
});

test('live connection proof separates immutable proof auth readiness from connector health',async()=>{
  const source=await readFile(workflowUrl,'utf8');
  assert.match(source,/connections-self-check\.json/);
  assert.match(source,/GOOGLE_GMAIL_OK=0/);
  assert.match(source,/if probe google_gmail/);
  assert.match(source,/gmail:process\.env\.GOOGLE_GMAIL_OK==='1'/);
  assert.doesNotMatch(source,/test "\$\{READY\}" = "1"[\s\S]{0,400}probe google_gmail/);
});

test('live connection proof persists precise partial evidence even when a connector remains unavailable',async()=>{
  const source=await readFile(workflowUrl,'utf8');
  assert.match(source,/complete:Number\(process\.env\.FAILURES\|\|0\)===0/);
  assert.match(source,/failure_count:Number\(process\.env\.FAILURES\|\|0\)/);
  assert.match(source,/gmail:process\.env\.GOOGLE_GMAIL_OK==='1'/);
  assert.match(source,/calendar:process\.env\.GOOGLE_CALENDAR_OK==='1'/);
  assert.match(source,/outlook:process\.env\.MICROSOFT_MAIL_OK==='1'/);
  assert.match(source,/onedrive:process\.env\.MICROSOFT_ONEDRIVE_OK==='1'/);
  assert.match(source,/sharepoint:process\.env\.MICROSOFT_SHAREPOINT_OK==='1'/);
  assert.match(source,/tasks:process\.env\.GOOGLE_TASKS_OK==='1'/);
  assert.match(source,/GOOGLE_DRIVE_OK=0/);
  assert.match(source,/connector_id":"google-drive"/);
  assert.match(source,/drive:process\.env\.GOOGLE_DRIVE_OK==='1'/);
  assert.match(source,/yahoo_or_ymail:process\.env\.YAHOO_OK==='1'/);
  assert.match(source,/required:false/);
  assert.match(source,/authenticated_target_probe:process\.env\.VERCEL_OK==='1'/);
  assert.match(source,/OPTIONAL_NOT_CONFIGURED/);
  assert.match(source,/- name: Upload sanitized live proof\n\s+if: always\(\)/);
  assert.match(source,/secret_values_exposed:false/);
});


test('live connection proof retries only transient Pipedream proof authorization propagation',async()=>{
  const source=await readFile(workflowUrl,'utf8');
  assert.match(source,/for attempt in \$\(seq 1 12\); do[\s\S]*pipedream\/accounts/);
  assert.match(source,/PD_ERROR_CODE=.*AUTH_REQUIRED|PD_ERROR_CODE=.*UNKNOWN/);
  assert.match(source,/\[ "\$\{PD_ACCOUNTS_CODE\}" = "401" \].*\[ "\$\{PD_ERROR_CODE\}" = "AUTH_REQUIRED" \]/);
  assert.match(source,/sleep 2[\s\S]*continue/);
});


test('live connection proof uses exact-SHA immutable proof auth and never mutates Worker secrets',async()=>{
  const source=await readFile(workflowUrl,'utf8');
  assert.match(source,/MEL_BACKUP_ENCRYPTION_KEY_B64/);
  assert.match(source,/MEL_PARALLEL_PROOF_V1:/);
  assert.match(source,/x-mel-parallel-proof/);
  assert.doesNotMatch(source,/MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(source,/wrangler secret put/);
  assert.doesNotMatch(source,/wrangler secret delete/);
  assert.match(source,/mutation_scope:'read_only_parallel_proof_auth'/);
});

test('Yahoo/Ymail production proof uses Pipedream account health without direct IMAP probing',async()=>{
  const source=await readFile(new URL('../.github/workflows/live-connections-production-proof.yml',import.meta.url),'utf8');
  assert.doesNotMatch(source,/probe yahoo_imap \/api\/gen2\/connections\/yahoo-imap\/test/);
  assert.match(source,/has_pd_app imap/);
  assert.match(source,/direct_imap_probe\":false/);
});


test('Google Tasks Pipedream fallback uses the documented proxy host',async()=>{
  const source=await readFile(new URL('../src/api/connection-settings-api.js',import.meta.url),'utf8');
  assert.match(source,/https:\/\/www\.googleapis\.com\/tasks\/v1\/users\/@me\/lists\?maxResults=1/);
});


test('Vercel absence is reported but never blocks MEL connection completion', async()=>{
  const source=await readFile(workflowUrl,'utf8');
  const block=source.slice(source.indexOf('VERCEL_OK=0'),source.indexOf('GOOGLE_GMAIL_OK="${GOOGLE_GMAIL_OK}"'));
  assert.match(block,/VERCEL_STATUS="OPTIONAL_NOT_CONFIGURED"/);
  assert.doesNotMatch(block,/FAILURES=\$\(\(FAILURES\+1\)\)/);
});

test('live connection proof reports sanitized Pipedream environment and upstream diagnostics', async()=>{
  const source=await readFile(workflowUrl,'utf8');
  assert.match(source,/connections\/pipedream\/status/);
  assert.match(source,/pipedream_status:/);
  assert.match(source,/client_id_present/);
  assert.match(source,/client_secret_present/);
  assert.match(source,/account_status_degraded/);
  assert.match(source,/reconnect_required/);
  assert.match(source,/upstream_code/);
  assert.match(source,/upstream_message/);
  assert.match(source,/action_required/);
  assert.doesNotMatch(source,/client_secret[^_]/);
});
