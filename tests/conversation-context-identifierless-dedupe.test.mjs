import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeRows, profileSecretLike } from '../src/core/orchestrator/conversation-context.js';

test('retrieved rows without IDs preserve distinct conversation evidence', () => {
  const first = { source: 'memories', conversation_id: 'a', role: 'user', content: 'Je parle espagnol' };
  const second = { source: 'memories', conversation_id: 'a', role: 'user', content: 'Je parle portugais' };
  assert.deepEqual(dedupeRows([first, second, { ...first }]), [first, second]);
});
test('identified memory records remain deduplicated by source and ID', () => {
  const first = { source: 'memories', id: 7, content: 'first' };
  assert.deepEqual(dedupeRows([first, { source: 'memories', id: 7, content: 'duplicate' }]), [first]);
});

test('zero-valued IDs are not mistaken for missing identifiers', () => {
  const a = { source: 'memories', id: 0, content: 'same' };
  const b = { source: 'memories', conversation_id: 'different', content: 'same' };
  assert.deepEqual(dedupeRows([a, b, { ...a }]), [a, b]);
});

test('timestamped user corrections with identical wording retain distinct provenance', () => {
  const earlier = { source: 'archive_messages', conversation_id: 'a', role: 'user', timestamp: 1, content: 'Je préfère le français' };
  const later = { ...earlier, timestamp: 2 };
  assert.deepEqual(dedupeRows([earlier, later, { ...earlier }]), [earlier, later]);
});

test('malformed retrieval hits cannot poison assembled context', () => {
  const valid = { source: 'memories', id: 42, content: 'Valid context' };
  assert.deepEqual(dedupeRows([null, undefined, 0, 'invalid', [], valid]), [valid]);
});

test('credential-like imported history is excluded while ordinary context survives', () => {
  const rows = [
    { content: 'Mon projet est MEL' },
    { content: 'API_KEY=example-secret-value' },
    { content: 'mot de passe : exemple' },
  ];
  assert.deepEqual(rows.filter(row => !profileSecretLike(row.content)), [rows[0]]);
});

test('unlabelled provider credentials never enter retrieved context', () => {
  for (const value of [
    'ghp_' + 'a'.repeat(36),
    'github_pat_' + 'b'.repeat(42),
    'sk-' + 'c'.repeat(32),
  ]) assert.equal(profileSecretLike(value), true);
  assert.equal(profileSecretLike('Je préfère une conversation en français'), false);
});

test('talking about tokens is safe context; credential assignments are not', () => {
  assert.equal(profileSecretLike('Je veux comprendre le système de token et OTP'), false);
  assert.equal(profileSecretLike('token: abc123-do-not-store'), true);
  assert.equal(profileSecretLike('OTP=456789'), true);
});

test('password and API key security discussions remain usable memory', () => {
  assert.equal(profileSecretLike('Comment sécuriser mes mots de passe et API key ?'), false);
  assert.equal(profileSecretLike('password=example-private-value'), true);
  assert.equal(profileSecretLike('mot de passe : exemple'), true);
  assert.equal(profileSecretLike('api_key=example-private-value'), true);
});

test('security labels with no assigned value stay in memory', () => {
  for (const text of ['secret:', 'private key management', 'Authorization:']) {
    assert.equal(profileSecretLike(text), false);
  }
  for (const text of ['secret=abc123', 'private_key: abc123', 'Authorization: Basic abc123']) {
    assert.equal(profileSecretLike(text), true);
  }
});

test('invalid non-array retrieval containers yield empty evidence safely', () => {
  for (const value of [null, false, 0, 'oops', {results:[{id:1}]}]) {
    assert.deepEqual(dedupeRows(value), []);
  }
});

test('non-text results cannot be serialized as retrieved prompt content', () => {
  const rows = [{id:1,content:{secret:'hidden'}},{id:2,content:'Valid memory'}];
  const safe = dedupeRows(rows).filter(row => typeof row.content === 'string' && !profileSecretLike(row.content));
  assert.deepEqual(safe, [rows[1]]);
});
