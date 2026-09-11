import test from 'node:test';
import assert from 'node:assert/strict';
import { extractExplicitMemoryRequest, inferNativeCodeCapability } from '../src/api/native-chat.js';

test('explicit memory parser recognizes natural French memory verbs', () => {
  assert.equal(extractExplicitMemoryRequest('mémorise que mon format préféré est court').content, 'mon format préféré est court');
  assert.equal(extractExplicitMemoryRequest('enregistre dans ta mémoire que je veux des réponses directes').content, 'je veux des réponses directes');
  assert.equal(extractExplicitMemoryRequest('garde en mémoire ceci pour demain').content, 'ceci pour demain');
});

test('explicit memory parser normalizes permanent tutoiement preference', () => {
  const row = extractExplicitMemoryRequest('tu me vouvoie encore, ne me vouvoie plus');
  assert.equal(row.kind, 'preference');
  assert.equal(row.normalized, true);
  assert.match(row.content, /tutoyé en permanence/i);
});

test('explicit memory parser normalizes runtime capability awareness instead of storing stale lists', () => {
  const row = extractExplicitMemoryRequest('enregistres dans ta mémoire tes capacités');
  assert.equal(row.kind, 'operational_preference');
  assert.equal(row.normalized, true);
  assert.match(row.content, /CAPABILITY_MANIFEST/);
  assert.match(row.content, /TOOL_RESULT/);
});

test('memory parser ignores ordinary text without an explicit memory request', () => {
  assert.equal(extractExplicitMemoryRequest('quelles sont tes capacités ?'), null);
});

test('native code intent routes code health checks to code.integrity', () => {
  assert.deepEqual(inferNativeCodeCapability('vérifie que ton code est propre'), { id: 'code.integrity', input: {} });
  assert.deepEqual(inferNativeCodeCapability('contrôle l’intégrité du dépôt GitHub'), { id: 'code.integrity', input: {} });
});
