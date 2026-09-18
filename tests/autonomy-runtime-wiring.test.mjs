import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const wrangler = await readFile('wrangler.jsonc', 'utf8');
const index = await readFile('src/index.js', 'utf8');
const learningEntry = await readFile('src/learning-entry.js', 'utf8');
const uiEntry = await readFile('src/ui-entry.js', 'utf8');
const uiReleaseFixEntry = await readFile('src/ui-release-fix-entry.js', 'utf8');
const professorLiveLearningEntry = await readFile('src/professor-live-learning-entry.js', 'utf8');
const previewAuthEntry = await readFile('src/preview-auth-entry.js', 'utf8');
const visualFinalEntry = await readFile('src/visual-final-entry.js', 'utf8');
const runtime = await readFile('src/evolution/autonomy-runtime.js', 'utf8');
const teacherApi = await readFile('src/teachers/public-teacher-api.js', 'utf8');

const mainMatch = wrangler.match(/"main"\s*:\s*"([^"]+)"/);
assert.ok(mainMatch, 'Wrangler must declare a Worker entrypoint');
assert.ok(
  ['src/index.js', 'src/learning-entry.js', 'src/ui-entry.js', 'src/ui-release-fix-entry.js', 'src/professor-live-learning-entry.js', 'src/preview-auth-entry.js', 'src/visual-final-entry.js'].includes(mainMatch[1]),
  'Worker entrypoint must be src/index.js or a verified wrapper chain',
);

