import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubCodeReader } from '../src/capabilities/github-code-capabilities.js';

const SHA_CAND = 'ce294ac794b657bef7060863d3fc4f12b04e48be';
const SHA_MAIN = '0fd7bb32b7dcd36a51fbdfd4e1b32e578c4155a0';
const adv = '001e# service=git-upload-pack\n0000'
  + '0159' + SHA_MAIN + ' HEAD\u0000multi_ack symref=HEAD:refs/heads/main\n'
  + '007f9999999999999999999999999999999999999999 refs/heads/archive/x/candidate/mel-clean-autonomy\n'
  + '0050' + SHA_CAND + ' refs/heads/candidate/mel-clean-autonomy\n'
  + '0040' + SHA_MAIN + ' refs/heads/main\n0000';

test('without a token and with the REST quota exhausted, MEL still reads her branch head (git smart HTTP)', async () => {
  const fetchImpl = async url => url.startsWith('https://api.github.com') ? new Response('{"message":"API rate limit exceeded"}', { status: 403 })
    : url.endsWith('.git/info/refs?service=git-upload-pack') ? new Response(adv) : new Response('', { status: 404 });
  const reader = createGitHubCodeReader({ repository: 'o/r', branch: 'candidate/mel-clean-autonomy', fetchImpl });
  const head = await reader.head();
  assert.equal(head.sha, SHA_CAND, 'exact branch, not the archive/... branch that ends the same way');
  assert.equal(head.source, 'git-smart-http');
  assert.equal((await createGitHubCodeReader({ repository: 'o/r', branch: 'main', fetchImpl }).head()).sha, SHA_MAIN);
  await assert.rejects(createGitHubCodeReader({ repository: 'o/r', branch: 'missing', fetchImpl }).head(), /CODE_HEAD_READ_FAILED/);
});

test('immutable Teacher-approved snapshot is independently verified without weakening head CAS', async () => {
  const fetchImpl = async url => {
    if (url.endsWith('/commits/' + SHA_CAND)) return new Response(JSON.stringify({sha:SHA_CAND}), {status:200});
    if (url.includes('/git/ref/heads/')) return new Response(JSON.stringify({object:{sha:SHA_MAIN}}), {status:200});
    return new Response('', {status:404});
  };
  const reader = createGitHubCodeReader({repository:'o/r',branch:'candidate/mel-clean-autonomy',pinnedSha:SHA_CAND,fetchImpl});
  assert.equal((await reader.approvedSnapshot()).sha,SHA_CAND);
  await assert.rejects(reader.head(),/CODE_HEAD_PIN_MISMATCH/);
  await assert.rejects(createGitHubCodeReader({repository:'o/r',branch:'main',fetchImpl}).approvedSnapshot(),/CODE_APPROVED_SNAPSHOT_PIN_REQUIRED/);
});
