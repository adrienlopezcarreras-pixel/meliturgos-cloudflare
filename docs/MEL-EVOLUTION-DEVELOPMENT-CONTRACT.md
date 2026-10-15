# MEL — Évolution & Développement (contrat cible)

Date de décision : 2026-10-15. Statut : SPECIFICATION, non déployé.

## Deux horizons séparés

1. **Roadmap initiale** — cohorte figée d'identifiants, statut de clôture, version, preuves et historique immuables. Le pourcentage historique se calcule uniquement sur cette cohorte. Un ajout ultérieur ne change jamais son dénominateur.
2. **Bac de développement évolutif** — flux permanent et dédoublonné de bugs, compétences manquantes, idées, optimisations et apprentissages. Ses mesures ne sont jamais ajoutées au pourcentage historique.
3. **Santé opérationnelle** — vue actuelle des contrôles de production et du matériel. Une régression d'une capacité historiquement validée crée un incident, affecte la santé opérationnelle et déclenche une revalidation, sans falsifier le certificat historique.

## Contrat minimal de proposition

Chaque candidat porte un identifiant stable, origine (utilisateur, télémétrie, audit, MEL), date, priorité, empreinte/déduplication, description de la limite constatée, test reproductible ou indicateur observable, impact, coût, prérequis, plan de rollback, composants visés, références à des éléments existants et niveau d'autorisation.

Avant toute création : vérifier les éléments du registre, tickets et PR existants ; lier les doublons plutôt que recréer le même chantier. Une idée sans preuve est une **PROPOSITION**, pas un incident avéré.

## États et transitions

`PROPOSED → TRIAGED → APPROVED → IN_PROGRESS → IMPLEMENTED → TESTING → DONE_VERIFIED`.

Branches conditionnelles : `DUPLICATE`, `REJECTED`, `BLOCKED_HUMAN`, `BLOCKED_EXTERNAL`, `FAILED`, `ROLLED_BACK` et `REGRESSED`.

- `IMPLEMENTED` ne signifie ni testé ni déployé.
- `DONE_VERIFIED` exige le SHA exact, CI pertinente, test fonctionnel réel au niveau revendiqué, contrôles de sécurité, preuve de production/matériel si concerné, et rollback possible.
- Un changement en production ayant régressé doit être signalé immédiatement dans **Santé opérationnelle** ; il ne retire pas rétroactivement le certificat attaché à un ancien SHA.
- Les preuves sont append-only : une correction crée une nouvelle version de constat, elle ne remplace pas une preuve ancienne.

## Boucle d'amélioration autonome

Détecter → qualifier → dédoublonner → proposer → prioriser → obtenir l'autorisation adaptée → modifier sur branche isolée → tester/stresser → PR → revue/gates → déployer selon la politique de release → vérifier réellement → clôturer avec preuves → observer les régressions.

MEL peut poursuivre les investigations et préparer du code en autonomie selon ses permissions. Les actions sensibles, les nouveaux accès, les coûts payants et les opérations irréversibles restent soumis aux politiques d'autorisation en vigueur. Les limites de fournisseur payant doivent d'abord conduire à examiner des alternatives gratuites/locales et leur coût opérationnel réel, sans contournement d'accès.

## Concurrence et intégration

- Réutiliser `src/roadmap/master-roadmap.js` comme registre historique, `src/roadmap/completion-matrix.js` pour la cohorte initiale et `src/roadmap/non-idle-policy.js` pour la sélection ; ne pas dupliquer silencieusement leurs responsabilités.
- Ajouter un registre *évolutif* distinct, durable, avec API et vue « Évolution & Développement », au terme d'une migration versionnée.
- Éviter toute mutation directe de `main` par le moteur autonome ; coordination avec les chantiers concurrents, branche isolée et validation du SHA exact avant fusion.
- Ne pas confondre absence de travail exécutable, blocage externe et exécution réelle. Un tick `SUCCESS` sans travail utile ne prouve aucun développement.

## Critères d'acceptation de l'implémentation

1. La cohorte initiale est figée et son pourcentage ne change pas lors de l'ajout de dix nouveautés.
2. Une régression d'une fonction initialement certifiée apparaît comme incident de santé sans altérer la preuve ancienne.
3. Deux détections équivalentes se dédoublonnent.
4. Aucun `DONE_VERIFIED` sans preuve liée au SHA et au bon environnement.
5. Aucun déploiement ou action sensible ne contourne les gates et permissions.
6. Après redémarrage, les propositions, preuves, échecs, leases et reprises restent cohérents.
7. Le panneau distingue visuellement archive, développement actif, travaux à vérifier et santé courante.
8. Des tests de non-régression et de charge couvrent les transitions concurrentes et les boucles de tentative.

Ce document formalise la cible ; **il ne déclare pas les fonctionnalités ci-dessus implémentées ni testées**.
