import fs from 'node:fs';

const file = new URL('../worker.js', import.meta.url);
const path = file.pathname;
let src = fs.readFileSync(file, 'utf8');

const before = src;

const replacements = [
  {
    from: 'max_input_chars:12000',
    to: 'max_input_chars:100000',
    min: 1,
    label: 'orchestration input limit',
  },
  {
    from: 'Message trop long (12 000 caractères maximum).',
    to: 'Message trop long (100 000 caractères maximum).',
    min: 1,
    label: 'chat error message',
  },
];

for (const rule of replacements) {
  const count = src.split(rule.from).length - 1;
  if (count < rule.min) {
    throw new Error(`PATCH_ABORTED: ${rule.label} not found (${rule.from})`);
  }
  src = src.split(rule.from).join(rule.to);
  console.log(`[prompt-limit] ${rule.label}: ${count} replacement(s)`);
}

if (src === before) throw new Error('PATCH_ABORTED: no changes made');
if (!src.includes('max_input_chars:100000')) throw new Error('PATCH_ABORTED: new limit missing');
if (!src.includes('Message trop long (100 000 caractères maximum).')) throw new Error('PATCH_ABORTED: new error message missing');

fs.writeFileSync(file, src, 'utf8');
console.log('[prompt-limit] OK: worker.js now accepts up to 100000 characters at the chat validation layer.');
