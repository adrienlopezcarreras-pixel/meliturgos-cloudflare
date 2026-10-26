import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDriveUpload, buildTextPdf } from '../../src/capabilities/drive-file-body.js';

test('Drive upload keeps text and writes a real PDF or CSV when asked', () => {
  const text = buildDriveUpload({ name: 'note.txt', content: 'bonjour' });
  assert.equal(text.format, 'txt');
  assert.equal(text.body, 'bonjour');
  assert.match(text.mimeType, /^text\/plain/);

  const sheet = buildDriveUpload({ name: 'plan', content: 'tache,etat\nMAX,oui', format: 'csv' });
  assert.equal(sheet.name, 'plan.csv');
  assert.match(sheet.mimeType, /^text\/csv/);

  const pdf = buildDriveUpload({ name: 'strategie', content: 'Plan\nLigne deux', format: 'pdf' });
  assert.equal(pdf.name, 'strategie.pdf');
  assert.equal(pdf.mimeType, 'application/pdf');
  assert.match(pdf.body, /^%PDF-1\.4\n/);
  assert.match(pdf.body, /%%EOF\n$/);
  assert.match(buildTextPdf('a\n'.repeat(60)), /\/Count 2/);
});
