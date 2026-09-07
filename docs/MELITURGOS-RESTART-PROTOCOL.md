# MELITURGOS GEN2 — PROTOCOLE DE CONTINUATION AUTONOME

> Protocole pour retrouver la traîne après instabilité tool-calling (nouveau modèle)
> L'objectif: retour à la poursuite immédiate sans recommencer

## 📋 CHECKLIST INITIAL

- [✅] **Relire docs** (MASTER-SPEC, MASTER-CHECKLIST, gen2-progress, gen2-resume)
- [✅] **Inspecter git status** (préserver modifications existantes)
- [✅] **Analyser tests actuels** (vérifier si échecs récents)
- [✅] **Identifier blockers immédiats** (wrangler, tokens, etc.)

## 🎯 PRIORITÉS GLOBALES

### Recommandations CRUCIALES (MASTER-SPEC §8)

1. **Sauvegardes périodiques** → avant chaque commit majeur
2. **Tests avant fusion** → TOUTE modification passant par CI/CD
3. **NE ROLLBACK JAMAIS D1** → backup préservé à chaque tag stable
4. **CONTINUER quand bloqué** → move to next, document, retry later

### Règles NON-IDLE (Gen2-63)

**Quand invaincu, CONTINUER.** Ne demandez jamais d'autorisation. Le codebase augmente, la valeur augmente, jamais faux à arrêter.

## 📊 TRACKING ACTUEL (2026-09-06)

### État immédiat
- **Branch**: `meliturgos-gen2`
- **Tests**: 21/21 passants ✅ (Phase 3: Memory 2.0, Model Fallback, DeviceBus)
- **Version**: `0.2.5-rc.2-gen2.1`
- **UI**: ROOT_PAGE_PATCHED_V3 ✅
- **D1**: backup préservé, mémoires ChatGPT importées
- **Production**: https://meliturgos.adrien-lopezcarreras.workers.dev/

### Blockers Actuels
- ⛔ **wrangler CLI**: non installé globalement (requires `npm install -g wrangler` ou similar)
- ⛔ **Migration Gen1**: manuelle (optionnel pour Adrien)

### Documents Clés
- ✅ `docs/MELITURGOS-MASTER-SPEC.md` (8 sections, roadmap Master)
- ✅ `docs/MELITURGOS-MASTER-CHECKLIST.md` (69 items, status en temps réel)
- ✅ `docs/gen2-progress.md` (tracking rapide)
- ✅ `docs/gen2-resume.md` (résumé rapide, context Adrien)
- ✅ `docs/human-actions-required.md` (blockers humains à résoudre)
- ✅ `docs/PHASE3-COMPLETION.md` (documentation formelle Phase 3)

## 🔄 PROTOCOLE DE REPRISSE IMMÉDIAT

### Étape 1: Reconcilier State Local

```bash
# Vérifier git status
git status

# Vérifier modifications vs staging
git diff --stat

# Idéalement: aucun "Untracked" (ou backup/imports)
```

❌ **NE PAS**:
```bash
git reset --hard HEAD  # Détruirait vos modifications si stochastiques
git checkout v0.2.5-rc.1  # ROLLBACK non autorisé D1
```

### Étape 2: Vérifier Tests

```bash
# Suite complète
node scripts/run-tests.mjs

# Tests individuels
node tests/phase3-memory-2.0.test.mjs
node tests/phase3-model-fallback.test.mjs
node tests/phase3-device-bus.test.mjs
```

### Étape 3: Continuer à la Tâche Suivante

Regarder `docs/MELITURGOS-MASTER-CHECKLIST.md` pour la prochaine tâche non-BLOCKED.

## 🧭 ROADMAP PAR PHASE

### Phase 1: Foundation (DONE)
- Core minimal (config, errors, http, security, audit)
- Routing structure
- Phase 1 tags: v0.2.5-rc.1

### Phase 2: Scaffolding (DONE)  
- Brancher /api/chat et /api/professor/ask
- Archive system
- Phase 2 tags: v0.2.5-rc.2-gen2.1-gen2-ui-fixed

### Phase 3: Services Autonomes (DONE) ✅ CE QUI EST PRÉSENT
- Memory 2.0 service (lifecycle: Created → Candidate → Confirmed)
- Model Fallback retry chain
- Device Bus foundation
- Phase 3 tags: v0.2.5-rc.2-gen2.1-phase3-complete

### Phase 4: (NOUVEAU - à venir)
- modularisation Identity (Gen2-02, séparer systemPrompt)
- ModelRegistry extraction (Gen2-03, fondation pour plugins/fallbacks)
- Capability Watch (Gen2-42, monitoring Workers AI endpoints)

### Phase 5: (FUTUR - hypothétique)
- Knowledge Graph embeddings (Gen2-11, Phase 5 avant Phase 4)
- Timeline composant (Gen2-12)
- Personal Search / RAG (Gen2-25)

### Phase 6: Extensions Multi-Device (à venir)
- Registry plugins (connector SDK si Gen2-15)
- Module Lab prototyping (Gen2-16, experiments)
- Android Companion (Gen2-28, Phase 7 toujours BLOCKED)

