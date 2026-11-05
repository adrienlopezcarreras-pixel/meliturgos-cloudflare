import test from 'node:test';
import assert from 'node:assert/strict';
import { newCatalogModels } from '../scripts/workers-ai-catalog-diff.mjs';

test('catalog discovery keeps only unknown active text-generation models', () => {
  const text = { name: 'Text Generation' };
  const catalog = { result: [
    { name: '@cf/new/text', task: text, properties: [] },
    { name: '@cf/known/text', task: text, properties: [] },
    { name: '@cf/old/text', task: text, properties: [{ property_id: 'planned_deprecation_date', value: '2026-01-01' }] },
    { name: '@cf/new/embed', task: { name: 'Text Embeddings' }, properties: [] },
  ] };
  assert.deepEqual(newCatalogModels(catalog, ['@cf/known/text']), ['@cf/new/text']);
});
