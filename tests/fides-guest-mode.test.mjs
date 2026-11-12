import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { handlePublicFidesChat } from '../src/api/public-fides-chat.js';
import { renderFidesGuestPage } from '../src/pages/fides-guest-page.js';

test('MEL FIDES guest page clearly exposes an isolated presentation mode', () => {
  const html = renderFidesGuestPage();
  assert.match(html, /MEL FIDES/);
  assert.match(html, /MODE INVITÉ/);
  assert.match(html, /aucun accès aux données privées/i);
  assert.match(html, /pas de mémoire personnelle/i);
  assert.match(html, /pas d'autonomie/i);
  assert.match(html, /Prototype de présentation/i);
  assert.match(html, /api\/public\/fides\/chat/);
});

test('MEL FIDES guest chat is stateless and sends doctrinal guardrails to Workers AI', async () => {
  let call = null;
  const rows = new Map();
  const env = {
    FIDES_PUBLIC_CHAT_ENABLED: 'true',
    DB: {
      prepare(sql) {
        let args = [];
        return {
          bind(...next) { args = next; return this; },
          async run() {
            if (sql.startsWith('INSERT INTO public_rate_limits')) {
              const [key, now, , resetBefore] = args;
              const previous = rows.get(key);
              rows.set(key, !previous || previous.window_started <= resetBefore
                ? { window_started: now, count: 1 }
                : { window_started: previous.window_started, count: previous.count + 1 });
            }
            return {};
          },
          async first() { return rows.get(args[0]) || null; },
        };
      },
    },
    AI: {
      async run(model, payload) {
        call = { model, payload };
        return { response: 'Réponse de démonstration.' };
      },
    },
  };
  const request = new Request('https://mel.example/api/public/fides/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Que signifie le baptême ?' }),
  });

  const response = await handlePublicFidesChat(request, env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.scope, 'FIDES_GUEST_PRESENTATION_ONLY');
  assert.equal(body.private_data_access, false);
  assert.equal(body.action_access, false);
  assert.equal(body.ecclesial_approval, 'NOT_YET_REQUESTED_OR_GRANTED');
  assert.ok(call);
  const messages = call.payload.messages;
  assert.equal(messages.at(-1).content, 'Que signifie le baptême ?');
  const system = messages[0].content;
  assert.match(system, /Aucune donnee personnelle du proprietaire/i);
  assert.match(system, /aucun outil et aucune action administrative/i);
  assert.match(system, /Ne te presente pas comme autorite ecclesiale, pretre/i);
  assert.match(system, /Ne fabrique jamais verset, paragraphe, citation/i);
  assert.match(system, /dialogue catholique-orthodoxe/i);
  assert.equal(call.payload.max_tokens, 500);
  assert.equal(rows.size, 2, 'both per-IP and global 24-hour quota must be written');
});

test('public FIDES routes are placed before owner authentication', async () => {
  const source = await fs.readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  const fidesPage = source.indexOf('url.pathname === "/fides"');
  const fidesApi = source.indexOf('url.pathname === "/api/public/fides/chat"');
  const ownerAuth = source.indexOf('const auth = requireAuth(request, env);', source.indexOf('async function routeResolvedRequest'));
  assert.ok(fidesPage > 0 && fidesApi > 0 && ownerAuth > 0);
  assert.ok(fidesPage < ownerAuth);
  assert.ok(fidesApi < ownerAuth);
});
