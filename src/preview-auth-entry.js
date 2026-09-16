import app from './professor-live-learning-entry.js';
import { applyMelThemeBackgrounds } from './pages/mel-theme-backgrounds.js';
import {
  basicAuthorizationFromCredentials,
  createPreviewSessionToken,
  isBasicAuthorization,
  isBearerAuthorization,
  isPreviewEnvironment,
  previewSessionClearCookie,
  previewSessionSetCookie,
  requestHasValidPreviewSession,
  verifyBasicAgainstProduction,
  withPreviewLocalBearer,
} from './preview-auth-session.js';

function withoutTerminalNewline(value) {
  return String(value ?? '').replace(/[\r\n]+$/g, '');
}

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function previewLoginPage(message = '') {
  const feedback = message
    ? `<p class="feedback" role="alert">${htmlEscape(message)}</p>`
    : '<p class="hint">Utilise les identifiants habituels de MEL.</p>';
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Connexion MEL</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;background:#07111f;color:#fff}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 50% 15%,#173458,#07111f 55%,#040913)}main{width:min(430px,100%);padding:26px;border:1px solid #405875;border-radius:20px;background:rgba(9,18,32,.96);box-shadow:0 22px 70px rgba(0,0,0,.45)}h1{margin:0 0 8px;font-size:1.45rem}.hint,.feedback{margin:0 0 18px;color:#cbd5e1}.feedback{color:#fecaca}label{display:block;margin:13px 0 6px;font-weight:750}input{width:100%;min-height:46px;border:1px solid #516b88;border-radius:11px;background:#0d1b2d;color:#fff;padding:10px 12px;font:inherit}button{width:100%;min-height:47px;margin-top:18px;border:1px solid #3b82f6;border-radius:11px;background:linear-gradient(180deg,#2563eb,#1747ad);color:#fff;font:inherit;font-weight:850;cursor:pointer}.small{margin-top:16px;font-size:.78rem;color:#94a3b8;line-height:1.4}</style></head><body><main><h1>Connexion à MEL</h1>${feedback}<form method="post" action="/__preview/login" autocomplete="on"><label for="username">Identifiant</label><input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required><label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Ouvrir MEL</button></form><div class="small">Session preview sécurisée et temporaire. Les identifiants ne sont pas enregistrés.</div></main></body></html>`;
}

function loginResponse(message = '', status = 200) {
  return new Response(previewLoginPage(message), {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}

function redirectResponse(location, headers = {}) {
  return new Response(null, {
    status: 303,
    headers: {
      location,
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function isInteractivePreviewPage(request, url) {
  if (request.method !== 'GET') return false;
  if (!['/', '/mvp', '/professor'].includes(url.pathname)) return false;
  const accept = request.headers.get('accept') || '';
  return !accept || /text\/html|application\/xhtml\+xml|\*\/\*/i.test(accept);
}

async function handlePreviewLogin(request, env) {
  const localPassword = withoutTerminalNewline(env?.MELITURGOS_PASSWORD);
  if (!localPassword) return loginResponse('La preview n’est pas configurée correctement.', 503);

  if (request.method === 'GET') {
    if (await requestHasValidPreviewSession(request, localPassword)) return redirectResponse('/');
    return loginResponse();
  }
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, POST' } });

  let form;
  try {
    form = await request.formData();
  } catch {
    return loginResponse('Formulaire invalide.', 400);
  }
  const username = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');
  if (!username || !password || username.length > 256 || password.length > 4096) {
    return loginResponse('Identifiant ou mot de passe incorrect.', 401);
  }

  let authorization;
  try {
    authorization = basicAuthorizationFromCredentials(username, password);
  } catch {
    return loginResponse('Impossible de préparer l’authentification.', 500);
  }
  const verificationRequest = new Request(request.url, {
    method: 'GET',
    headers: { authorization, accept: 'text/html,application/xhtml+xml' },
  });
  const accepted = await verifyBasicAgainstProduction(verificationRequest, env);
  if (!accepted) return loginResponse('Identifiant ou mot de passe incorrect.', 401);

  const token = await createPreviewSessionToken(localPassword);
  return redirectResponse('/', { 'set-cookie': previewSessionSetCookie(token) });
}

/**
 * Compatibility bridge for browsers or tools that still send HTTP Basic.
 * The owner credentials are checked only against the canonical production
 * worker. Successful verification is converted to the preview-local Bearer.
 */
export async function bridgePreviewBasicAuth(request, env, fetchImpl = globalThis.fetch) {
  if (!isPreviewEnvironment(env)) return request;
  const authorization = request.headers.get('authorization') || '';
  if (!isBasicAuthorization(authorization)) return request;

  const localPassword = withoutTerminalNewline(env?.MELITURGOS_PASSWORD);
  if (!localPassword) return request;
  const accepted = await verifyBasicAgainstProduction(request, env, fetchImpl);
  if (!accepted) return request;
  return withPreviewLocalBearer(request, localPassword);
}

async function authenticatePreviewRequest(request, env) {
  const localPassword = withoutTerminalNewline(env?.MELITURGOS_PASSWORD);
  if (!localPassword) return request;

  const authorization = request.headers.get('authorization') || '';
  if (isBearerAuthorization(authorization)) return request;
  if (await requestHasValidPreviewSession(request, localPassword)) return withPreviewLocalBearer(request, localPassword);
  return bridgePreviewBasicAuth(request, env);
}

export default {
  async fetch(request, env, ctx) {
    if (!isPreviewEnvironment(env)) {
      const authenticatedRequest = request;
      const response = await app.fetch(authenticatedRequest, env, ctx);
      return applyMelThemeBackgrounds(response);
    }

    const url = new URL(request.url);
    if (url.pathname === '/__preview/login') return handlePreviewLogin(request, env);
    if (url.pathname === '/__preview/logout') {
      return redirectResponse('/__preview/login', { 'set-cookie': previewSessionClearCookie() });
    }

    const authenticatedRequest = await authenticatePreviewRequest(request, env);
    const originalAuthorization = request.headers.get('authorization') || '';
    const authenticatedAuthorization = authenticatedRequest.headers.get('authorization') || '';
    const gainedPreviewAuth = authenticatedAuthorization !== originalAuthorization && isBearerAuthorization(authenticatedAuthorization);
    const hasUsableAuthorization = isBearerAuthorization(originalAuthorization) || gainedPreviewAuth;
    const hasSession = hasUsableAuthorization || await requestHasValidPreviewSession(request, env?.MELITURGOS_PASSWORD);

    if (!hasSession && isInteractivePreviewPage(request, url)) {
      return redirectResponse('/__preview/login');
    }
    if (!hasSession && isBasicAuthorization(originalAuthorization)) {
      return loginResponse('Identifiant ou mot de passe incorrect.', 401);
    }

    const response = await app.fetch(authenticatedRequest, env, ctx);
    return applyMelThemeBackgrounds(response);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};
