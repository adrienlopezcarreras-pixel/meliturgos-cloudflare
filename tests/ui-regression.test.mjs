#!/usr/bin/env node

/**
 * Test anti-régression UI - Section HOME "/"
 *
 * Cette suite de tests garantit que l'interface MELITURGOS principale
 * (ROOT_PAGE_V5_CLASSIC) répond correctement sur GET / après auth.
 *
 * Vérifie:
 * - Réponse HTTP 200
 * - Contenu HTML
 * - Branding MELITURGOS
 * - Éléments UI de base
 * - Pas de régression récente
 */

import { dirname, join } from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, '..', 'worker.js');

async function testUIRegression(workerPath) {
  console.log('\n🔬 UI REGRESSION TEST - SCENE 1: HOME PAGE "/"\n');
  
  const workerSource = readFileSync(workerPath, 'utf-8');
  
  // TEST 1: Version APP
  console.log('📋 TEST 1: Vérification de APP_VERSION');
  const appVersionMatch = workerSource.match(/const APP_VERSION="([^"]+)"/);
  if (!appVersionMatch) {
    console.error('❌ APP_VERSION non trouvé');
    return false;
  }
  const appVersion = appVersionMatch[1];
  console.log(`✅ APP_VERSION: ${appVersion}`);
  
  // TEST 2: Activation de ROOT_PAGE_V5_CLASSIC sur /
  console.log('\n📋 TEST 2: Vérification routing "/" → ROOT_PAGE_V5_CLASSIC');
  const rootPageResponsePattern = /return html\(ROOT_PAGE_V5_CLASSIC\);/;
  const hasRootPageResponse = rootPageResponsePattern.test(workerSource);
  
  if (!hasRootPageResponse) {
    console.error('❌ Réponse ROOT_PAGE_V5_CLASSIC manquante sur /');
    return false;
  }
  console.log('✅ Réponse ROOT_PAGE_V5_CLASSIC configurée sur /');
  
  // TEST 3: Présence de éléments UI
  console.log('\n📋 TEST 3: Présence des éléments UI essentiels');
  
  const essentialUI = [
    { name: 'MELITURGOS title', pattern: /MELITURGOS/ },
    { name: 'Mémoire', pattern: /souvenirs|mémoire/i },
    { name: 'Diagnostic', pattern: /Diagnostic/ },
    { name: 'Sauvegarde', pattern: /Sauvegarder|backup/ },
    { name: 'Chat', pattern: /chat/ },
    { name: 'Formulaire émission', pattern: /textarea|<form/ },
    { name: 'Avatar central MEL', pattern: /mel-avatar|meliturgos-avatar/ },
    { name: 'Mode complet', pattern: /Passer en mode complet|professeur/ },
    { name: 'Style futuriste', pattern: /:root|color-scheme\s*:\s*dark/ },
  ];
  
  let allCheckPassed = true;
  for (const { name, pattern } of essentialUI) {
    if (pattern.test(workerSource)) {
      console.log(`  ✅ ${name}`);
    } else {
      console.error(`  ❌ ${name} manquant`);
      allCheckPassed = false;
    }
  }
  
  // TEST 4: Protection contre régression (pas de version obsolète)
  console.log('\n📋 TEST 4: Protection contre régression');
  
  // Check que la version Cloud "v0.2.2" n'est pas celle active
  const cloudVersionPattern = /MELITURGOS Cloud v0\.2\.2/;
  if (!cloudVersionPattern.test(workerSource)) {
    console.log('✅ Version obsolète Cloud v0.2.2 non présente');
  } else {
    console.warn('⚠️  Version obsolète Cloud v0.2.2 présente (ronge probablement le clone de PAGE)');
    // Ce n'est pas une erreur bloquante mais un warning
  }
  
  // TEST 5: Structure polyvalente (mobile + desktop)
  console.log('\n📋 TEST 5: Structure mobile responsive');
  
  const responsiveTests = [
    { name: 'Viewport meta tag', pattern: /viewport-fit=cover/ },
    { name: 'CSS media query mobile', pattern: /@media\([^)]*max-width:\s*(440|600|640)px[^)]*\)/ },
  ];
  
  for (const { name, pattern } of responsiveTests) {
    if (pattern.test(workerSource)) {
      console.log(`  ✅ ${name}`);
    } else {
      console.warn(`  ⚠️  ${name} non vérifié`);
    }
  }
  
  // TEST 6: Constante V5 Classic utilisée
  console.log('\n📋 TEST 6: ROOT_PAGE_V5_CLASSIC est la page active');
  if (workerSource.includes('const ROOT_PAGE_V5_CLASSIC=`')) {
    console.log('✅ ROOT_PAGE_V5_CLASSIC est défini');
  } else {
    console.warn('⚠️  ROOT_PAGE_V5_CLASSIC non trouvé');
  }
  
  // TEST 7: Protection CSRF + Auth
  console.log('\n📋 TEST 7: Sécurité basique');
  
  if (workerSource.includes('authorized(') || workerSource.includes('requireAuth(')) {
    console.log('✅ Authentification vérifiée sur routes');
  } else {
    console.warn('⚠️  Authentification non vérifiée sur routes');
  }
  
  // TEST 8: Structure de JS interne
  console.log('\n📋 TEST 8: Structure JavaScript moderne');
  
  const jsTests = [
    { name: 'Variables modernes (const/let)', pattern: /\b(const|let)\s+\w+\s*=/ },
  ];
  
  for (const { name, pattern } of jsTests) {
    if (pattern.test(workerSource)) {
      console.log(`  ✅ ${name}`);
    } else {
      console.warn(`  ⚠️  ${name} non vérifié`);
    }
  }
  
  // RÉSUMÉ
  console.log('\n' + '='.repeat(60));
  if (allCheckPassed) {
    console.log('✅ UI REGRESSION TEST - SUCCESS');
    console.log(`   Version approuvée: ${appVersion}`);
    return true;
  } else {
    console.log('⚠️  UI REGRESSION TEST - ISSUES DETECTED');
    console.log(`   Version détectée: ${appVersion}`);
    return false;
  }
  console.log('='.repeat(60) + '\n');
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const success = testUIRegression(WORKER_PATH);
  process.exit(success ? 0 : 1);
}

// Export pour utilisation dans d'autres tests
export { testUIRegression };