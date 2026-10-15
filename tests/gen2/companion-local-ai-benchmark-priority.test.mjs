import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../../scripts/companion-local-ai-benchmark.ps1',import.meta.url),'utf8');
test('owner keyboard and mouse activity must block optional diagnostics',()=>{
 assert.match(src,/GetLastInputInfo/);
 assert.match(src,/if\(!GetLastInputInfo\(ref value\)\) return -1/);
 assert.match(src,/if \(\$idleMs -lt 60000\)/);
 assert.match(src,/SKIPPED_USER_ACTIVE_OR_UNKNOWN/);
});
test('consent is revalidated before inference and before recording success',()=>{
 const config=src.indexOf('function Test-LocalBenchmarkConsent');
 const discovery=src.indexOf("'/api/tags'");
 const pre=src.indexOf('if (-not (Test-LocalBenchmarkConsent',discovery);
 const generate=src.indexOf("'/api/chat'",discovery);
 const post=src.indexOf('if (-not (Test-LocalBenchmarkConsent',generate);
 const success=src.indexOf("Write-Diagnostic 'MEASURED'");
 assert.ok(config>=0&&discovery>config&&pre>discovery&&generate>pre&&post>generate&&success>post);
 assert.match(src,/SKIPPED_CONSENT_CHANGED/);
 assert.match(src,/DISCARDED_CONSENT_REVOKED/);
});
test('requests and responses are synthetic and localhost-only',()=>{
 assert.match(src,/http:\/\/127\.0\.0\.1:11434/);
 assert.match(src,/Réponds uniquement OK/);
 assert.doesNotMatch(src,/Invoke-WebRequest|https?:\/\/(?:www\.|api\.)?openai\.com|ollama pull/i);
});
