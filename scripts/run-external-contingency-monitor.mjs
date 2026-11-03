import { mkdirSync, writeFileSync } from 'node:fs';
import { monitorExternalHealth } from '../src/continuity/external-health-monitor.js';

const report = await monitorExternalHealth({
  url: process.env.MEL_CONTINGENCY_HEALTH_URL,
  expectedText: 'mel.contingency-heartbeat/v1',
});
mkdirSync('artifacts/contingency', { recursive: true });
writeFileSync('artifacts/contingency/external-health.json', JSON.stringify(report, null, 2) + '\n');
const summary = [
  '## MEL — external contingency monitor',
  'Status: **' + report.status + '**',
  'Evidence: ' + report.code,
  'Samples: ' + (report.samples || []).length,
  'Failover performed: **No**',
  'This checker proves only HTTP reachability, not D1 integrity or restoration.',
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}
if (report.status !== 'UP') process.exitCode = report.status === 'DOWN' ? 1 : 2;
