import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const wrangler = await readFile('wrangler.jsonc', 'utf8');
const index = await readFile('src/index.js', 'utf8');
const runtime = await readFile('src/evolution/autonomy-runtime.js', 'utf8');
const teacherApi = await readFile('src/teachers/public-teacher-api.js', 'utf8');

assert.match(wrangler, /"main"\s*:\s*"src\/index\.js"/, 'Worker entrypoint must stay on src/index.js');
assert.match(wrangler, /"crons"\s*:\s*\[\s*"[^"]+"\s*\]/, 'At least one autonomy cron must remain configured');

assert.match(index, /import\s+\{\s*runAutonomyRuntimeTick\s*\}\s+from\s+["']\.\/evolution\/autonomy-runtime\.js["']/, 'Entrypoint must import the autonomy runtime tick');
assert.match(index, /async\s+scheduled\s*\([^)]*\)\s*\{[\s\S]*runAutonomyRuntimeTick\(env\)/, 'scheduled() must execute the autonomy runtime tick');
assert.match(index, /maybeHandlePublicTeacherBridge\(request,\s*env\)/, 'fetch() must expose the public Teacher Bridge handler');

for (const route of ['/api/teacher/status', '/api/teacher/pending', '/api/teacher/work', '/api/teacher/bridge.txt']) {
  assert.ok(teacherApi.includes(route), `Teacher Bridge route missing: ${route}`);
}

assert.match(teacherApi, /kind:\s*['"]MEL_INTERNAL_WORK_PACKAGE['"]/, 'Teacher work endpoint must emit only the internal work package kind');
assert.match(teacherApi, /production_deploy_allowed:\s*false/, 'Teacher work package must keep production deployment disabled');
assert.match(teacherApi, /requested_by\s*===\s*['"]mel-autonomy['"]/, 'Teacher work endpoint must remain restricted to mel-autonomy jobs');
assert.match(teacherApi, /candidate_branch[\s\S]{0,400}startsWith\(['"]candidate\/['"]\)/, 'Teacher work endpoint must keep candidate branch enforcement');

assert.match(runtime, /reconcileRuntimeTeacherReplies/, 'Runtime tick must reconcile Teacher replies before progressing');
assert.match(runtime, /reconcileRuntimeCompletions/, 'Runtime tick must reconcile CI-backed completions');
assert.match(runtime, /ensureNextJob\(\)/, 'Runtime tick must continue to the next roadmap job');
assert.match(runtime, /prepareAutonomyTeacherRequest/, 'Runtime tick must be able to create a Teacher request');
assert.match(runtime, /prepareApprovedImplementationProposal/, 'Runtime tick must prepare MEL implementation work only after Teacher approval');

console.log('autonomy runtime wiring contract: ok');
