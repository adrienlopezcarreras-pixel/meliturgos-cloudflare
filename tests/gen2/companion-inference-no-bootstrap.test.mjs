import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const a=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
const b=await readFile(new URL('../../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
const start=a.indexOf('function Get-SovereigntyLocalAiState {');
const end=a.indexOf('function Get-LocalComputeProfile',start);
const state=a.slice(start,end);
test('source/distributed PowerShell are identical; inference passes NoBootstrap explicitly',()=>{
 assert.equal(a,b);
 assert.match(a,/\$state = Get-SovereigntyLocalAiState -NoBootstrap:\(\$operation -eq "invoke"\) -Profile \$profile/);
 assert.match(state,/param\(\[switch\]\$NoBootstrap,\[string\]\$Profile="light"\)/);
});
test('all installation paths are behind non-inference only guards',()=>{
 const paths=state.split('Start-SovereigntyAiBootstrap');
 assert.equal(paths.length,4);
 assert.match(state,/if \(\$null -eq \$tags\) \{\s*#.*\n\s*if \(\$NoBootstrap\) \{ throw "SOVEREIGNTY_AI_LOCAL_ENGINE_UNAVAILABLE" \}/);
 assert.match(state,/if \(\$models.Count -lt 1\) \{\s*if \(\$NoBootstrap\) \{ throw "SOVEREIGNTY_AI_LOCAL_MODEL_MISSING" \}/);
 assert.match(state,/\} elseif \(-not \[string\]::IsNullOrWhiteSpace\(\$requested\)\) \{/);
 assert.match(state,/if \(\$NoBootstrap\) \{/);
});
test('inference refuses absent, unknown-size or oversized models without download',()=>{
 assert.match(state,/SOVEREIGNTY_AI_LOCAL_MODEL_OVER_BUDGET_OR_NOT_INSTALLED/);
 assert.match(state,/\$limitMb = switch \(\$Profile\)/);
 assert.match(state,/\$size -gt 0 -and \$size -le \$maxBytes/);
 assert.match(state,/Sort-Object -Property \@\{Expression=\{\[long\]\$_.size\}\}/);
 assert.match(state,/Get-CimInstance Win32_OperatingSystem/);
 assert.match(state,/SOVEREIGNTY_AI_LOCAL_RAM_UNVERIFIED/);
 assert.match(state,/SOVEREIGNTY_AI_LOCAL_INSUFFICIENT_RAM/);
});
