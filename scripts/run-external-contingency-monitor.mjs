import { mkdirSync, writeFileSync } from 'node:fs';
import { monitorExternalHealth, validateExternalHealthUrl } from '../src/continuity/external-health-monitor.js';
import { signContingencyProbeReport } from '../src/continuity/contingency-probe-auth.js';

const report = await monitorExternalHealth({
  url: process.env.MEL_CONTINGENCY_HEALTH_URL,
  expectedText: 'mel.contingency-heartbeat/v1',
});
mkdirSync('artifacts/contingency', { recursive: true });
writeFileSync('artifacts/contingency/external-health.json', JSON.stringify(report, null, 2) + '\n');
const signingSecret = process.env.MEL_CONTINGENCY_PROBE_HMAC_KEY || '';
let delivered = { delivered: false, code: 'PROBE_NOT_SIGNED' };
if (report.status !== 'UNKNOWN' && signingSecret.length >= 32) {
  const signed = await signContingencyProbeReport({
    part: 'cloudflare', up: report.status === 'UP',
    observer: 'github-actions-external-monitor',
    evidence_id: 'github-run-' + (process.env.GITHUB_RUN_ID || 'manual') + '-' + (process.env.GITHUB_RUN_ATTEMPT || '1'),
    observed_at: report.observed_at,
  }, { secret: signingSecret });
  writeFileSync('artifacts/contingency/signed-health.json', JSON.stringify(signed, null, 2) + '\n');
  const healthUrl = String(process.env.MEL_CONTINGENCY_HEALTH_URL || '');
  const destination = process.env.MEL_CONTINGENCY_PROBE_RECEIVER_URL
    || (validateExternalHealthUrl(healthUrl)
      ? new URL('/api/internal/contingency-probe', healthUrl).href : '');
  if (!validateExternalHealthUrl(destination)) {
    delivered = { delivered: false, code: 'PROBE_RECEIVER_NOT_CONFIGURED' };
  } else {
    try {
      const response = await fetch(destination, {
        method: 'POST', redirect: 'manual',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(signed), signal: AbortSignal.timeout(10000),
      });
      delivered = { delivered: response.status === 202, code: response.status === 202
        ? 'PROBE_PERSISTED' : 'PROBE_DELIVERY_REJECTED', http_status: response.status };
    } catch {
      delivered = { delivered: false, code: 'PROBE_RECEIVER_UNREACHABLE' };
    }
  }
} else {
  console.log('Signed proof unavailable: monitor inconclusive or HMAC secret not configured.');
}

writeFileSync('artifacts/contingency/probe-delivery.json', JSON.stringify(delivered, null, 2) + '\n');
if (report.status === 'UP' && !delivered.delivered) process.exitCode = 3;

const summary = [
  'Signed probe persisted: **' + (delivered.delivered ? 'Yes' : 'No') + '** (' + delivered.code + ')',
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
