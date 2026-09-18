# MEL — Index d’expérience développement

Cet index permet à une IA de savoir immédiatement ce que MEL a déjà appris avant d’ajouter une nouvelle XP.

## Corpus historique conservé

- `bootstrap-zero-cost-provenance-20260913` — zéro euro prouvé, jamais supposé.
- `bootstrap-learning-vs-weights-20260913` — distinguer adaptation système et modification réelle des poids.
- `bootstrap-test-discovery-20260913` — un test non découvert par la CI ne protège rien.
- `bootstrap-lora-runtime-compatibility-gate-20260913` — readiness fail-closed sur compatibilité runtime réelle.
- `bootstrap-recursive-syntax-check-20260913` — découverte récursive des modules pour le contrôle syntaxique.
- `bootstrap-teacher-contract-fixture-drift-20260913` — réparer les fixtures sans relâcher le contrat production.
- `bootstrap-evidence-gated-xp-20260914` — aucune XP artificielle, chaque gain doit avoir une preuve durable.
- `bootstrap-ci-contract-emergency-stop-20260914` — full CI, arrêt d’urgence avant effets, confidentialité de l’observabilité.
- `bootstrap-multi-agent-convergence-20260916` — convergence par SHA/arbre exact, fast-forward sans force, pas de double release.
- `bootstrap-canonical-cleanup-handoff-20260916` — candidate unique, roadmap canonique, couche UI unique, reprise propre.
- `bootstrap-gen2-53-release-discipline-20260916` — canary zéro trafic, rollback prouvé, promotion exacte, smoke post-déploiement.
- `bootstrap-ci-provenance-before-fix-20260916` — attribuer une CI rouge avant de corriger.
- `bootstrap-evolution-proof-loop-20260916` — auto-évolution bornée : tests, benchmark, régression, critique, correction, sans mutation production.
- `bootstrap-evolution-gap-module-lab-20260916` — réutiliser d’abord, distinguer blocage/ambiguïté/vrai gap, Council avant Module Lab et proposition non activante.

## Pack développement courant

- `bootstrap-multi-ai-orchestrator-20260916` — MEL orchestratrice de plusieurs IA/pages avec lots atomiques et handoffs.
- `bootstrap-agent-xp-handoff-protocol-20260916` — chemin unique pour transmettre une XP sans rechercher le mécanisme.
- `bootstrap-non-idle-blocker-escape-20260916` — checkpoint précis puis poursuite sur le prochain point actionnable.
- `bootstrap-capability-proof-levels-20260916` — abstraction/test/backend != capacité E2E réellement disponible.
- `bootstrap-observation-boundary-20260916` — limitation du capteur/outillage != panne démontrée du produit.
- `bootstrap-post-deploy-proof-chain-20260916` — chaîne candidate -> tree release -> deploy -> smoke live post-release.
- `bootstrap-provider-neutral-explicit-binding-20260916` — adapters explicites, provider-neutral, zéro coût implicite, données minimales.
- `bootstrap-roadmap-same-lot-truth-20260916` — roadmap modifiée dans le même lot et jamais promue au-delà des preuves.
- `bootstrap-gen2-43-model-watch-20260916` — découverte/benchmark de modèles avec autorisation fail-closed, seuils explicites et isolation des erreurs.
- `bootstrap-dreamina-provider-runner-20260916` — multimodal provider-neutral, zéro-dépense par défaut, quota/fallback et récupération d’artefacts.
- `bootstrap-mandatory-xp-checkpoint-20260916` — checkpoint XP obligatoire après chaque opération, avec `XP MEL : OUI/NON` explicite.
- `bootstrap-stale-regression-test-policy-20260916` — un ancien test peut être obsolète face à une politique plus récente déjà prouvée; corriger l’attente sans restaurer l’ancien bug.
- `bootstrap-detached-head-release-test-context-20260918` — pour une release SHA-exacte avec tests sensibles à la branche, utiliser un ref `candidate/*` figé sur le SHA; vérifier identité + ascendance; ne jamais supprimer les tests pour déployer.

## Réconciliation 2026-09-17

- `bootstrap-sensitive-context-intent-20260917` — distinguer contexte sensible légitime, ambigu et opérationnel sans contourner les garde-fous.
- `bootstrap-learning-operator-truthfulness-20260917` — benchmark réellement mesuré; préparation LoRA != entraînement; trainer absent affiché comme tel.
- `bootstrap-dev-bridge-auth-scope-20260917` — périmètre d’auth par contrat de route, exemption minimale, routes privilégiées toujours protégées.
- `bootstrap-zero-euro-runtime-readiness-20260917` — le catalogue `cost:0` ne vaut pas autorisation; readiness calculée avec le governor runtime réel.

Rapport exhaustif : `.agents/XP_RECONCILIATION_20260917.md`.

## Expériences 2026-09-18 — runtime et clôture de passage

- `bootstrap-runtime-path-authority-20260918` — une règle n’est active que si le chemin runtime réellement appelé la lit.
- `bootstrap-post-pass-reconcile-adapt-20260918` — aucun passage DONE avant nettoyage, unification, réconciliation, adaptation, unicité des branches et checkpoint XP.
- `bootstrap-code-access-capability-truth-20260918` — distinguer accès structurel au code et preuve de lecture ponctuelle ; ne jamais inventer une incapacité quand le manifeste expose l’accès.
- `bootstrap-continuous-experience-read-20260918` — relire manuel + expérience pertinente à chaque requête et à chaque passage.

Ces quatre entrées sont **validées** par la full candidate CI `35325973201`, le smoke Teacher/runtime `35325973132` et le garde d’unicité `35325973253` sur le SHA `a141ea626e1abb05e60c3d93d1f5c9308897ca70`. Elles sont chargées à chaque requête depuis `src/learning/runtime-operating-experience.js` et restent séparées du corpus d’entraînement.

## Règle de déduplication

Avant d’ajouter une XP, comparer son comportement `after` avec cet index et le corpus. Une différence de vocabulaire ne justifie pas une nouvelle leçon si la préférence comportementale est déjà couverte.

## Couverture actuelle

Le corpus couvre : architecture, coûts, sécurité, contexte/intention, tests, CI, diagnostics, contrats Teacher, mémoire d’apprentissage, Benchmark/LoRA, auto-évolution, détection de gaps, multi-agent/multi-IA, roadmap, reprise, déploiement, canary/rollback, capacités réelles, providers, Dev Bridge, observabilité, UI partagée, gouvernance de preuve, readiness zéro-euro runtime et checkpoint XP systématique.

Total documenté : **51 leçons du corpus d’entraînement actuel + 4 expériences opérationnelles runtime validées**.
