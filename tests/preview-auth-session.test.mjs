import assert from 'node:assert/strict';
import {
  basicAuthorizationFromCredentials,
  createPreviewSessionToken,
  isPreviewEnvironment,
  previewSessionConstants,
  previewSessionSetCookie,
  requestHasValidPreviewSession,
  verifyBasicAgainstProduction,
  verifyPreviewSessionToken,
  withPreviewLocalBearer,
} from '../src/preview-auth-session.js';
import {
  MEL_THEME_BACKGROUNDS,
  MEL_THEME_BACKGROUND_LEGACY,
  rewriteMelThemeBackgrounds,
} from '../src/pages/mel-theme-backgrounds.js';

const env = {
  MEL_RUNTIME_ENV: 'preview',
  MEL_PREVIEW_ISOLATED: 'true',
  MEL_PREVIEW_AUTH_VERIFY_URL: 'https://meliturgos.example.workers.dev/',
};
const previewSecret = 'local-preview-secret';
const now = Date.UTC(2026, 8, 16, 21, 30, 0);

assert.equal(isPreviewEnvironment(env), true, 'preview isolation must be explicit');
assert.equal(isPreviewEnvironment({ MEL_RUNTIME_ENV: 'preview' }), false, 'preview auth must fail closed without isolation flag');

const token = await createPreviewSessionToken(previewSecret, now);
assert.match(token, /^\d{10}\.[a-f0-9]{64}$/);
assert.equal(await verifyPreviewSessionToken(token, previewSecret, now + 60_000), true, 'fresh signed session must verify');
assert.equal(await verifyPreviewSessionToken(token, 'wrong-secret', now + 60_000), false, 'session must be bound to preview secret');
assert.equal(await verifyPreviewSessionToken(token.replace(/.$/, token.endsWith('0') ? '1' : '0'), previewSecret, now + 60_000), false, 'tampered session must fail');
assert.equal(
  await verifyPreviewSessionToken(token, previewSecret, now + (previewSessionConstants.ttlSeconds + 1) * 1000),
  false,
  'expired session must fail',
);

const cookie = previewSessionSetCookie(token);
assert.match(cookie, /HttpOnly/);
assert.match(cookie, /Secure/);
assert.match(cookie, /SameSite=Strict/);
const cookieRequest = new Request('https://preview.example.workers.dev/api/chat', { headers: { cookie } });
assert.equal(await requestHasValidPreviewSession(cookieRequest, previewSecret, now + 1_000), true, 'signed cookie must authenticate same-origin API requests');

const bearerRequest = withPreviewLocalBearer(new Request('https://preview.example.workers.dev/api/chat'), previewSecret);
assert.equal(bearerRequest.headers.get('authorization'), `Bearer ${previewSecret}`);

const unicodeBasic = basicAuthorizationFromCredentials('adrien', 'été-✓');
assert.match(unicodeBasic, /^Basic\s+[A-Za-z0-9+/]+=*$/);

const browserBasicRequest = new Request('https://preview.example.workers.dev/', {
  headers: { authorization: basicAuthorizationFromCredentials('adrien', 'owner-password') },
});
let verificationOptions;
const accepted = await verifyBasicAgainstProduction(browserBasicRequest, env, async (url, options) => {
  assert.equal(url, env.MEL_PREVIEW_AUTH_VERIFY_URL);
  verificationOptions = options;
  return new Response('<!doctype html>', { status: 200 });
});
assert.equal(accepted, true, 'production 2xx must accept owner Basic credentials');
assert.equal(verificationOptions.redirect, 'follow', 'canonical redirects must be followed for browser credential verification');
assert.match(verificationOptions.headers.authorization, /^Basic\s+/);

const refused = await verifyBasicAgainstProduction(browserBasicRequest, env, async () => new Response('no', { status: 401 }));
assert.equal(refused, false, 'production 401 must reject browser credentials');

const legacyThemes = ['classic', 'crusade', 'religious', 'granada', 'aviation', 'paladin', 'amazon'];
assert.deepEqual(Object.keys(MEL_THEME_BACKGROUNDS), legacyThemes, 'legacy theme metadata remains stable for compatibility');
assert.deepEqual(Object.keys(MEL_THEME_BACKGROUND_LEGACY), legacyThemes);
const sample = `before ${MEL_THEME_BACKGROUND_LEGACY.granada} after`;
const rewritten = rewriteMelThemeBackgrounds(sample, { ...MEL_THEME_BACKGROUNDS, granada: 'https://example.invalid/new.webp' });
assert.equal(rewritten, sample, 'retired background rewriter must stay transparent so V3 remains the sole visual owner');

console.log('preview auth session + transparent legacy theme shim: ok');
