import fs from 'node:fs';

const file = new URL('../worker.js', import.meta.url);
let src = fs.readFileSync(file, 'utf8');
const before = src;

const rules = [
  ['max_input_chars:12000', 'max_input_chars:100000', 'orchestration input limit'],
  ['Message trop long (12 000 caractères maximum).', 'Message trop long (100 000 caractères maximum).', 'chat error message'],
];

for (const [from, to, label] of rules) {
  const count = src.split(from).length - 1;
  if (count < 1) throw new Error(`PATCH_ABORTED: ${label} not found`);
  src = src.split(from).join(to);
  console.log(`[prompt-limit] ${label}: ${count} replacement(s)`);
}

if (src === before) throw new Error('PATCH_ABORTED: no changes made');
if (!src.includes('max_input_chars:100000')) throw new Error('PATCH_ABORTED: 100000 limit missing');
if (!src.includes('Message trop long (100 000 caractères maximum).')) throw new Error('PATCH_ABORTED: updated error message missing');

fs.writeFileSync(file, src, 'utf8');
console.log('[prompt-limit] OK: worker.js chat validation now accepts up to 100000 characters.');
