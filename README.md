# MELITURGOS

Agent personnel MEL. La documentation d'architecture détaillée est dans [docs/MELITURGOS-MASTER-SPEC.md](docs/MELITURGOS-MASTER-SPEC.md).

## Mode MAX : autonomie candidate et autorisation de production

Le mode MAX 100 % permet la préparation et l'exécution supervisée de travaux de développement sur une branche candidate. Il **n'autorise pas à lui seul la mise en production**. Le propriétaire conserve le pouvoir d'arrêter les travaux et les validations de release restent séparées.

| Champ ou contrôle | Signification | Condition de publication |
| --- | --- | --- |
| `max_mode` (interface) | Présentation UI du mode MAX | Aucune permission de publication implicite |
| `max_autonomy` (`src/evolution/autonomy-control.js`) | Autorise les cycles autonomes dans les limites de la configuration | Ne vaut pas approbation de release |
| `paused` | Arrêt propriétaire | Si vrai : MAX effectif désactivé, aucun nouveau cycle |
| `owner_override` | Dérogation candidat après Council et inspection vérifiée | Limité au développement candidat |
| `production_release_allowed` (résultat du runtime MAX) | Permission issue de l'approbation de développement | **Toujours `false`**, pas de déploiement par ce chemin |
| `launch_approved_sha` | SHA précis accepté pour la porte de lancement du runtime | Requiert correspondance avec le SHA effectivement déployé |
| `DEPLOY_APPROVED` / politique de release autonome | Approbation séparée au niveau du workflow de release | Le workflow vérifie aussi le SHA, les tests, sauvegardes et contrôles de sécurité |
| `owner_max_autorelease` | Option distincte du workflow de déploiement | Ne remplace pas les contrôles de release ni l'arrêt propriétaire |

### Chaîne de travail

1. La tâche de développement est persistée, inspectée et corrélée à un SHA candidat.
2. Council / Teacher préparent et approuvent un plan candidat.
3. Un exécuteur autorisé applique le paquet de fichiers dans une branche `candidate/*`.
4. La CI `full-candidate-ci` doit réussir sur **le SHA exact** de ce changement ; un rapport ou une CI d'un autre SHA ne vaut pas preuve.
5. Une PR de revue peut être proposée **après** un candidat effectivement modifié et vérifié. Lire le code, produire une analyse ou approuver un plan ne constitue pas un changement prêt à proposer.
6. La publication en production reste une action distincte, contrôlée par `.github/workflows/deploy-cloudflare-release.yml`. Une PR n'est jamais une permission de déployer.

### Cadences déjà configurées

- `wrangler.jsonc` : runtime d'autonomie `* * * * *` (chaque minute), maintenance horaire et audit quotidien.
- `.github/workflows/gen2-42-runtime-tick.yml` : exécution GitHub programmée à `17 * * * *` (horaire) et déclenchable manuellement.
- `.github/workflows/mel-daily-self-improvement.yml` : déclenchement quotidien `37 3 * * *` (UTC) de l'audit et du runtime.

**Un cron configuré n'est pas une preuve d'exécution utile.** Consulter les événements du `D1EvolutionLedger`, les preuves `advanced` / `work_remaining`, les jobs et les artefacts CI. Le traçage MAX de `src/evolution/autonomy-runtime.js` utilise le ledger SHA-256 existant ; il n'ajoute ni table de logs ni secret.

La validation bout-en-bout ne passe à « réussi » que lorsqu'un test utilisateur prouve : demande → tâche → code candidat → CI exacte → artefact → fonctionnalité utilisable. Suivi : issue `MAX-cycle-validation` et [tableau fonctionnel #2099](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/issues/2099).

Ne jamais transmettre de PAT, clé d'API ou secret dans des demandes de chat ; utiliser les mécanismes sécurisés des plateformes.
