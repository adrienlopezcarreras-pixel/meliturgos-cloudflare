import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('MCP preview deployment template never enables a public endpoint',()=>{
 const toml=readFileSync('wrangler.companion-mcp-preview.example.toml','utf8');
 assert.match(toml,/^workers_dev\s*=\s*false$/m);
 assert.match(toml,/^MCP_PREVIEW_ENABLED\s*=\s*"false"$/m);
 assert.match(toml,/^MCP_PREVIEW_D1_ISOLATED\s*=\s*"false"$/m);
 assert.match(toml,/^main\s*=\s*"src\/preview\/companion-mcp-worker.js"$/m);
 assert.doesNotMatch(toml,/^\s*(?:route|routes|account_id)\s*=/m);
 assert.match(toml,/REPLACE_PREVIEW_D1_ID/);
 assert.doesNotMatch(toml,/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/);
});
