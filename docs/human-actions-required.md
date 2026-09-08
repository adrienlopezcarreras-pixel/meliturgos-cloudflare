# MELITURGOS — ACTIONS REQUISES PAR L'HUMAIN

## Priorité IMMÉDIATE (P0 FRONTEND) 🚨

### P0_UI_PRODUCTION: BLOCKED_NOT_DEPLOYED (LOCAL DEV OK)

**STATUS RÉEL**:
- ✅ UI from scratch créée localement (ROOT_PAGE_V5_CLASSIC validée par Adrien)
- ✅ Implementation fonctionnelle (tests + preview fonctionnels)
- ❌ Production: https://meliturgos.adrien-lopezcarreras.workers.dev/ sert ENCORE ancienne UI cassée
- ❌ Pas de déploiement sans validation visuelle Adrien
- ❌ P0_INTERFACE_COMPLETE = FALSE

**PROBLÈME IDENTIFIÉ**:
- ancienne UI encore visible en production
- avatar trop grand
- composé superposé à MEL
- scroll horizontal
- nouvelle UI from scratch NON visible

**ACTION UTILISATEUR** (ADRIEN):
1. Identifier exactement quel HTML est servi par GET /
2. Vérifier qu'il utilise pas ancienne ROOT_PAGE
3. Générer preview fidèle
4. **NE PAS déployer sans validation visuelle Adrien**
5. Après validation:
   - Raccouter GET / à nouvelle UI
   - `wrangler deploy`
   - Vérifier URL production
   - Vérifier absence overflow/composer overlay
6. SEULEMENT ALORS: P0_UI_PRODUCTION = DONE_VERIFIED

**IMPORTANCE**: HIGH - mais NON BLOQUANT LE RESTE DU PROJET
- Le code est PRÊT (Phase 5 complete)
- D1 backup préservé
- Tous les autres P1-P7 poursuivront indépendamment
- UI-PROD-01 séparée pour ne pas arrêter le développement

**STATUS**: CODE PRÊT | Déploiement et validation visuelle bloquées

---

## Moyenne Priorité (BLOCKED_EXTERNAL_CREDENTIALS)

### H-A-01: Configuration Cloudflare API (Facultatif)

**IMPORTANCE**: LOW
- Déploiement manuel déjà possible
- Certains features nécessitent API tokens (mais optionnels)
- Ce tracker déplacé pour prioriser P0 Frontend

---

## Moyenne Priorité (Future)

### H-A-02: Tâches ChatGPT
- Importer fichiers ChatGPT JSON réels
- Valider import sur data production
- Problème: fichier ChatGPT non présent en local

### H-A-03: Tâches Médias Professeur (Hors GEN2)
- Télécharger assets médias professeur
- Activer endpoints médias professeur
- Problème: MEDIA_FEATURE_ENABLED=false

### H-A-04: Tâches OAuth Connectors
- Configurer Gmail/Google connector (OAuth)
- Configurer Outlook/Microsoft connector (OAuth)
- Configurer GitHub connector (OAuth)
- Problème: tokens OAuth manquants

---

## Faible Priorité (UX/Interfaces)

### H-A-05: PWA Service Worker
- Installer service worker avancé
- Mettre en place caching intelligente
- Problème: implémentation complexe

### H-A-06: Mobile Applications (Hors GEN2)
- Créer Android companion app
- Créer Windows companion app
- Problème: stacks non choisies

---

## Important Export ✓

### Documentation Existantes

- ✅ `STATEMENT-RESUME-GEN2.md` — Résumé complet gén2
- ✅ `docs/gen2-resume.md` — Progression détaillée
- ✅ `docs/gen2-progress.md` — Mission log complet
- ✅ `docs/MELITURGOS-MASTER-SPEC.md` — Spécification complète
- ✅ `docs/MELITURGOS-MASTER-CHECKLIST.md` — Checklist détaillée

---

## NOTE STRATÉGIQUE

**Le projet MELITURGOS ne peut pas être bloqué par des tokens.**

Toutes les tâches GEN2 (GEN2-70+) sont mises en pause pour DEBUG uniquement.
Si nécessaire:
1. Créer des fausses variables d'environnement (mocks)
2. Continuer l'intégralité des tests unitaires
3. Déployer en mode simulation (wrangler --dry-run)

La production sera reprise UNTIL CREDENTIALS + OPERATIONS MÉNAGERIES.

---

**STATUS ACTUALISÉ**: 2026-09-07 17:44:00 UTC

## GEN2-45/64/10 COMPLETED ✓

**Security improvements implemented in latest commit:**
- ✅ CSRF protection in audit service
- ✅ D1 persistence for audit logs (replaced console-only logging)
- ✅ Memory contradiction detection (findConflicts, detectContradiction)
- ✅ V5 reference cleanup in UI tests
- ✅ All 27 tests passing

---
**AGENCY**: OpenHands (Agent autonome, non-bloqué par external dependencies)
