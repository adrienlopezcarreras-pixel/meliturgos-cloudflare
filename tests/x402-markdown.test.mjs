import test from 'node:test';
import assert from 'node:assert/strict';
import { b64encodeJson, b64decodeJson, x402Config, handlePaidRequest, USDC_BY_NETWORK } from '../src/revenue/x402.js';
import { handleX402Markdown, safePublicUrl, htmlToMarkdown } from '../src/revenue/x402-markdown.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const PAY_TO = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';
const env = (extra = {}) => ({ X402_PAY_TO: PAY_TO, DB: sqliteD1(), ...extra });
const PAGE = '<html><head><title>Hello &amp; welcome</title><script>evil()</script></head><body><nav>menu</nav><article><h1>Big title</h1><p>First <strong>bold</strong> line with <a href="/doc">a link</a>.</p><ul><li>one</li><li>two</li></ul></article><footer>foot</footer></body></html>';

function paymentFor(requirements) {
  return b64encodeJson({ x402Version: 2, resource: { url: 'x' }, accepted: requirements, payload: { signature: '0xsig', authorization: { from: '0xpayer', to: PAY_TO, value: requirements.amount } } });
}

function fakeNetwork({ verify = { isValid: true, payer: '0xpayer' }, settle = { success: true, transaction: '0xtx', network: 'eip155:84532', payer: '0xpayer' }, page = PAGE, pageStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(String(url));
    if (String(url).endsWith('/verify')) return Response.json(verify);
    if (String(url).endsWith('/settle')) return Response.json(settle);
    return new Response(page, { status: pageStatus, headers: { 'content-type': 'text/html; charset=utf-8' } });
  };
  return { calls, fetchImpl };
}

async function requirementsFrom(response) {
  assert.equal(response.status, 402);
  const required = b64decodeJson(response.headers.get('payment-required'));
  assert.equal(required.x402Version, 2);
  return required.accepts[0];
}

test('without configuration the paid service is off (fail closed)', async () => {
  const res = await handleX402Markdown(new Request('https://mel.dev/x402/markdown?url=https://example.com/a'), {});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'X402_NOT_CONFIGURED');
  assert.equal(x402Config({ X402_PAY_TO: 'not-an-address' }), null);
});

test('unpaid request gets a spec-compliant 402 with USDC requirements, nothing fetched', async () => {
  const net = fakeNetwork();
  const res = await handleX402Markdown(new Request('https://mel.dev/x402/markdown?url=https://example.com/a'), env(), net);
  const req = await requirementsFrom(res);
  assert.deepEqual(req, { scheme: 'exact', network: 'eip155:84532', amount: '2000', asset: USDC_BY_NETWORK['eip155:84532'], payTo: PAY_TO, maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } });
  assert.deepEqual(net.calls, []);
});

