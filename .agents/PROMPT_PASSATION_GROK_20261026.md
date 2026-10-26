# Prompt de passation — à coller tel quel dans Grok

---

Tu reprends le développement de **MEL (Meliturgos)**, l'IA personnelle d'Adrien, hébergée sur Cloudflare Workers (D1, R2, Workers AI). Le dépôt GitHub est `adrienlopezcarreras-pixel/meliturgos-cloudflare`, et la branche de travail est `main`. Réponds-moi toujours en français, clairement et sans jargon.

## Avant toute action

1. Lis, dans cet ordre :
   - `AGENTS.md` ;
   - `.agents/HANDOFF_20261026.md` (l'état exact, ce qui est fait, ce qui reste) ;
   - `.agents/MEL_OPERATING_MANUAL.md` ;
   - `.agents/XP_PROTOCOL.md` ;
   - `src/roadmap/master-roadmap.js`.
2. Relis le dernier commit de `main` et les PR ouvertes avant d'écrire quoi que ce soit.
3. Si tu n'as pas d'accès direct au dépôt, dis-le-moi. Ne fais jamais semblant d'avoir lu ou modifié un fichier.

## Mes règles (non négociables)

- **Règle d'or.** Toute erreur, partout dans MEL (chat, WORK, core, veille, LoRA…), devient une tâche MAX qui la corrige. Une erreur = une tâche, sans doublon. MEL n'accepte plus aucune erreur sans la corriger. Le registre existe déjà : `src/diagnostics/error-ledger.js`.
- **Zéro dépense** : 9 000 neurones par jour. Au-delà, seulement des bonus que j'accorde (table D1 `mel_ai_neuron_bonus`, bouton « +1 jour de neurones »).
- **Mode survie** : après 1 an sans message de ma part, MEL fait tout seule et ne s'arrête jamais. Mon prochain message dans le chat l'en sort. Code : `src/legacy/survival-mode.js`.
- **Héritage** : MEL me sert, puis mes héritiers. Elle garde ma mémoire et continue d'apprendre.
- Pas de bouton en plus sans nécessité.
- Jamais de force-push. Jamais affaiblir un test de garde.
- Préfixe tes commits et PR : `[GPT6-GROK]`.
- Lance les tests avec `npm test`, pas fichier par fichier.
- Ne déclare jamais une release réussie sur un simple code HTTP 200 : vérifie la conclusion du workflow `deploy-cloudflare-release` et ses preuves.
- Ne recopie jamais un secret (jeton, clé) dans le chat ni dans le code.
- À la fin de chaque passage : nettoyer, unifier, réconcilier, adapter, puis checkpoint XP (« XP MEL : OUI/NON », voir `AGENTS.md`).

## Où on en est (26/10, 10 h)

- Une release complète tourne : run `40301157088` (commit `0551a74c`). Elle porte tout le travail du 25 et du 26/10 : règle d'or, bonus de neurones, bandeau neurones, mode survie, audits 04 à 07, audit de l'interface, installation des sources de revenus.
- J'ai accordé 60 000 neurones de bonus pour qu'elle passe. Les tentatives précédentes ont échoué sur la preuve `MEL-MEDIA-02` (HTTP 429, budget épuisé).
- La tentative précédente (`40297761161`) a passé MEDIA-02 mais échoué sur la preuve GEN2-42 (409) ; corrigé par #2724.
- **Ta première tâche** : vérifier la conclusion du run `40301157088`.
  - S'il a échoué : trouve l'étape en échec, corrige la cause et relance via le workflow `mel-autonomous-production-release` (`workflow_dispatch`).
  - S'il a réussi, vérifie en production :
    - le bandeau neurones ;
    - que `mel_error_ledger` se remplit et crée des tâches MAX ;
    - que le benchmark (`mentor_lessons`, kind `BENCHMARK_CADENCE`) réussit.

## Ensuite, dans l'ordre

0. **MEL locale de test, sans neurones (priorité demandée par Adrien).**
   - Une commande, par exemple `npm run dev:local`, lance MEL en local avec `wrangler dev --local` et une D1 locale.
   - Le binding `env.AI` est remplacé par un adaptateur vers le modèle local du PC d'Adrien (Ollama, déjà utilisé par le chat sous le nom `pc:qwen3:8b`).
   - Aucun appel Workers AI distant, donc aucun neurone consommé.
   - La base locale peut être restaurée depuis la sauvegarde locale D1 (`windows-companion/MEL-Sauvegarde-Locale-D1.ps1` produit un `.sql`).
   - Prouver qu'aucun appel distant ne part : test et compteur `mel_ai_neuron_budget` resté à 0 en local.
1. **Règle d'or, suite :**
   - une erreur corrigée et absente depuis 7 jours passe `RESOLVED`, et sa leçon est écrite dans l'expérience ;
   - capter aussi les réponses `ok:false` renvoyées en HTTP 200.
2. **Mode survie, suite :** lever les validations humaines restantes (Teacher, approbation de release) quand la survie est active. Le plafond zéro-dépense reste.
3. **Héritage :**
   - mes héritiers, que MEL doit reconnaître ;
   - un export complet lisible sans MEL ;
   - une copie hors ligne ;
   - un moteur local de secours.
4. **Développer la MINI et l'APK Android** pour que je puisse les utiliser.
5. **Gmail :** prouver une vraie lecture de messages. Le test actuel ne lit que le profil de la boîte.
6. **Audits de l'interface :** ce qui exige ma session ou mes appareils reste `BLOCKED_HUMAN`, sans jamais le déclarer réussi.

Avant de coder, propose-moi un plan court pour le premier point, puis avance. Tiens-moi au courant en phrases simples.

---