if (mainMatch[1] === 'src/visual-final-entry.js') {
  assert.match(visualFinalEntry, /import\s+app\s+from\s+["']\.\/preview-auth-entry\.js["']/, 'Final visual entrypoint must delegate to preview-auth-entry.js');
  assert.match(visualFinalEntry, /async\s+fetch\s*\([^)]*\)\s*\{[\s\S]*app\.fetch\(request,\s*env,\s*ctx\)/, 'Final visual fetch() must delegate to preview-auth-entry.js');
  assert.match(visualFinalEntry, /async\s+scheduled\s*\([^)]*\)\s*\{[\s\S]*app\.scheduled\(controller,\s*env,\s*ctx\)/, 'Final visual scheduled() must delegate to preview-auth-entry.js');
}

if (mainMatch[1] === 'src/learning-entry.js') {
  assert.match(learningEntry, /import\s+app\s+from\s+["']\.\/index\.js["']/, 'Learning entrypoint must delegate to src/index.js');
  assert.match(learningEntry, /async\s+fetch\s*\([^)]*\)\s*\{[\s\S]*app\.fetch\(request,\s*learnedEnvironment\(env\),\s*ctx\)/, 'Learning entrypoint fetch() must delegate to index.js');
  assert.match(learningEntry, /async\s+scheduled\s*\([^)]*\)\s*\{[\s\S]*app\.scheduled\(controller,\s*learnedEnvironment\(env\),\s*ctx\)/, 'Learning entrypoint scheduled() must delegate to index.js');
}

const usesPreviewAuth = ['src/visual-final-entry.js', 'src/preview-auth-entry.js'].includes(mainMatch[1]);
if (usesPreviewAuth) {
  assert.match(previewAuthEntry, /import\s+app\s+from\s+["']\.\/professor-live-learning-entry\.js["']/, 'Preview auth entrypoint must delegate to the Professor live-learning wrapper');
  assert.match(previewAuthEntry, /async\s+fetch\s*\([^)]*\)\s*\{[\s\S]*app\.fetch\(authenticatedRequest,\s*env,\s*ctx\)/, 'Preview auth fetch() must delegate authenticated requests to professor-live-learning-entry.js');
  assert.match(previewAuthEntry, /async\s+scheduled\s*\([^)]*\)\s*\{[\s\S]*app\.scheduled\(controller,\s*env,\s*ctx\)/, 'Preview auth scheduled() must delegate to professor-live-learning-entry.js');
}

const usesProfessorLiveLearning = ['src/visual-final-entry.js', 'src/preview-auth-entry.js', 'src/professor-live-learning-entry.js'].includes(mainMatch[1]);
if (usesProfessorLiveLearning) {
  assert.match(professorLiveLearningEntry, /import\s+app\s+from\s+["']\.\/ui-release-fix-entry\.js["']/, 'Professor live-learning entrypoint must delegate to the verified release UI wrapper');
  assert.match(professorLiveLearningEntry, /async\s+fetch\s*\([^)]*\)\s*\{[\s\S]*app\.fetch\(request,\s*env,\s*ctx\)/, 'Professor live-learning fetch() must delegate non-learning requests to ui-release-fix-entry.js');
  assert.match(professorLiveLearningEntry, /async\s+scheduled\s*\([^)]*\)\s*\{[\s\S]*app\.scheduled\(controller,\s*env,\s*ctx\)/, 'Professor live-learning scheduled() must delegate to ui-release-fix-entry.js');
  assert.match(professorLiveLearningEntry, /\/api\/learning\/progress/, 'Professor live-learning wrapper must expose the live learning progress route');
}

const usesVerifiedUiChain = ['src/ui-entry.js', 'src/ui-release-fix-entry.js', 'src/professor-live-learning-entry.js', 'src/preview-auth-entry.js', 'src/visual-final-entry.js'].includes(mainMatch[1]);
if (usesVerifiedUiChain) {
  if (['src/ui-release-fix-entry.js', 'src/professor-live-learning-entry.js', 'src/preview-auth-entry.js', 'src/visual-final-entry.js'].includes(mainMatch[1])) {
    assert.match(uiReleaseFixEntry, /import\s+app\s+from\s+["']\.\/ui-entry\.js["']/, 'Release UI entrypoint must delegate to the verified ui-entry wrapper');
    assert.match(uiReleaseFixEntry, /async\s+fetch\s*\([^)]*\)\s*\{[\s\S]*app\.fetch\(request,\s*env,\s*ctx\)/, 'Release UI entrypoint fetch() must delegate to ui-entry.js');
    assert.match(uiReleaseFixEntry, /async\s+scheduled\s*\([^)]*\)\s*\{[\s\S]*app\.scheduled\(controller,\s*env,\s*ctx\)/, 'Release UI entrypoint scheduled() must delegate to ui-entry.js');
  }
  assert.match(uiEntry, /import\s+app\s+from\s+["']\.\/learning-entry\.js["']/, 'UI entrypoint must delegate to the verified learning wrapper');
  assert.match(uiEntry, /async\s+fetch\s*\([^)]*\)\s*\{[\s\S]*app\.fetch\(request,\s*env,\s*ctx\)/, 'UI entrypoint fetch() must delegate to learning-entry.js');
  assert.match(uiEntry, /async\s+scheduled\s*\([^)]*\)\s*\{[\s\S]*app\.scheduled\(controller,\s*env,\s*ctx\)/, 'UI entrypoint scheduled() must delegate to learning-entry.js');
  assert.match(learningEntry, /import\s+app\s+from\s+["']\.\/index\.js["']/, 'Learning wrapper below ui-entry must delegate to src/index.js');
}

assert.match(wrangler, /"\* \* \* \* \*"/, 'One-minute autonomy cron must remain configured');
assert.match(wrangler, /"17 \* \* \* \*"/, 'Hourly maintenance cron must remain configured');

assert.match(index, /import\s+\{[^}]*runAutonomyMaintenance[^}]*runAutonomyRuntimeTick[^}]*\}\s+from\s+["']\.\/evolution\/autonomy-runtime\.js["']/, 'Entrypoint must import the autonomy runtime tick and separated maintenance');
assert.match(index, /async\s+scheduled\s*\([^)]*\)\s*\{[\s\S]*runAutonomyRuntimeTick\(env\)/, 'scheduled() must execute the autonomy runtime tick');
assert.match(index, /maybeHandlePublicTeacherBridge\(request,\s*env\)/, 'fetch() must expose the public Teacher Bridge handler');

for (const route of ['/api/teacher/status', '/api/teacher/pending', '/api/teacher/work', '/api/teacher/bridge.txt']) {
  assert.ok(teacherApi.includes(route), `Teacher Bridge route missing: ${route}`);
}

assert.match(teacherApi, /kind:\s*['"]MEL_INTERNAL_WORK_PACKAGE['"]/, 'Teacher work endpoint must emit only the internal work package kind');
assert.match(teacherApi, /production_deploy_allowed:\s*false/, 'Teacher work package must keep production deployment disabled');
assert.match(teacherApi, /requested_by\s*===\s*['"]mel-autonomy['"]/, 'Teacher work endpoint must remain restricted to mel-autonomy jobs');
assert.match(teacherApi, /candidate_branch[\s\S]{0,400}startsWith\(['"]candidate\/['"]\)/, 'Teacher work endpoint must keep candidate branch enforcement');

assert.match(runtime, /runCoreAutonomyRuntimeTick/, 'Runtime wrapper must delegate to core autonomy tick');
assert.match(runtime, /getAutonomyControl/, 'Runtime wrapper must enforce autonomy control state');
assert.match(runtime, /applyOwnerMaxApproval/, 'Runtime wrapper must support owner MAX Teacher bypass');

console.log('autonomy runtime wiring contract: ok');