test('mainnet uses the Base USDC contract', () => {
  assert.equal(x402Config({ X402_PAY_TO: PAY_TO, X402_NETWORK: 'eip155:8453' }).asset, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
});

test('paid request: verify -> work -> settle, returns markdown + PAYMENT-RESPONSE, sale recorded', async () => {
  const e = env();
  const net = fakeNetwork();
  const first = await handleX402Markdown(new Request('https://mel.dev/x402/markdown?url=https://example.com/a'), e, net);
  const requirements = await requirementsFrom(first);
  const res = await handleX402Markdown(new Request('https://mel.dev/x402/markdown?url=https://example.com/a', { headers: { 'payment-signature': paymentFor(requirements) } }), e, net);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.title, 'Hello & welcome');
  assert.match(body.markdown, /^# Big title/);
  assert.match(body.markdown, /\*\*bold\*\*/);
  assert.match(body.markdown, /\[a link\]\(https:\/\/example\.com\/doc\)/);
  assert.doesNotMatch(body.markdown, /menu|foot|evil/);
  assert.equal(b64decodeJson(res.headers.get('payment-response')).transaction, '0xtx');
  assert.deepEqual(net.calls.map(u => u.replace(/^.*\//, '')), ['verify', 'a', 'settle']);
  const sale = await e.DB.prepare('SELECT status,amount,tx FROM x402_sales').first();
  assert.deepEqual({ ...sale }, { status: 'SETTLED', amount: '2000', tx: '0xtx' });
});

test('a failed job is never charged (no settle)', async () => {
  const e = env();
  const net = fakeNetwork({ pageStatus: 404 });
  const requirements = await requirementsFrom(await handleX402Markdown(new Request('https://mel.dev/x402/markdown?url=https://example.com/missing'), e, net));
  const res = await handleX402Markdown(new Request('https://mel.dev/x402/markdown?url=https://example.com/missing', { headers: { 'payment-signature': paymentFor(requirements) } }), e, net);
  assert.equal(res.status, 422);
  assert.equal(net.calls.some(u => u.endsWith('/settle')), false);
  assert.equal((await e.DB.prepare('SELECT status FROM x402_sales').first()).status, 'NOT_CHARGED_WORK_FAILED');
});

test('underpayment, wrong recipient or invalid signature is refused before any work', async () => {
  const net = fakeNetwork({ verify: { isValid: false, invalidReason: 'invalid_signature' } });
  const e = env();
  const requirements = await requirementsFrom(await handleX402Markdown(new Request('https://mel.dev/x402/markdown?url=https://example.com/a'), e, net));
  for (const bad of [{ ...requirements, amount: '1' }, { ...requirements, payTo: '0x' + '1'.repeat(40) }]) {
    const res = await handleX402Markdown(new Request('https://mel.dev/x402/markdown?url=https://example.com/a', { headers: { 'payment-signature': paymentFor(bad) } }), e, net);
    assert.equal(res.status, 402);
  }
  assert.deepEqual(net.calls, []);
  const res = await handleX402Markdown(new Request('https://mel.dev/x402/markdown?url=https://example.com/a', { headers: { 'payment-signature': paymentFor(requirements) } }), e, net);
  assert.equal(res.status, 402);
  assert.deepEqual(net.calls.map(u => u.replace(/^.*\//, '')), ['verify']);
});

test('monthly settlement cap keeps a free facilitator tier free', async () => {
  const e = env({ X402_MONTHLY_SETTLE_CAP: '0' });
  const net = fakeNetwork();
  const requirements = await requirementsFrom(await handleX402Markdown(new Request('https://mel.dev/x402/markdown?url=https://example.com/a'), e, net));
  const res = await handleX402Markdown(new Request('https://mel.dev/x402/markdown?url=https://example.com/a', { headers: { 'payment-signature': paymentFor(requirements) } }), e, net);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'X402_MONTHLY_CAP_REACHED');
  assert.deepEqual(net.calls, []);
});

test('private, local and non-http targets are refused before asking for payment', () => {
  for (const bad of ['http://localhost/x', 'http://127.0.0.1/', 'http://192.168.1.10/', 'http://10.0.0.1/', 'file:///etc/passwd', 'http://[::1]/', 'https://user:pw@example.com/', 'http://example.com:8080/', 'https://mel.dev/api/x', 'http://intranet/']) {
    assert.equal(safePublicUrl(bad, 'mel.dev'), null, bad);
  }
  assert.ok(safePublicUrl('https://example.com/a?b=1', 'mel.dev'));
});

test('generic handler settles only on 2xx', async () => {
  const net = fakeNetwork();
  const e = env();
  const request = () => new Request('https://mel.dev/x402/thing');
  const unpaid = await handlePaidRequest({ request: request(), env: e, product: 't', amount: 5, description: 'd', work: async () => Response.json({ ok: true }), fetchImpl: net.fetchImpl });
  const req = await requirementsFrom(unpaid);
  const paid = await handlePaidRequest({ request: new Request('https://mel.dev/x402/thing', { headers: { 'payment-signature': paymentFor(req) } }), env: e, product: 't', amount: 5, description: 'd', work: async () => Response.json({ ok: true }), fetchImpl: net.fetchImpl });
  assert.equal(paid.status, 200);
});

test('html conversion keeps code blocks and drops comments', () => {
  const { markdown } = htmlToMarkdown('<main><!-- hidden --><pre><code>a &lt; b</code></pre></main>');
  assert.equal(markdown, '```\na < b\n```');
});
