import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverGithubBounties } from '../../src/revenue/github-bounty-discovery.js';

test('finds funded public issues, excludes unpaid and PRs, deduplicates', async () => {
  const issue = { state:'open', html_url:'https://github.com/acme/tool/issues/22', title:'Fix parser', body:'Bounty $50 for a working patch' };
  const unpaid = { ...issue, html_url:'https://github.com/acme/tool/issues/23', body:'Please fix this bug' };
  const pr = { ...issue, html_url:'https://github.com/acme/tool/issues/24', pull_request:{} };
  const fetchImpl = async () => ({ ok:true, json:async () => ({ items:[issue, unpaid, pr] }) });
  const result = await discoverGithubBounties({ fetchImpl });
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].status, 'DISCOVERY_ONLY');
  assert.equal(result.opportunities[0].verified_payment, false);
});

test('reports source failures without manufacturing offers', async () => {
  const result = await discoverGithubBounties({ fetchImpl: async () => ({ok:false,status:403}) });
  assert.deepEqual(result.opportunities, []);
  assert.ok(result.errors.length >= 5);
});
