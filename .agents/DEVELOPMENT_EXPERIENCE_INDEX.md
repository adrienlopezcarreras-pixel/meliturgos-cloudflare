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

## Règle de déduplication

Avant d’ajouter une XP, comparer son comportement `after` avec cet index et le corpus. Une différence de vocabulaire ne justifie pas une nouvelle leçon si la préférence comportementale est déjà couverte.

## Couverture actuelle

Le corpus couvre : architecture, coûts, sécurité, tests, CI, diagnostics, contrats Teacher, mémoire d’apprentissage, auto-évolution, détection de gaps, multi-agent/multi-IA, roadmap, reprise, déploiement, canary/rollback, capacités réelles, providers, observabilité, UI partagée et gouvernance de preuve.