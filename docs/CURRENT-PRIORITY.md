# CURRENT PRODUCT PRIORITY (SOURCE DE VÉRITÉ)

**Dernière mise à jour:** 2026-09-08

---

## CURRENT_PRODUCT_PRIORITY = PRODUCT_READY_CONVERSATION_HISTORY

MVP_AUTH_LOCAL_VALIDATION = PASSED
MVP_ROUTING_FIX = DONE

---

## CURRENT_REAL_USER_STATE:

- MVP_LOCAL_VALIDATION: Complete ✅ — validation utilisateur acceptée le 2026-09-08.
- HTTP local réel : sans auth `/` et `/mvp` = 401 ; avec auth = 200 text/html.
- Les deux réponses HTML sont identiques à celles de `src/pages/mvp-interface.js`.
- Production GET / returns INTERNAL_ERROR (known issue)
- CPU budget status: DEFACTO LIMITED (not blocking development)
- **AUCUN nouveau deploy autorisé avant validation explicite utilisateur**

**NOTE:** Run autonome Codex autorisé. Développement local uniquement, aucun déploiement ni appel IA payant.

---

## CURRENT_OBJECTIVE:

Parcours chat câblé et vérifié avec SQL en mémoire et moteur IA simulé.
Prochaine tâche précise : raccorder le chat texte de l'interface MVP
à la route serveur réelle et à son format de réponse, puis vérifier le parcours
message utilisateur → réponse MEL affichée, avec état d'attente et erreur visible.
La validation ultérieure doit utiliser un état de test isolé, sans toucher aux données D1 existantes.

Validation acquise :
```
SANS AUTH : GET / = 401 ; GET /mvp = 401
AVEC AUTH : GET / = 200 text/html ; GET /mvp = 200 text/html
HTML identique à onRequestGet de src/pages/mvp-interface.js
```

---

## CURRENT_CHAIN_TO_VERIFY:

```
Wrangler real entrypoint (wrangler.jsonc main: src/index.js)
→ Gen2 entry (src/index.js fetch)
→ router (src/router.js fetch)
→ requireAuth puis handleMvp (src/router.js)
→ src/pages/mvp-interface.js (onRequestGet)
```

---

## WHEN_LOCAL_MVP_IS_OK:

→ checkpoint Git local ciblé : routeur, interface MVP et présent fichier
→ Validation utilisateur : ACCEPTÉE
→ Continuer selon les priorités P0–P12 autorisées par Adrien.
→ **NE PAS DEPLOY ; NE PAS TOUCHER AUX DONNÉES D1**

L'authentification précède les routes MVP ; aucune ouverture publique de l'interface.
Les anciennes notes décrivant un contournement de l'authentification ne correspondent pas au code validé.

Estimation provisoire : 4 gros blocs à valider pour un MVP utilisable :
1. Chat texte de bout en bout et erreurs compréhensibles.
2. Continuité des conversations : sauvegarde et reprise.
3. Parcours visibles de l'interface : voix, fichiers, mode Professeur (fonctionnels ou explicitement indisponibles).
4. Recette produit et mise en service, après autorisation distincte.

---

## DEFERRED_UNTIL_MVP_VALIDATED:

- GEN2-51: API versioning (/api/* → /api/v1/*)
- Nouveaux connecteurs (Gmail, Outlook, GitHub, etc.)
- Module Lab avancé
- Learning Engine avancé
- Médias avancés
- Refactors architecturaux généraux
- Modifications worker.js legacy non critiques
- Phase 2-7 complètes (sauf MVP)
- Toutes les tâches du MASTER-CHECKLIST sauf P0 MVP

---

## PRIORITÉ OBSOLÈTE (SUPERSEDED):

Toutes les priorités précédemment déduites de :
- MASTER-SPEC.md
- MASTER-CHECKLIST.md
- gen2-progress.md
- gen2-resume.md
- human-actions-required.md

Sont **OBSOLÈTES** tant que CURRENT_PRODUCT_PRIORITY n'est pas marqué DONE ou supprimé.

---

## BOOT ORDER OBLIGATOIRE:

1. Lire **docs/CURRENT-PRIORITY.md** (source unique)
2. Si CURRENT_PRODUCT_PRIORITY existe :
   - CETTE PRIORITÉ ÉCRASE toutes les autres
   - Ne jamais recalculer une autre priorité
3. Lire ensuite gen2-resume et gen2-progress uniquement pour contexte
4. Ne travailler QUE sur CURRENT_OBJECTIVE
