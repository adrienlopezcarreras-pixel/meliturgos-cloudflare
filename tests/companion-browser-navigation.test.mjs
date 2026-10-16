import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan } from '../src/devices/computer-use.js';

function plan(url, approved = true) {
  return evaluateComputerUsePlan({
    session_id: 'owner-session',
    device: { id: 'paired-windows', capabilities: ['computer.use'] },
    sandbox: { allowed_origins: ['https://example.com'], allowed_apps: [], allowed_paths: [], max_steps: 3 },
    approvals: approved ? [{ approved: true, session_id: 'owner-session', step_id: 'navigation', action: 'browser.navigate' }] : [],
    steps: [{ id: 'navigation', action: COMPUTER_USE_ACTIONS.BROWSER_NAVIGATE, url }],
  });
}

test('Companion permits approved HTTPS browsing within allowed origins', () => {
  assert.equal(plan('https://example.com/page').allowed, true);
});

test('Companion rejects navigation without approval, URL or allowed origin', () => {
  assert.equal(plan('https://example.com/page', false).allowed, false);
  assert.equal(plan('').reason, 'NAVIGATION_URL_REQUIRED');
  assert.equal(plan('https://other.example/page').allowed, false);
  assert.equal(plan('http://example.com/page').allowed, false);
  assert.equal(plan('file:///C:/Windows/System32/calc.exe').allowed, false);
  assert.equal(plan('https://admin:secret@example.com/page').allowed, false);
});

test('Companion rejects ignored browser navigation targets before executing', () => {
  const baseline = {
    session_id: 'owner-session',
    device: { id: 'paired-windows', capabilities: ['computer.use'] },
    sandbox: { allowed_origins: ['https://example.com'], allowed_apps: [], allowed_paths: [] },
    approvals: [{ approved: true, session_id: 'owner-session', step_id: 'navigation', action: 'browser.navigate' }],
  };
  for (const [field, value] of [
    ['text', 'do not ignore this'], ['window_handle', '45678'],
    ['key', 'ENTER'], ['app', 'browser'], ['path', 'C:\\\\test'],
    ['x', 100], ['y', 200], ['selector', '#login'], ['repeat', 3],
    ['unknown', null],
  ]) {
    const verdict = evaluateComputerUsePlan({
      ...baseline, steps: [{ id: 'navigation', action: COMPUTER_USE_ACTIONS.BROWSER_NAVIGATE,
        url: 'https://example.com/page', [field]: value }],
    });
    assert.equal(verdict.allowed, false, field);
    assert.equal(verdict.reason, 'BROWSER_NAVIGATE_UNEXPECTED_FIELD', field);
  }
  assert.equal(plan('https://example.com/page').allowed, true);
});

test('Windows handler validates HTTPS before invoking system browser', async () => {
  const script = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const start = script.indexOf('"browser.navigate" {');
  const end = script.indexOf('"app.open" {', start);
  assert.ok(start > 0 && end > start);
  const handler = script.slice(start, end);
  assert.match(handler, /Uri\]::TryCreate/);
  assert.match(handler, /Scheme -ne "https"/);
  assert.match(handler, /Start-Process -FilePath \$uri\.AbsoluteUri/);
  assert.doesNotMatch(handler, /Invoke-Expression|powershell\.exe|cmd\.exe/);
});
