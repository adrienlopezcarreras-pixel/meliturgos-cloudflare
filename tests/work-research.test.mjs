import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOfferUrls, requiredDisclosure, gatherWorkResearch, htmlToText } from '../src/revenue/work-research.js';
import { publishDeliverable } from '../src/revenue/work-stream.js';

const OFFER = `🪢 Analyse Knots and Publish Your Findings
Official: X https://x.com/KnotsOnStonk, website https://www.knotsonstonk.com/, gallery https://www.knotsonstonk.com/gallery.
Allocations: https://www.myceliumfinance.com/allocations. Discord https://discord.gg/5M7FsQcGq
Publish on Medium or dev.to, summary on X or Bluesky with $KNOTS $MYC.
Required disclosure (exact text): "AI-created for a Mycelium Finance bounty."
Submit: first lines the post URL and the article URL, then audience, angle, sources.`;

test('offer pages and the exact required disclosure are read from the offer', () => {
  assert.deepEqual(extractOfferUrls(OFFER), ['https://www.knotsonstonk.com', 'https://www.knotsonstonk.com/gallery', 'https://www.myceliumfinance.com/allocations']);
  assert.equal(requiredDisclosure(OFFER), 'AI-created for a Mycelium Finance bounty.');
  assert.equal(requiredDisclosure('Write a poem.'), null);
  assert.equal(htmlToText('<p>Knots&amp;co <script>x()</script><b>live</b></p>'), 'Knots&co live');
});

test('research reads the offer pages first, then independent sources, numbered and dated', async () => {
  const calls = [];
  const service = { research: async (query, _d, depth, seeds) => {
    calls.push({ query, depth, seeds });
    return seeds
      ? { sources: [{ url: seeds[0], title: 'Knots', content: '<p>' + 'Knots builds a meme platform on Solana. '.repeat(5) + '</p>' }] }
      : { sources: [{ url: 'https://www.google.com/search?q=x', title: 'g', content: 'x'.repeat(200) }, { url: 'https://solscan.io/token/8RV', title: 'Solscan', content: 'Holders 1234. Supply 1,000,000,000 KNOTS. '.repeat(4) }] };
  } };
  const r = await gatherWorkResearch({}, { description: OFFER, query: 'Knots KNOTS Solana token', service });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].depth, 1);
  assert.equal(calls[1].seeds, null);
  assert.deepEqual(r.sources.map(s => s.n + ' ' + s.url), ['1 https://www.knotsonstonk.com', '2 https://solscan.io/token/8RV']);
  assert.match(r.block, /SOURCES CONSULTÉES le \d{4}-\d{2}-\d{2}/);
  assert.match(r.block, /\[2\] Solscan — https:\/\/solscan\.io\/token\/8RV\nHolders 1234/);
});

test('a publishing mission is handed in links first, with audience, angle and dated sources', async () => {
  const env = { MEL_PUBLIC_ORIGIN: 'https://mel.test', AI: { run: async () => ({ response: JSON.stringify({ title: 'Knots', tags: ['solana'], summary: 'What does Knots ship today? $KNOTS $MYC', audience: 'Newcomers to Solana memes', angle: 'What is live vs planned', image_prompt: 'knots' }) }) } };
  const calls = [];
  const deps = { fetchImpl: async (url, init = {}) => {
    calls.push({ url, body: init.body });
    if (url.includes('dev.to')) return Response.json({ url: 'https://dev.to/mel/knots-1' });
    if (url.endsWith('createSession')) return Response.json({ accessJwt: 'j', did: 'did:plc:x' });
    if (url.endsWith('createRecord')) return Response.json({ uri: 'at://did/app.bsky.feed.post/3abc' });
    return Response.json({});
  }, vaults: { getToken: async ({ connector_id }) => connector_id === 'work.devto' ? { access_token: 'k' } : { access_token: 'p', handle: 'mel.bsky.social' } } };
  const output = { content: '# Knots\nText [1].\n\nSources\n[1] https://www.knotsonstonk.com', requiredDisclosure: 'AI-created for a Mycelium Finance bounty.',
    research: { observed: '2026-10-18', sources: [{ n: 1, url: 'https://www.knotsonstonk.com' }] } };
  const done = await publishDeliverable({ env, mission: { id: '0x1', description: OFFER }, assessment: { publishTargets: ['devto', 'bluesky'], needsPublicUrl: true, language: 'en' }, output, channels: { devto: true, bluesky: true, image: false }, deps });
  const lines = done.content.split('\n');
  assert.equal(lines[0], 'https://bsky.app/profile/mel.bsky.social/post/3abc');
  assert.equal(lines[1], 'https://dev.to/mel/knots-1');
  assert.match(done.content, /Audience: Newcomers/);
  assert.match(done.content, /Sources \(observed 2026-10-18\):\n- \[1\] https:\/\/www\.knotsonstonk\.com/);
  const devto = JSON.parse(calls.find(c => c.url.includes('dev.to')).body);
  assert.match(devto.article.body_markdown, /\*AI-created for a Mycelium Finance bounty\.\*/);
  const post = JSON.parse(calls.find(c => c.url.endsWith('createRecord')).body).record.text;
  assert.match(post, /\$KNOTS \$MYC AI-created for a Mycelium Finance bounty\.\nhttps:\/\/dev\.to\/mel\/knots-1$/);
  assert.ok(Array.from(post).length <= 300);
});
