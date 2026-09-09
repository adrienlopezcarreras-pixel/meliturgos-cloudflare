// Compatibility wrapper. The authoritative route test is a real local Worker
// integration test, not a hard-coded status report.
const { spawnSync } = await import('node:child_process');
const result = spawnSync(process.execPath, ['--test', 'tests/gen2/route-integration.test.mjs'], {stdio:'inherit'});
process.exit(result.status ?? 1);
