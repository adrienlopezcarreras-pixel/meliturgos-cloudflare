import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const text=await readFile(new URL('../../scripts/companion-local-ai-benchmark.ps1',import.meta.url),'utf8');
test('benchmark selects only installed sized models within a profile-specific budget',()=>{
 assert.match(text,/Sort-Object -Property \@\{Expression=\{\[double\]\$_.size\}\}/);
 assert.match(text,/\$maxModelMb = if \(\$profile -eq 'light'\) \{1536\}/);
 assert.match(text,/SKIPPED_MODEL_OVER_PROFILE_BUDGET/);
 assert.match(text,/SKIPPED_REQUESTED_MODEL_NOT_INSTALLED/);
 assert.match(text,/\$selected\[0\]\.size -gt \$limit/);
});
test('system RAM reserve and explicit manual-only active-user override',()=>{
 assert.match(text,/\$requiredMb=.*\+ 1024\.0/);
 assert.match(text,/SKIPPED_INSUFFICIENT_FREE_RAM/);
 assert.match(text,/SKIPPED_RAM_TELEMETRY_UNKNOWN/);
 assert.match(text,/\[switch\]\$AllowUserActivity/);
 assert.match(text,/if \(-not \$AllowUserActivity\)/);
 assert.match(text,/Test-LocalBenchmarkConsent/);
});
