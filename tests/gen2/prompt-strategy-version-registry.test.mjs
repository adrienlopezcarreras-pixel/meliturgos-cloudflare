import test from 'node:test';
import assert from 'node:assert/strict';
import { PromptStrategyVersionRegistry } from '../../src/registry/prompt-strategy-version-registry.js';

test('registry versions prompts and strategies without overwriting history', () => {
  const registry = new PromptStrategyVersionRegistry();
  registry.registerPrompt('mel.system', '1.0.0', 'You are MEL.');
  registry.registerPrompt('mel.system', '1.1.0', 'You are MEL, concise.', { activate: true, metadata: { reason: 'tone' } });
  registry.registerStrategy('router.default', '2026-09-15', { fallback: ['free', 'local'] });

  assert.equal(registry.resolve('prompt', 'mel.system').version, '1.1.0');
  assert.equal(registry.resolve('prompt', 'mel.system', '1.0.0').value, 'You are MEL.');
  assert.deepEqual(registry.history('prompt', 'mel.system').map(item => item.version), ['1.0.0', '1.1.0']);
  assert.equal(registry.resolve('strategy', 'router.default').version, '2026-09-15');
});

test('registry fails closed on duplicate or unknown versions', () => {
  const registry = new PromptStrategyVersionRegistry();
  registry.registerPrompt('mel.system', '1', 'A');
  assert.throws(() => registry.registerPrompt('mel.system', '1', 'B'), /PROMPT_VERSION_ALREADY_EXISTS/);
  assert.throws(() => registry.activate('prompt', 'mel.system', '2'), /PROMPT_VERSION_NOT_FOUND/);
  assert.throws(() => registry.register({ type: 'unknown', name: 'x', version: '1', value: 'x' }), /PROMPT_VERSION_TYPE_INVALID/);
});

test('rollback restores the previously activated version and supports an explicit target', () => {
  const registry = new PromptStrategyVersionRegistry();
  registry.registerPrompt('teacher.review', 'v1', 'one');
  registry.registerPrompt('teacher.review', 'v2', 'two', { activate: true });
  registry.registerPrompt('teacher.review', 'v3', 'three', { activate: true });

  assert.equal(registry.rollback('prompt', 'teacher.review').active, 'v2');
  assert.equal(registry.resolve('prompt', 'teacher.review').version, 'v2');
  assert.equal(registry.rollback('prompt', 'teacher.review', 'v1').active, 'v1');
  assert.equal(registry.resolve('prompt', 'teacher.review').value, 'one');
});

test('snapshot round-trip preserves versions, active selection and rollback history', () => {
  const source = new PromptStrategyVersionRegistry();
  source.registerStrategy('council.review', 'v1', { roles: ['architect'] });
  source.registerStrategy('council.review', 'v2', { roles: ['architect', 'test'] }, { activate: true });
  const restored = new PromptStrategyVersionRegistry(source.exportSnapshot());

  assert.equal(restored.resolve('strategy', 'council.review').version, 'v2');
  assert.deepEqual(restored.resolve('strategy', 'council.review').value.roles, ['architect', 'test']);
  assert.equal(restored.rollback('strategy', 'council.review').active, 'v1');
});
