import test from 'node:test';
import assert from 'node:assert/strict';

import router from '../src/router.js';
import { renderPrivacyPolicyPage } from '../src/pages/privacy-policy.js';

test('privacy policy is publicly reachable without MEL operator authentication', async () => {
  const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'secret' };
  const response = await router.fetch(new Request('https://mel.example/privacy'), env, {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  const html = await response.text();
  assert.match(html, /Politique de confidentialité/);
  assert.match(html, /Google API Services User Data Policy/);
  assert.match(html, /Limited Use/);

  const protectedResponse = await router.fetch(new Request('https://mel.example/professor'), env, {});
  assert.equal(protectedResponse.status, 401);
});

test('privacy policy contains the disclosures needed for connected Gmail use', () => {
  const html = renderPrivacyPolicyPage();
  assert.match(html, /lire ou rechercher des messages/);
  assert.match(html, /préparer des brouillons/);
  assert.match(html, /envoyer des messages/);
  assert.match(html, /ne sont pas vendues/);
  assert.match(html, /stockés côté serveur sous forme chiffrée/);
  assert.match(html, /retirer l’accès de MEL/);
});
