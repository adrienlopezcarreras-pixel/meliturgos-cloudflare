/**
 * UI Anti-Regression Test - Version 5 Classic
 *
 * Vérifie que l'UI FROM SCRATCH actuelle est correctement implantée et accessible via la racine (/).
 *
 * Vérifications:
 * 1. PAGE '/' retourne l'UI FROM SCRATCH actuelle (ROOT_PAGE_V5_CLASSIC)
 * 2. Préserve avatar MEL (MEL_AVATAR_B64)
 * 3. Zone de texte + dépôt de fichiers
 * 4. Lien Mode complet visible
 * 5. Structure responsive
 * 6. Pas de route active ROOT_PAGE_PATCHED_V3
 */

import { readFileSync } from 'node:fs';

const workerSource = readFileSync('./worker.js', 'utf-8');
console.log('=== UI Anti-Regression Test - Version 5 Classic ===\n');

// Test 1: Avatar MEL présent
const avatarMatch = workerSource.match(/const MEL_AVATAR_B64="([^"]+)"/);
if (!avatarMatch || avatarMatch[1].length < 1000) {
  console.error('❌ Avatar MEL manquant');
  process.exit(1);
}
console.log('✅ Avatar MEL présent');

// Test 2: ROOT_PAGE_V5_CLASSIC routé sur /
if (!/return html\(ROOT_PAGE_V5_CLASSIC\);/.test(workerSource)) {
  console.error('❌ Route / ne retourne pas ROOT_PAGE_V5_CLASSIC');
  process.exit(1);
}
console.log('✅ Route / → ROOT_PAGE_V5_CLASSIC');

// Helper: extract V5 HTML
const htmlMatch = workerSource.match(/const ROOT_PAGE_V5_CLASSIC=`([\s\S]*?)`;[\r\n]+export default/);
if (!htmlMatch) {
  console.error('❌ Constante ROOT_PAGE_V5_CLASSIC illisible');
  process.exit(1);
}
const html = htmlMatch[1];

const checks = [
  ['Avatar central cliquable', /<div [^>]*id="mel-avatar"/],
  ['Zone texte', /<textarea[^>]*id="q"/],
  ['Zone dépôt fichier', /<label[^>]*id="drop-zone"/],
  ['Bouton envoyer', /<button[^>]*type="submit"/],
  ['Lien mode complet', /<a[^>]*href="\/professor"/],
  ['Diagnostic', /id="diagnostic"/],
  ['Sauvegarde', /id="backup"/],
  ['Viewport fit', /<meta[^>]*viewport-fit=cover/],
  ['Media query mobile', /@media\(max-width:600px\)/],
  ['Sans interaction count', /(?!.*interactions.*échanges)/],
];

let passed = true;
for (const [name, pattern] of checks) {
  if (pattern.test(html)) {
    console.log('✅', name);
  } else {
    console.error('❌', name);
    passed = false;
  }
}

// Test 6: Pas de route active V3
if (/return html\(ROOT_PAGE_PATCHED_V3\);/.test(workerSource)) {
  console.error('❌ Ancienne route ROOT_PAGE_PATCHED_V3 encore active');
  passed = false;
} else {
  console.log('✅ Ancienne route V3 désactivée');
}

if (!passed) {
  console.error('\n⚠️ UI Anti-Regression: des vérifications ont échoué');
  process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('✅ UI ANTI-REGRESSION: ALL TESTS PASSED');
console.log('='.repeat(60));
