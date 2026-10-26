# Prompt de vérification — à coller dans GPT

---

Tu reprends **MEL (Meliturgos)**, l'IA personnelle d'Adrien. Le dépôt est `adrienlopezcarreras-pixel/meliturgos-cloudflare`, branche `main`. Réponds en français, simplement.

Lis d'abord, dans cet ordre :
1. `AGENTS.md` ;
2. `.agents/HANDOFF_20261026.md` ;
3. `.agents/PROMPT_PASSATION_GROK_20261026.md`.

Règles :
- Préfixe tes commits et PR : `[GPT6-GPT]`.
- Lance les tests avec `npm test`.
- Jamais de force-push, jamais affaiblir un test de garde.
- Ne déclare rien « réussi » sans preuve : conclusion du workflow, pas seulement un HTTP 200.
- Ne recopie jamais un secret.
- Termine chaque passage par « XP MEL : OUI/NON ».

## Vérifie, dans cet ordre, et dis-moi précisément ce qui marche et ce qui ne marche pas

1. **Release.**
   - Le run `40380270805` (`deploy-cloudflare-release`, commit `b2a41e13`, lancé le 26/10 à 18:43 UTC) a-t-il réussi ?
   - Si non : trouve l'étape en échec, corrige la cause et relance via `mel-autonomous-production-release` (`workflow_dispatch`).
   - Bonus de neurones : regarde ce qui reste dans la table D1 `mel_ai_neuron_bonus`. Les 60 000 accordés expirent le 2/11.
2. **Compilation des applications.** Vérifie que les builds passent et que les fichiers produits existent vraiment :
   - **APK Android** : workflow `android-release-build.yml` ; le fichier APK est-il produit et téléchargeable ?
   - **Companion Windows** : workflow `windows-release-build.yml` ; dossier `windows-companion/`.
   - **MINI** (terminal Waveshare ESP32-S3) : dossier `firmware/` et workflows associés.
   
   Pour chacun : dernier run, conclusion, artefact présent ou non. S'il échoue, corrige.
3. **MINI et APK en usage réel.** Les PR #2742 (voix de la MINI) et #2746 (conversation rapide APK/MINI) sont fusionnées.
   - Vérifie que le chat répond depuis l'APK et depuis la MINI, et que la MINI joue la voix.
   - Ce qui exige l'appareil physique d'Adrien reste `BLOCKED_HUMAN` : dis-lui exactement quoi tester.
4. **Mode MAX.**
   - MAX est-il activé : `max_autonomy` vrai, pas en pause ?
   - Des missions avancent-elles réellement dans `dev_jobs` (statuts qui changent, au moins une qui atteint la production) ?
   - La règle d'or crée-t-elle des tâches depuis `mel_error_ledger` ?
   - Si MAX est bloqué (budget, Council sans réponse, Teacher), donne la cause exacte et corrige-la.
5. **Bandeau neurones** en haut de la page : compteur, pause budget, bouton « +1 jour ». Fonctionne-t-il en production ?

Rends-moi un tableau : **élément | état prouvé | preuve | ce qui reste**. Puis corrige, dans cet ordre de priorité : release, MAX, compilations, MINI/APK.

---
