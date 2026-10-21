# Autonomie cloud, secours Windows — CODEX

Le Council et le développement s’exécutent normalement dans le cloud. Un
heartbeat Companion ne réserve aucun paquet et ne retarde aucun dispatch.

## Chemin conservé

Council en ligne → Teacher → paquet structuré → relais GitHub / workflow
`gen2-42-apply-ready-bridge.yml` → prise atomique du paquet exact → fichiers,
contrôle syntaxique et tests réels → commit candidat → CI complète et Council
→ promotion selon les autorisations existantes.

Les deux entrées existantes (cron du Worker et tick GitHub) utilisent le même
workflow et la même prise atomique D1. Un dispatch ou un heartbeat n’est jamais
une preuve d’exécution, de publication ou de `DONE_VERIFIED`.

Un blocage fournisseur est enregistré sur le travail non terminal, avec un
report de cinq minutes. Il reste visible, n’empêche pas les autres items et
redevient éligible après ce délai, y compris après redémarrage MAX. Aucun FAILED
ou CANCELLED historique n’est réactivé par ce mécanisme.

## Secours facultatif, désactivé par défaut

`MEL_COMPANION_FALLBACK_ALLOWED=true` est un opt-in explicite du propriétaire
dans l’environnement serveur, jamais une autorisation que le client peut
s’attribuer. Son absence ou toute autre valeur interdit le repli.

- Council : tous les modèles en ligne éligibles et les tentatives bornées
  existantes restent prioritaires. Le PC n’est consulté qu’après épuisement et
  opt-in. Son inférence exige encore prévalidation, coût zéro, appairage,
  consentement local de calcul et télémétrie fraîche. Un vote PC seul ne
  produit jamais APPROVED automatiquement : l’approbation propriétaire
  supplémentaire reste nécessaire.
- Développement : le client local doit sélectionner un `MEL_DEV_BRIDGE_JOB_ID`
  exact. Le serveur exige l’opt-in et un échec de relais cloud enregistré depuis
  moins de trente minutes, lié au même paquet et SHA approuvé. Une simple mise
  en queue ou une absence de heartbeat cloud ne suffit pas. L’authentification
  existante reste obligatoire. Cloud et PC se disputent la même prise atomique;
  un seul gagne. Aucun changement du dépôt Windows n’est effectué par ce lot.

## Limites des preuves

`tests/cloud-bridge-execution.test.mjs` exécute les vrais blocs du workflow
Linux dans un dépôt jetable : écriture, syntaxe/imports, tests et publication
sur un remote Git local. Il n’effectue aucun dispatch GitHub ni déploiement.
Les tests SQLite couvrent la concurrence, le consentement, la portée et
l’expiration des preuves, le report et la reprise sans duplication.

Les chemins existants `VERIFY_EXISTING`, Council et réconciliation des
completions restent responsables des compétences déjà satisfaites; aucun
dispatch ne peut les marquer terminé à lui seul. Une panne de DB qui empêche
aussi l’enregistrement du diagnostic reste une erreur réelle, pas un succès.

La PR doit être fusionnée, déployée par la release officielle puis vérifiée
réellement avant toute déclaration d’autonomie opérationnelle en production.
