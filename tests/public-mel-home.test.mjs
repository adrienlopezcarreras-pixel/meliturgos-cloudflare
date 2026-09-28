import test from 'node:test';
import assert from 'node:assert/strict';

import router from '../src/router.js';
import { renderPublicMelHomePage } from '../src/pages/public-mel-home.js';

test('public MEL homepage is reachable without operator authentication', async () => {
  const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'secret' };
  const response = await router.fetch(new Request('https://mel.example/about'), env, {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  const html = await response.text();
  assert.match(html, /Assistant personnel connecté/);
  assert.match(html, /Connexion à Gmail/);
  assert.match(html, /href="\/privacy"/);
});

test('public MEL homepage explains Gmail use and links privacy policy', () => {
  const html = renderPublicMelHomePage();
  assert.match(html, /rechercher et lire des messages/);
  assert.match(html, /préparer des brouillons/);
  assert.match(html, /envoyer des messages/);
  assert.match(html, /ne vend pas les données Gmail/);
  assert.match(html, /politique de confidentialité de MEL/);
});