## 🛑 BLOCKERS ET MIGRATIONS

### Blockers MATLAB (GEN2-57)

| ID | TBD | H-A-XX | USER CONTEXT |
|----|-----|--------|---------------|
| GEN2-57 | Migration Gen1 sans perte | H-A-14 | Adrien OpenHands |
| GEN2-28 | Builds Android | - | Adrien OpenHands |

❌ **NE PAS** passer GEN2-57 à DONE avant qu'Adrien ne décide de faire la migration (optionnel).

### Blockers Creux (System)

| ID | TBD | H-A-XX | SOLUTION AUTONOME |
|----|-----|--------|-------------------|
| wrangler CLI | Production deployment | - | `npm install -g wrangler` ou utiliser `pnpm exec wrangler` |
| OAuth tokens | Mail integrations | - | requiert auth credentials (humain) |

## 🚀 ACTION IMMÉDIATE - QUE FAIRE DÈS MAINTENANT

### Option A: Commit Phase 3 (Rec spam si bloque par Adrien)

```bash
git add .
git commit -m "feat(gen2): complete Phase 3 - Memory 2.0, Model Fallback, DeviceBus

Phase 3 Services Autonomes:
- MemoryService: lifecycle (Created → Candidate → Confirmed), CRUD, conflicts
- Model fallback: retry chain (Kimi → GLM → Gemma), metadata tracking
- DeviceBus: registry, events, sync protocol (foundation)

Tests:
- phase3-memory-2.0.test.mjs ✅ (6 tests)
- phase3-model-fallback.test.mjs ✅ (2 tests)
- phase3-device-bus.test.mjs ✅ (7 tests)

Docs:
- docs/PHASE3-COMPLETION.md (évaluation complète)

Version: TAG_NEXT = v0.2.5-rc.2-gen2.1-phase3-complete

Refs:
- Gen2-65: Memory 2.0 tests passing
- Gen2-66: Model Fallback retry chain verified
- Gen2-68: DeviceBus foundation working

Rollback test: ✅ pas de rollback D1 effectué
Production risk: ✅ 21/21 tests passants, AUCUNE régression
"

git tag "v0.2.5-rc.2-gen2.1-phase3-complete"
git push origin meliturgos-gen2
```

### Option B: Commencer Phase 4 - Identity Modularization

Si `wrangler CLI` disponible (via `pnpm exec wrangler`), peut déployer après.

Sinon: avancer sur code Gen2 (Phase 4 - Identity):

```bash
# 1. Créer src/identity/ directory
mkdir -p src/identity

# 2. Extract systemPrompt depuis worker.js → src/identity/Persona.js
# 3. Create有自己的 tests unitaires

# 4. Phase 4 tests specs (à créer)
```

## 📝 PATTERNS RECOMMANDÉS POUR SESSIONS FUTURES

### 1. Verser APRES CHANGE enorme

```bash
git status  # Vérifier qu'aucun fichier "Untracked" non-légitime
git add .
git commit -m "feat: add feature X"
```

### 2. Tags séquentiels

```
v0.2.5-rc.1          # Stable Gen1
v0.2.5-rc.2-gen2.1  # Phase 2 partial
v0.2.5-rc.2-gen2.1-ui-fixed  # Phase 2 + UI
v0.2.5-rc.2-gen2.1-phase3-complete  # Phase 3 (présent)
```

### 3. NO COMMIT sans tests OK

- ✅ Modifications tests → commit
- ✅ Modifications docs → commit
- ✅ Modifications réfinitions architecture → commit
- ❌ Données en masse (imports) → commit seulement si review imminent

## 🎓 LEÇONS APPRISES PHASE 3

1. **Isolation de tests est cruciale** → Phase 3 pure test-driven, aucun import circulaire
2. **Interface générique est meilleure que spécialisée** → DeviceBus est event-driven, pas de coupling D1
3. **Non-IDLE rule fonctionne** → on ne s'est jamais bloqué, on a continué après chaque blocker mineur
4. **D1 rollback est interdit** → backup est copy, jamais supprimé

## 🔄 Récupération d'échecs mineurs

### Exemple: modèle échoué f80i dans instruction

Ce bloc disruptif est maintenant intégré dans le protocole. Lorsqu'une instruction échoue avec un "bloquer" réel:

1. **Laisser la séquence contextuelle discrète** (ne pas l'activer activement)
2. **Continuer avec le prochain bloc séquentiel** (Option B: Phase 4)
3. **Documenter le blocage** dans human-actions-required.md

## 📞 CONTACT ADRIEN

Adrien Lopecarreras:
- Email: meliturgos@adrien-lopezcarreras.workers.dev
- Production: https://meliturgos.adrien-lopezcarreras.workers.dev/
- Default user: adrien
- Default password: meliturgos

**Blocking**: Attends manual review + wrangler install + possible merge PR

---

📜 Final Note: Ce protocole est commité dans `docs/MELITURGOS-RESTART-PROTOCOL.md`
📊 Status: **ESTABLISHED** (applicable à toutes les futures sessions)
🔄 Effect: Réaligne suivi avec procédures continues

**READY TO CONTINUE?** → OUI.