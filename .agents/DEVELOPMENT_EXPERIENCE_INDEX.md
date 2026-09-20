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
- `bootstrap-detached-head-release-test-context-20260918` — préserver le SHA exact; si des tests dépendent du contexte de branche, utiliser un ref `candidate/*` figé, vérifier identité + ascendance, ne jamais ignorer les tests, puis nettoyer le ref temporaire.

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
- `bootstrap-lora-real-step-proof-20260918` — STEP 1 + loss + adapter persisté valident le mécanisme LoRA, sans confondre cette preuve avec la qualité finale ou l’activation.

Ces cinq entrées sont **validées** par la full candidate CI `35325973201`, le smoke Teacher/runtime `35325973132` et le garde d’unicité `35325973253` sur le SHA `a141ea626e1abb05e60c3d93d1f5c9308897ca70`. Elles sont chargées à chaque requête depuis `src/learning/runtime-operating-experience.js` et restent séparées du corpus d’entraînement.

## Expériences 2026-09-19 — matériel et protocole

- `bootstrap-hardware-device-protocol-20260919` — concevoir firmware + backend comme un contrat versionné; appairage court, jeton appareil, heartbeat, chat/voix, téléchargement/OTA, récupération locale, pilotes constructeur épinglés et vraie compilation ESP32-S3 avant preuve physique.

Cette leçon est matérialisée dans `src/learning/runtime-operating-experience.js`, le protocole dans `docs/mel-terminal-protocol-v1.md`, et la méthode réutilisable dans `.agents/skills/mel-hardware-protocol/SKILL.md`.

## Expériences 2026-09-19 — ShardVault et vérité d’état

- `shardvault-proven-active-source-of-truth-20260919` — distinguer QUALIFIÉ/STAGED/ACTIF, ne compter ACTIF qu’après preuve runtime persistée et relue, et dériver toute l’UI de la même source backend.

## Formation technique avancée — 1000 cycles IA/développement (2026-09-20)

- Corpus : `.agents/AI_ENGINEERING_1000_CYCLES.md`.
- Compteur : **AI_ENGINEERING_LEARNING_cycle_1000/1000 — COMPLETED**.
- Portée : architecture agents, tool use, MCP, RAG, mémoire, context engineering, evals, grounding, planification, multi-agent, sécurité, observabilité, Cloudflare, D1/SQLite, Queues/Workflows, API, TypeScript/Node, tests/fuzz/stress, Git/CI, supply chain, release, systèmes distribués, concurrence/idempotence, performance, auth/secrets, jobs persistants, LoRA, datasets, embeddings, multimodal, computer use, hardware, UX conversationnelle et incident response.
- Statut : **corpus de formation, pas 1000 XP validées**. Une règle n’entre dans le pack XP canonique qu’après application prouvée, testée et dédupliquée conformément à `.agents/XP_PROTOCOL.md`.
- Après ce cycle 1000, les runs MEL reviennent à l’audit/réparation/tests ; la veille ultérieure met à jour le corpus sans fabriquer de nouveaux cycles si aucun acquis nouveau n’existe.

## Formation technique avancée — Expert Track V2 (2026-09-20)

- Corpus : `.agents/AI_ENGINEERING_EXPERT_1000_CYCLES_V2.md`.
- Compteur : **AI_ENGINEERING_EXPERT_cycle_1000/1000 — COMPLETED**.
- Cumul structuré : **2000 cycles**.
- Sources récentes/primaires : OpenAI Agents SDK, MCP 2026-07-28, Cloudflare Agents/Workflows/Durable Objects/Queues/D1, OpenTelemetry, OWASP, NIST AI RMF, GitHub attestations, Sigstore, Google SRE et vérité du repo.
- Statut : corpus d’expertise, pas 1000 nouvelles XP validées. Une leçon ne devient XP canonique qu’après application prouvée selon `.agents/XP_PROTOCOL.md`.
- Audit post-track : priorité à la vérité runtime, postconditions, migration canonique de l’état, idempotence/reprise, provenance exact-SHA, cohérence conversationnelle et faux succès.

## Expert PLUS unifié — 10 000 cycles (2026-09-20)

- Corpus générable : `src/learning/expert-plus-corpus.js`.
- Couverture : **100 sous-domaines × 100 angles d'audit = 10 000 cycles**.
- Chaque cycle contient : problème précis, base de sources, principe, limitation/contre-exemple, pattern, anti-pattern, test/gate et implication MEL.
- Les cycles sont `SOURCE_GROUNDED_GUIDANCE` : ils servent à l'audit, au raisonnement et à la revue, mais ne sont jamais comptés automatiquement comme XP runtime validées.
- `LearningEngine.expertGuidance()` donne à MEL un accès ciblé et à la demande au corpus complet, sans instancier 10 000 objets au démarrage du Worker.
- Les leçons réellement prouvées sont distillées dans le pack XP canonique et donc chargées par `BOOTSTRAP_CORRECTIONS -> LearningEngine.trainingBundle()`.

### Nouvelles XP prouvées distillées

- `shardvault-representative-payload-proof-20260920` — un probe minuscule ne prouve pas la capacité à répliquer un vrai fragment.
- `shardvault-semantic-rate-limit-20260920` — parser les erreurs sémantiques de rate-limit même sous HTTP 200.
- `shardvault-independent-exact-sha-restore-gate-20260920` — reconstruction externe indépendante + SHA exact + perte de trois fragments avant readiness.
- `knowledge-routing-specificity-precedence-20260920` — la connaissance durable ne doit pas voler code.integrity ou web.research.
- `knowledge-artifact-integrity-provenance-20260920` — niveau de vérification, fichier réel et SHA-256 doivent rester cohérents.
- `shardvault-resumable-external-replication-20260920` — réplication lourde reprenable, un shard vérifié par requête.
- `provider-capacity-conservative-registry-20260920` — une capacité catalogue plus élevée exige requalification avant d'écraser la valeur live conservatrice.
- `ci-test-expectation-follows-intentional-contract-20260920` — mettre à jour un test obsolète seulement après preuve du nouveau contrat.
- `expert-corpus-runtime-distillation-20260920` — corpus expert complet à la demande, distillation prouvée seulement dans le bundle runtime.
- `audit-sensor-vs-product-proof-chain-20260920` — séparer code/tests, probe, réplication, reconstruction, stress, launch readiness et production.

## Règle de déduplication

Avant d’ajouter une XP, comparer son comportement `after` avec cet index et le corpus. Une différence de vocabulaire ne justifie pas une nouvelle leçon si la préférence comportementale est déjà couverte.

## Couverture actuelle

Le corpus couvre : architecture, coûts, sécurité, contexte/intention, tests, CI, diagnostics, contrats Teacher, mémoire d’apprentissage, Benchmark/LoRA, auto-évolution, détection de gaps, multi-agent/multi-IA, roadmap, reprise, déploiement, canary/rollback, capacités réelles, providers, Dev Bridge, observabilité, UI partagée, gouvernance de preuve, readiness zéro-euro runtime, checkpoint XP systématique et ingénierie de protocoles matériels versionnés.

Total bootstrap statique actuel : **65 leçons canoniques réparties entre historique, pack développement, réconciliation et LoRA**, auxquelles s’ajoute le corpus Expert PLUS de **10 000 cycles de guidance**.

Le nombre de leçons canoniques **n’a pas de plafond fonctionnel** : 50 reste uniquement le seuil minimal de readiness LoRA. Toute nouvelle leçon validée et dédupliquée s’ajoute au corpus complet ; les fenêtres de contexte runtime peuvent rester bornées pour la performance sans supprimer ni exclure les leçons stockées.
