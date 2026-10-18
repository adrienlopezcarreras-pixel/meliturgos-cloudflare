import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('MEL-CONTEXT-03 scheduler resumes due open loops through the Gen2 runtime', () => {
  const source = fs.readFileSync(new URL('../../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /export async function runOpenLoopResumeTick\(env = \{\}\)/);
  assert.match(source, /runtime\.bus\.execute\('openloop\.resume', \{ limit: 5, retryDelayMs: 60000 \}/);
  assert.match(source, /runOpenLoopResumeTick\(env\)\.catch/);
  assert.match(source, /OPEN_LOOP_RUNTIME_NOT_CONFIGURED/);
});

test('MEL scheduler automatically resumes only existing bounded D1 capability stress chunks', () => {
  const source = fs.readFileSync(new URL('../../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /export async function runPersistentCapabilityStressResumeTick\(env = \{\}, \{ waitUntil \} = \{\}\)/);
  assert.match(source, /resumeActivePersistentCapabilityStress\(\{/);
  assert.match(source, /runPersistentCapabilityStressResumeTick\(env, \{ waitUntil: auditWaitUntil \}\)\.catch/);
  assert.match(source, /CAPABILITY_STRESS_DB_NOT_CONFIGURED/);

  const persistent = fs.readFileSync(new URL('../../src/diagnostics/persistent-capability-stress.js', import.meta.url), 'utf8');
  const resume = persistent.slice(
    persistent.indexOf('export async function resumeActivePersistentCapabilityStress('),
    persistent.indexOf('export async function readPersistentCapabilityStress('),
  );
  assert.match(resume, /store\.latestActive\(\)/);
  assert.match(resume, /NO_ACTIVE_CAPABILITY_STRESS/);
  assert.doesNotMatch(resume, /store\.create\(/);
  assert.match(resume, /claimAndRunPersistentStress\(/);
});
