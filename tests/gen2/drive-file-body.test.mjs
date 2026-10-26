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

  const doc = buildDriveUpload({ name: 'Notes', content: 'Bonjour', format: 'classeur' });
  assert.equal(doc.format, 'gsheet');
  assert.equal(doc.google, true);
  assert.match(doc.body, /application\/vnd\.google-apps\.spreadsheet/);

  const drawing = buildDriveUpload({ name: 'Couverture', content: 'A < B & C', format: 'vectoriel' });
  assert.equal(drawing.format, 'svg');
  assert.match(drawing.body, /^<\?xml/);
  assert.match(drawing.body, /<svg/);
  assert.match(drawing.body, /A &lt; B &amp; C/);

  const googleDoc = buildDriveUpload({ name: 'Notes', content: 'Bonjour', format: 'document' });
  assert.equal(googleDoc.format, 'gdoc');
  assert.equal(googleDoc.google, true);
  assert.match(googleDoc.body, /application\/vnd\.google-apps\.document/);

  const googleDrawing = buildDriveUpload({ name: 'Plan', content: 'Trait', format: 'dessin' });
  assert.equal(googleDrawing.format, 'gdrawing');
  assert.match(googleDrawing.body, /application\/vnd\.google-apps\.drawing/);
  assert.match(googleDrawing.body, /<svg/);

  const slides = buildDriveUpload({ name: 'Brief', content: 'Page une\n\nPage deux', format: 'diaporama' });
  assert.equal(slides.api, 'slides');
  assert.equal(slides.create.title, 'Brief');
  assert.equal(slides.batch('page_1').requests.filter(row => row.createSlide).length, 1);

  const form = buildDriveUpload({ name: 'Questions', content: 'Qui\nQuand', format: 'formulaire' });
  assert.equal(form.api, 'form');
  assert.equal(form.batch().requests.length, 2);
  assert.equal(form.batch().requests[0].createItem.item.title, 'Qui');
});
