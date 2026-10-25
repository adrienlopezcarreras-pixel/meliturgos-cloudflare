import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverLoraDatasets, eligibleDataset } from '../src/learning/lora-dataset-discovery.js';

const row = (id, licence, extra = {}) => ({ id, sha: 'a'.repeat(40), downloads: 5000, tags: [`license:${licence}`], private: false, gated: false, ...extra });

test('only public, non-gated, permissively licensed, used datasets are eligible', () => {
  assert.equal(eligibleDataset(row('a/ok', 'apache-2.0')), true);
  assert.equal(eligibleDataset(row('a/gated', 'apache-2.0', { gated: 'auto' })), false);
  assert.equal(eligibleDataset(row('a/nc', 'cc-by-nc-4.0')), false);
  assert.equal(eligibleDataset(row('a/new', 'mit', { downloads: 3 })), false);
  assert.equal(eligibleDataset({ ...row('a/nosha', 'mit'), sha: undefined }), false);
  assert.equal(eligibleDataset(row('a/tr', 'mit', { tags: ['license:mit', 'language:tr'] })), false);
  assert.equal(eligibleDataset(row('a/fr', 'mit', { tags: ['license:mit', 'language:fr'] })), true);
});

test('an agentic gap finds training sets and separate benchmarks, pinned to their revision', async () => {
  const fetchImpl = async url => Response.json(String(url).includes('benchmark') || String(url).includes('evaluation')
    ? [row('bench/bfcl', 'apache-2.0', { downloads: 9000 }), row('x/nc', 'cc-by-nc-4.0')]
    : [row('train/xlam', 'cc-by-4.0'), row('bench/bfcl', 'apache-2.0', { downloads: 9000 })]);
  const result = await discoverLoraDatasets('AGENTIC_EXECUTION_BELOW_OBJECTIVE', { fetchImpl });
  assert.equal(result.status, 'FOUND');
  assert.deepEqual(result.test.map(r => r.id), ['bench/bfcl']);
  assert.deepEqual(result.train.map(r => r.id), ['train/xlam'], 'a benchmark is never also a training set');
  assert.match(result.train[0].url, /tree\/a{40}$/);
});
