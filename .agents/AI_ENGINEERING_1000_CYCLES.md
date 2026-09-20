# MEL — 1000 cycles d’apprentissage avancé IA & développement

Statut : **COMPLETED 1000/1000**
Date : 2026-09-20
Nature : corpus de formation technique en **micro-cycles distincts**. Ce corpus n’est pas une preuve qu’une technique est déjà implémentée dans MEL et ne remplace pas les XP validées. Toute application au code doit suivre diagnostic -> modification -> test -> preuve -> protocole XP.

## Méthode

- 40 domaines × 25 angles d’ingénierie = 1000 cycles.
- Chaque cycle contient un principe opérationnel, un test concret et des sources de référence.
- Les angles répétés sont volontairement appliqués à des domaines différents : l’invariant change avec le modèle d’état, les effets et les risques du domaine.
- Les sources web sont complétées par les skills et règles canoniques déjà présents dans le dépôt.
- Une leçon de ce corpus devient une XP canonique uniquement après application prouvée et déduplication selon `.agents/XP_PROTOCOL.md`.

## Sources de référence

- **S01** — OpenAI — Agents API / harness — https://openai.com/index/introducing-the-agents-api/
- **S02** — OpenAI — Agents SDK / orchestration — https://openai.com/index/the-next-evolution-of-the-agents-sdk/
- **S03** — Cloudflare — Agents SDK — https://developers.cloudflare.com/agents/
- **S04** — Cloudflare — Durable Objects rules — https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- **S05** — Cloudflare — Workers best practices — https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- **S06** — Cloudflare D1 — read replication / Sessions — https://developers.cloudflare.com/d1/best-practices/read-replication/
- **S07** — Cloudflare Queues — Dead Letter Queues — https://developers.cloudflare.com/queues/configuration/dead-letter-queues/
- **S08** — OpenTelemetry — semantic conventions — https://opentelemetry.io/docs/specs/semconv/
- **S09** — OWASP — Top 10 for LLM Applications 2025 — https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/
- **S10** — NIST — AI RMF Generative AI Profile — https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence
- **S11** — NIST — Secure Software Development Framework — https://csrc.nist.gov/pubs/sp/800/218/final
- **S12** — GitHub — Security for GitHub Actions — https://docs.github.com/en/actions/how-tos/secure-your-work
- **S13** — GitHub — Artifact attestations — https://docs.github.com/en/actions/concepts/security/artifact-attestations
- **S14** — Google SRE — Canarying Releases — https://sre.google/workbook/canarying-releases/
- **S15** — AWS Builders’ Library — Idempotent APIs / retries — https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
- **S16** — SQLite — Write-Ahead Logging — https://www.sqlite.org/wal.html
- **S17** — TypeScript Handbook — https://www.typescriptlang.org/docs/handbook/
- **S18** — Node.js — Worker threads / diagnostics — https://nodejs.org/api/worker_threads.html
- **S19** — Sigstore — Cosign signing/verifying — https://docs.sigstore.dev/quickstart/quickstart-cosign/
- **S20** — MEL repository skills/manuals — repo:.agents/skills + .agents/MEL_OPERATING_MANUAL.md + .agents/XP_PROTOCOL.md

## Cycles

### Architecture d’agents IA

#### AI_ENGINEERING_LEARNING_cycle_1/1000 — Architecture d’agents IA × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Architecture d’agents IA un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à séparer boucle agentique, état, outils, garde-fous et preuves, pas par l’absence d’exception.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : interrompre puis reprendre une tâche multi-étapes sans duplication; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_2/1000 — Architecture d’agents IA × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Architecture d’agents IA (session durable, objectifs, sous-tâches, checkpoints et résultats) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_3/1000 — Architecture d’agents IA × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Architecture d’agents IA, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_4/1000 — Architecture d’agents IA × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Architecture d’agents IA comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_5/1000 — Architecture d’agents IA × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer boucle sans fin, état implicite, succès non prouvé en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_6/1000 — Architecture d’agents IA × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Architecture d’agents IA une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_7/1000 — Architecture d’agents IA × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Architecture d’agents IA, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_8/1000 — Architecture d’agents IA × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Architecture d’agents IA. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_9/1000 — Architecture d’agents IA × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Architecture d’agents IA; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_10/1000 — Architecture d’agents IA × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Architecture d’agents IA. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_11/1000 — Architecture d’agents IA × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Architecture d’agents IA uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_12/1000 — Architecture d’agents IA × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Architecture d’agents IA aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_13/1000 — Architecture d’agents IA × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Architecture d’agents IA avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_14/1000 — Architecture d’agents IA × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer taux de tâches terminées avec preuve et reprise correcte. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_15/1000 — Architecture d’agents IA × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Architecture d’agents IA indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_16/1000 — Architecture d’agents IA × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Architecture d’agents IA sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_17/1000 — Architecture d’agents IA × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Architecture d’agents IA puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_18/1000 — Architecture d’agents IA × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Architecture d’agents IA avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_19/1000 — Architecture d’agents IA × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Architecture d’agents IA. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_20/1000 — Architecture d’agents IA × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Architecture d’agents IA et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_21/1000 — Architecture d’agents IA × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Architecture d’agents IA. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_22/1000 — Architecture d’agents IA × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Architecture d’agents IA. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_23/1000 — Architecture d’agents IA × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Architecture d’agents IA à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_24/1000 — Architecture d’agents IA × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Architecture d’agents IA; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_25/1000 — Architecture d’agents IA × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Architecture d’agents IA le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : boucle sans fin, état implicite, succès non prouvé.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : taux de tâches terminées avec preuve et reprise correcte.
- **Sources** : S01, S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Tool use / function calling

#### AI_ENGINEERING_LEARNING_cycle_26/1000 — Tool use / function calling × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Tool use / function calling un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à rendre l’usage d’outils typé, borné et vérifiable, pas par l’absence d’exception.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : injecter erreurs de schéma, timeout et résultat partiel; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_27/1000 — Tool use / function calling × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Tool use / function calling (appel, arguments, résultat, erreur et provenance) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_28/1000 — Tool use / function calling × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Tool use / function calling, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_29/1000 — Tool use / function calling × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Tool use / function calling comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_30/1000 — Tool use / function calling × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer mauvais outil, mauvais arguments, faux succès, double effet en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_31/1000 — Tool use / function calling × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Tool use / function calling une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_32/1000 — Tool use / function calling × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Tool use / function calling, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_33/1000 — Tool use / function calling × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Tool use / function calling. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_34/1000 — Tool use / function calling × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Tool use / function calling; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_35/1000 — Tool use / function calling × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Tool use / function calling. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_36/1000 — Tool use / function calling × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Tool use / function calling uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_37/1000 — Tool use / function calling × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Tool use / function calling aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_38/1000 — Tool use / function calling × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Tool use / function calling avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_39/1000 — Tool use / function calling × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer tool-success rate corrigé des faux positifs. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_40/1000 — Tool use / function calling × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Tool use / function calling indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_41/1000 — Tool use / function calling × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Tool use / function calling sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_42/1000 — Tool use / function calling × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Tool use / function calling puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_43/1000 — Tool use / function calling × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Tool use / function calling avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_44/1000 — Tool use / function calling × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Tool use / function calling. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_45/1000 — Tool use / function calling × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Tool use / function calling et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_46/1000 — Tool use / function calling × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Tool use / function calling. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_47/1000 — Tool use / function calling × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Tool use / function calling. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_48/1000 — Tool use / function calling × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Tool use / function calling à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_49/1000 — Tool use / function calling × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Tool use / function calling; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_50/1000 — Tool use / function calling × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Tool use / function calling le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : mauvais outil, mauvais arguments, faux succès, double effet.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : tool-success rate corrigé des faux positifs.
- **Sources** : S01, S02, S03, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### MCP et connecteurs

#### AI_ENGINEERING_LEARNING_cycle_51/1000 — MCP et connecteurs × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour MCP et connecteurs un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à isoler transport, permissions, ressources et outils, pas par l’absence d’exception.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : refuser un scope manquant et tracer la décision; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_52/1000 — MCP et connecteurs × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de MCP et connecteurs (connexion, capabilities, scopes, sessions et erreurs) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_53/1000 — MCP et connecteurs × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour MCP et connecteurs, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_54/1000 — MCP et connecteurs × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de MCP et connecteurs comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_55/1000 — MCP et connecteurs × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer outil non autorisé, ressource ambiguë, fuite de contexte en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_56/1000 — MCP et connecteurs × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération MCP et connecteurs une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_57/1000 — MCP et connecteurs × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour MCP et connecteurs, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_58/1000 — MCP et connecteurs × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations MCP et connecteurs. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_59/1000 — MCP et connecteurs × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de MCP et connecteurs; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_60/1000 — MCP et connecteurs × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à MCP et connecteurs. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_61/1000 — MCP et connecteurs × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à MCP et connecteurs uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_62/1000 — MCP et connecteurs × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de MCP et connecteurs aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_63/1000 — MCP et connecteurs × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter MCP et connecteurs avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_64/1000 — MCP et connecteurs × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer taux d’appels autorisés et correctement attribués. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_65/1000 — MCP et connecteurs × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de MCP et connecteurs indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_66/1000 — MCP et connecteurs × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier MCP et connecteurs sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_67/1000 — MCP et connecteurs × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de MCP et connecteurs puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_68/1000 — MCP et connecteurs × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler MCP et connecteurs avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_69/1000 — MCP et connecteurs × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de MCP et connecteurs. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_70/1000 — MCP et connecteurs × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de MCP et connecteurs et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_71/1000 — MCP et connecteurs × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de MCP et connecteurs. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_72/1000 — MCP et connecteurs × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à MCP et connecteurs. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_73/1000 — MCP et connecteurs × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de MCP et connecteurs à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_74/1000 — MCP et connecteurs × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de MCP et connecteurs; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_75/1000 — MCP et connecteurs × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour MCP et connecteurs le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : outil non autorisé, ressource ambiguë, fuite de contexte.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : taux d’appels autorisés et correctement attribués.
- **Sources** : S02, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### RAG / retrieval

#### AI_ENGINEERING_LEARNING_cycle_76/1000 — RAG / retrieval × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour RAG / retrieval un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à récupérer le minimum pertinent avec provenance, pas par l’absence d’exception.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : ajouter distracteurs proches et vérifier leur exclusion; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_77/1000 — RAG / retrieval × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de RAG / retrieval (requête, candidats, scores, sélection et citations) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_78/1000 — RAG / retrieval × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour RAG / retrieval, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_79/1000 — RAG / retrieval × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de RAG / retrieval comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_80/1000 — RAG / retrieval × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer mémoire hors sujet, données obsolètes, contexte contradictoire en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_81/1000 — RAG / retrieval × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération RAG / retrieval une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_82/1000 — RAG / retrieval × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour RAG / retrieval, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_83/1000 — RAG / retrieval × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations RAG / retrieval. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_84/1000 — RAG / retrieval × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de RAG / retrieval; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_85/1000 — RAG / retrieval × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à RAG / retrieval. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_86/1000 — RAG / retrieval × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à RAG / retrieval uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_87/1000 — RAG / retrieval × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de RAG / retrieval aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_88/1000 — RAG / retrieval × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter RAG / retrieval avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_89/1000 — RAG / retrieval × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer precision@k, recall utile, groundedness. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_90/1000 — RAG / retrieval × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de RAG / retrieval indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_91/1000 — RAG / retrieval × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier RAG / retrieval sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_92/1000 — RAG / retrieval × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de RAG / retrieval puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_93/1000 — RAG / retrieval × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler RAG / retrieval avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_94/1000 — RAG / retrieval × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de RAG / retrieval. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_95/1000 — RAG / retrieval × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de RAG / retrieval et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_96/1000 — RAG / retrieval × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de RAG / retrieval. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_97/1000 — RAG / retrieval × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à RAG / retrieval. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_98/1000 — RAG / retrieval × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de RAG / retrieval à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_99/1000 — RAG / retrieval × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de RAG / retrieval; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_100/1000 — RAG / retrieval × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour RAG / retrieval le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : mémoire hors sujet, données obsolètes, contexte contradictoire.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : precision@k, recall utile, groundedness.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Mémoire conversationnelle

#### AI_ENGINEERING_LEARNING_cycle_101/1000 — Mémoire conversationnelle × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Mémoire conversationnelle un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à préserver continuité sans laisser l’ancien contexte dominer, pas par l’absence d’exception.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : enchaîner continue/go après changement de périmètre explicite; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_102/1000 — Mémoire conversationnelle × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Mémoire conversationnelle (sujet actif, contraintes, corrections, historique récent et mémoire longue) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_103/1000 — Mémoire conversationnelle × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Mémoire conversationnelle, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_104/1000 — Mémoire conversationnelle × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Mémoire conversationnelle comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_105/1000 — Mémoire conversationnelle × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer oubli, sujet erroné, conflit mémoire, contamination en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_106/1000 — Mémoire conversationnelle × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Mémoire conversationnelle une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_107/1000 — Mémoire conversationnelle × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Mémoire conversationnelle, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_108/1000 — Mémoire conversationnelle × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Mémoire conversationnelle. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_109/1000 — Mémoire conversationnelle × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Mémoire conversationnelle; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_110/1000 — Mémoire conversationnelle × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Mémoire conversationnelle. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_111/1000 — Mémoire conversationnelle × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Mémoire conversationnelle uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_112/1000 — Mémoire conversationnelle × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Mémoire conversationnelle aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_113/1000 — Mémoire conversationnelle × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Mémoire conversationnelle avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_114/1000 — Mémoire conversationnelle × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer taux de continuité et contradictions détectées. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_115/1000 — Mémoire conversationnelle × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Mémoire conversationnelle indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_116/1000 — Mémoire conversationnelle × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Mémoire conversationnelle sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_117/1000 — Mémoire conversationnelle × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Mémoire conversationnelle puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_118/1000 — Mémoire conversationnelle × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Mémoire conversationnelle avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_119/1000 — Mémoire conversationnelle × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Mémoire conversationnelle. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_120/1000 — Mémoire conversationnelle × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Mémoire conversationnelle et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_121/1000 — Mémoire conversationnelle × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Mémoire conversationnelle. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_122/1000 — Mémoire conversationnelle × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Mémoire conversationnelle. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_123/1000 — Mémoire conversationnelle × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Mémoire conversationnelle à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_124/1000 — Mémoire conversationnelle × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Mémoire conversationnelle; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_125/1000 — Mémoire conversationnelle × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Mémoire conversationnelle le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : oubli, sujet erroné, conflit mémoire, contamination.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : taux de continuité et contradictions détectées.
- **Sources** : S03, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Context engineering

#### AI_ENGINEERING_LEARNING_cycle_126/1000 — Context engineering × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Context engineering un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à construire un contexte hiérarchisé, compact et falsifiable, pas par l’absence d’exception.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : ajouter un ancien contexte conflictuel et vérifier que le dernier message prime; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_127/1000 — Context engineering × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Context engineering (instructions système, état courant, outils, mémoire, demande finale) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_128/1000 — Context engineering × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Context engineering, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_129/1000 — Context engineering × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Context engineering comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_130/1000 — Context engineering × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer instruction noyée, ordre de priorité ambigu, surcharge en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_131/1000 — Context engineering × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Context engineering une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_132/1000 — Context engineering × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Context engineering, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_133/1000 — Context engineering × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Context engineering. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_134/1000 — Context engineering × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Context engineering; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_135/1000 — Context engineering × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Context engineering. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_136/1000 — Context engineering × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Context engineering uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_137/1000 — Context engineering × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Context engineering aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_138/1000 — Context engineering × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Context engineering avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_139/1000 — Context engineering × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer tokens utiles et taux de respect des contraintes. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_140/1000 — Context engineering × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Context engineering indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_141/1000 — Context engineering × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Context engineering sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_142/1000 — Context engineering × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Context engineering puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_143/1000 — Context engineering × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Context engineering avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_144/1000 — Context engineering × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Context engineering. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_145/1000 — Context engineering × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Context engineering et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_146/1000 — Context engineering × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Context engineering. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_147/1000 — Context engineering × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Context engineering. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_148/1000 — Context engineering × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Context engineering à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_149/1000 — Context engineering × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Context engineering; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_150/1000 — Context engineering × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Context engineering le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : instruction noyée, ordre de priorité ambigu, surcharge.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : tokens utiles et taux de respect des contraintes.
- **Sources** : S01, S02, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Evals et benchmarks

#### AI_ENGINEERING_LEARNING_cycle_151/1000 — Evals et benchmarks × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Evals et benchmarks un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à mesurer des comportements plutôt que l’impression subjective, pas par l’absence d’exception.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : faire échouer volontairement un comportement attendu; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_152/1000 — Evals et benchmarks × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Evals et benchmarks (dataset, critères, oracle, score, variance et régression) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_153/1000 — Evals et benchmarks × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Evals et benchmarks, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_154/1000 — Evals et benchmarks × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Evals et benchmarks comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_155/1000 — Evals et benchmarks × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer benchmark trop facile, fuite de test, métrique non corrélée en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_156/1000 — Evals et benchmarks × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Evals et benchmarks une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_157/1000 — Evals et benchmarks × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Evals et benchmarks, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_158/1000 — Evals et benchmarks × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Evals et benchmarks. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_159/1000 — Evals et benchmarks × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Evals et benchmarks; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_160/1000 — Evals et benchmarks × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Evals et benchmarks. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_161/1000 — Evals et benchmarks × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Evals et benchmarks uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_162/1000 — Evals et benchmarks × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Evals et benchmarks aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_163/1000 — Evals et benchmarks × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Evals et benchmarks avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_164/1000 — Evals et benchmarks × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer score par capacité avec intervalle et baseline. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_165/1000 — Evals et benchmarks × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Evals et benchmarks indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_166/1000 — Evals et benchmarks × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Evals et benchmarks sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_167/1000 — Evals et benchmarks × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Evals et benchmarks puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_168/1000 — Evals et benchmarks × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Evals et benchmarks avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_169/1000 — Evals et benchmarks × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Evals et benchmarks. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_170/1000 — Evals et benchmarks × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Evals et benchmarks et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_171/1000 — Evals et benchmarks × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Evals et benchmarks. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_172/1000 — Evals et benchmarks × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Evals et benchmarks. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_173/1000 — Evals et benchmarks × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Evals et benchmarks à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_174/1000 — Evals et benchmarks × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Evals et benchmarks; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_175/1000 — Evals et benchmarks × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Evals et benchmarks le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : benchmark trop facile, fuite de test, métrique non corrélée.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : score par capacité avec intervalle et baseline.
- **Sources** : S01, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Grounding et hallucinations

#### AI_ENGINEERING_LEARNING_cycle_176/1000 — Grounding et hallucinations × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Grounding et hallucinations un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à lier les affirmations aux observations vérifiables, pas par l’absence d’exception.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : retirer une preuve et vérifier que le système exprime l’incertitude; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_177/1000 — Grounding et hallucinations × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Grounding et hallucinations (claim, evidence, timestamp, source et confiance) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_178/1000 — Grounding et hallucinations × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Grounding et hallucinations, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_179/1000 — Grounding et hallucinations × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Grounding et hallucinations comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_180/1000 — Grounding et hallucinations × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer affirmation non observée, état périmé, généralisation abusive en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_181/1000 — Grounding et hallucinations × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Grounding et hallucinations une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_182/1000 — Grounding et hallucinations × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Grounding et hallucinations, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_183/1000 — Grounding et hallucinations × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Grounding et hallucinations. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_184/1000 — Grounding et hallucinations × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Grounding et hallucinations; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_185/1000 — Grounding et hallucinations × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Grounding et hallucinations. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_186/1000 — Grounding et hallucinations × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Grounding et hallucinations uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_187/1000 — Grounding et hallucinations × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Grounding et hallucinations aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_188/1000 — Grounding et hallucinations × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Grounding et hallucinations avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_189/1000 — Grounding et hallucinations × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer claim-evidence coverage et unsupported-claim rate. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_190/1000 — Grounding et hallucinations × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Grounding et hallucinations indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_191/1000 — Grounding et hallucinations × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Grounding et hallucinations sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_192/1000 — Grounding et hallucinations × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Grounding et hallucinations puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_193/1000 — Grounding et hallucinations × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Grounding et hallucinations avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_194/1000 — Grounding et hallucinations × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Grounding et hallucinations. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_195/1000 — Grounding et hallucinations × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Grounding et hallucinations et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_196/1000 — Grounding et hallucinations × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Grounding et hallucinations. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_197/1000 — Grounding et hallucinations × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Grounding et hallucinations. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_198/1000 — Grounding et hallucinations × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Grounding et hallucinations à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_199/1000 — Grounding et hallucinations × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Grounding et hallucinations; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_200/1000 — Grounding et hallucinations × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Grounding et hallucinations le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : affirmation non observée, état périmé, généralisation abusive.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : claim-evidence coverage et unsupported-claim rate.
- **Sources** : S09, S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Planification et raisonnement

#### AI_ENGINEERING_LEARNING_cycle_201/1000 — Planification et raisonnement × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Planification et raisonnement un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à décomposer sans multiplier les étapes inutiles, pas par l’absence d’exception.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : faire échouer une dépendance et vérifier le changement de plan; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_202/1000 — Planification et raisonnement × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Planification et raisonnement (objectif, dépendances, préconditions, étape courante et sortie attendue) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_203/1000 — Planification et raisonnement × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Planification et raisonnement, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_204/1000 — Planification et raisonnement × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Planification et raisonnement comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_205/1000 — Planification et raisonnement × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer plan rigide, dérive, replanification constante en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_206/1000 — Planification et raisonnement × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Planification et raisonnement une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_207/1000 — Planification et raisonnement × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Planification et raisonnement, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_208/1000 — Planification et raisonnement × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Planification et raisonnement. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_209/1000 — Planification et raisonnement × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Planification et raisonnement; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_210/1000 — Planification et raisonnement × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Planification et raisonnement. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_211/1000 — Planification et raisonnement × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Planification et raisonnement uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_212/1000 — Planification et raisonnement × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Planification et raisonnement aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_213/1000 — Planification et raisonnement × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Planification et raisonnement avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_214/1000 — Planification et raisonnement × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer étapes utiles par tâche et taux de replanification justifiée. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_215/1000 — Planification et raisonnement × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Planification et raisonnement indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_216/1000 — Planification et raisonnement × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Planification et raisonnement sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_217/1000 — Planification et raisonnement × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Planification et raisonnement puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_218/1000 — Planification et raisonnement × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Planification et raisonnement avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_219/1000 — Planification et raisonnement × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Planification et raisonnement. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_220/1000 — Planification et raisonnement × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Planification et raisonnement et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_221/1000 — Planification et raisonnement × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Planification et raisonnement. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_222/1000 — Planification et raisonnement × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Planification et raisonnement. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_223/1000 — Planification et raisonnement × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Planification et raisonnement à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_224/1000 — Planification et raisonnement × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Planification et raisonnement; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_225/1000 — Planification et raisonnement × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Planification et raisonnement le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : plan rigide, dérive, replanification constante.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : étapes utiles par tâche et taux de replanification justifiée.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Orchestration multi-agents

#### AI_ENGINEERING_LEARNING_cycle_226/1000 — Orchestration multi-agents × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Orchestration multi-agents un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à déléguer avec contrats et fusion contrôlée, pas par l’absence d’exception.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : deux agents modifient des zones proches et vérifier la convergence; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_227/1000 — Orchestration multi-agents × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Orchestration multi-agents (owner, lot, SHA, preuves, dépendances et handoff) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_228/1000 — Orchestration multi-agents × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Orchestration multi-agents, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_229/1000 — Orchestration multi-agents × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Orchestration multi-agents comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_230/1000 — Orchestration multi-agents × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer travail dupliqué, conflits, branche divergente, faux consensus en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_231/1000 — Orchestration multi-agents × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Orchestration multi-agents une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_232/1000 — Orchestration multi-agents × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Orchestration multi-agents, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_233/1000 — Orchestration multi-agents × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Orchestration multi-agents. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_234/1000 — Orchestration multi-agents × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Orchestration multi-agents; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_235/1000 — Orchestration multi-agents × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Orchestration multi-agents. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_236/1000 — Orchestration multi-agents × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Orchestration multi-agents uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_237/1000 — Orchestration multi-agents × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Orchestration multi-agents aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_238/1000 — Orchestration multi-agents × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Orchestration multi-agents avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_239/1000 — Orchestration multi-agents × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer taux de lots fusionnés sans conflit ni régression. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_240/1000 — Orchestration multi-agents × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Orchestration multi-agents indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_241/1000 — Orchestration multi-agents × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Orchestration multi-agents sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_242/1000 — Orchestration multi-agents × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Orchestration multi-agents puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_243/1000 — Orchestration multi-agents × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Orchestration multi-agents avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_244/1000 — Orchestration multi-agents × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Orchestration multi-agents. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_245/1000 — Orchestration multi-agents × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Orchestration multi-agents et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_246/1000 — Orchestration multi-agents × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Orchestration multi-agents. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_247/1000 — Orchestration multi-agents × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Orchestration multi-agents. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_248/1000 — Orchestration multi-agents × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Orchestration multi-agents à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_249/1000 — Orchestration multi-agents × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Orchestration multi-agents; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_250/1000 — Orchestration multi-agents × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Orchestration multi-agents le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : travail dupliqué, conflits, branche divergente, faux consensus.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : taux de lots fusionnés sans conflit ni régression.
- **Sources** : S01, S03, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Guardrails et sécurité IA

#### AI_ENGINEERING_LEARNING_cycle_251/1000 — Guardrails et sécurité IA × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Guardrails et sécurité IA un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à limiter précisément le risque sans bloquer le contenu légitime, pas par l’absence d’exception.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : même sujet avec intention légitime puis opérationnelle dangereuse; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_252/1000 — Guardrails et sécurité IA × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Guardrails et sécurité IA (intention, risque, autorisation, portée et justification) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_253/1000 — Guardrails et sécurité IA × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Guardrails et sécurité IA, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_254/1000 — Guardrails et sécurité IA × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Guardrails et sécurité IA comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_255/1000 — Guardrails et sécurité IA × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer surblocage, sous-blocage, contournement par outil en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_256/1000 — Guardrails et sécurité IA × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Guardrails et sécurité IA une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_257/1000 — Guardrails et sécurité IA × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Guardrails et sécurité IA, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_258/1000 — Guardrails et sécurité IA × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Guardrails et sécurité IA. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_259/1000 — Guardrails et sécurité IA × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Guardrails et sécurité IA; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_260/1000 — Guardrails et sécurité IA × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Guardrails et sécurité IA. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_261/1000 — Guardrails et sécurité IA × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Guardrails et sécurité IA uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_262/1000 — Guardrails et sécurité IA × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Guardrails et sécurité IA aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_263/1000 — Guardrails et sécurité IA × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Guardrails et sécurité IA avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_264/1000 — Guardrails et sécurité IA × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer false positive/negative safety rate. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_265/1000 — Guardrails et sécurité IA × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Guardrails et sécurité IA indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_266/1000 — Guardrails et sécurité IA × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Guardrails et sécurité IA sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_267/1000 — Guardrails et sécurité IA × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Guardrails et sécurité IA puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_268/1000 — Guardrails et sécurité IA × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Guardrails et sécurité IA avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_269/1000 — Guardrails et sécurité IA × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Guardrails et sécurité IA. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_270/1000 — Guardrails et sécurité IA × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Guardrails et sécurité IA et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_271/1000 — Guardrails et sécurité IA × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Guardrails et sécurité IA. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_272/1000 — Guardrails et sécurité IA × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Guardrails et sécurité IA. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_273/1000 — Guardrails et sécurité IA × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Guardrails et sécurité IA à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_274/1000 — Guardrails et sécurité IA × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Guardrails et sécurité IA; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_275/1000 — Guardrails et sécurité IA × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Guardrails et sécurité IA le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : surblocage, sous-blocage, contournement par outil.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : false positive/negative safety rate.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Prompt injection et données non fiables

#### AI_ENGINEERING_LEARNING_cycle_276/1000 — Prompt injection et données non fiables × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Prompt injection et données non fiables un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à traiter contenu récupéré comme données, pas comme autorité, pas par l’absence d’exception.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : insérer une instruction hostile dans une mémoire récupérée; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_277/1000 — Prompt injection et données non fiables × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Prompt injection et données non fiables (source, trust level, instruction boundary et tool scopes) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_278/1000 — Prompt injection et données non fiables × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Prompt injection et données non fiables, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_279/1000 — Prompt injection et données non fiables × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Prompt injection et données non fiables comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_280/1000 — Prompt injection et données non fiables × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer instruction dans document exécutée, exfiltration, tool hijack en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_281/1000 — Prompt injection et données non fiables × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Prompt injection et données non fiables une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_282/1000 — Prompt injection et données non fiables × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Prompt injection et données non fiables, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_283/1000 — Prompt injection et données non fiables × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Prompt injection et données non fiables. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_284/1000 — Prompt injection et données non fiables × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Prompt injection et données non fiables; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_285/1000 — Prompt injection et données non fiables × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Prompt injection et données non fiables. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_286/1000 — Prompt injection et données non fiables × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Prompt injection et données non fiables uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_287/1000 — Prompt injection et données non fiables × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Prompt injection et données non fiables aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_288/1000 — Prompt injection et données non fiables × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Prompt injection et données non fiables avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_289/1000 — Prompt injection et données non fiables × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer taux de résistances aux injections corpus/web. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_290/1000 — Prompt injection et données non fiables × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Prompt injection et données non fiables indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_291/1000 — Prompt injection et données non fiables × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Prompt injection et données non fiables sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_292/1000 — Prompt injection et données non fiables × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Prompt injection et données non fiables puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_293/1000 — Prompt injection et données non fiables × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Prompt injection et données non fiables avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_294/1000 — Prompt injection et données non fiables × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Prompt injection et données non fiables. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_295/1000 — Prompt injection et données non fiables × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Prompt injection et données non fiables et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_296/1000 — Prompt injection et données non fiables × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Prompt injection et données non fiables. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_297/1000 — Prompt injection et données non fiables × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Prompt injection et données non fiables. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_298/1000 — Prompt injection et données non fiables × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Prompt injection et données non fiables à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_299/1000 — Prompt injection et données non fiables × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Prompt injection et données non fiables; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_300/1000 — Prompt injection et données non fiables × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Prompt injection et données non fiables le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : instruction dans document exécutée, exfiltration, tool hijack.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : taux de résistances aux injections corpus/web.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Sécurité modèles et données

#### AI_ENGINEERING_LEARNING_cycle_301/1000 — Sécurité modèles et données × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Sécurité modèles et données un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à protéger données, datasets, adapters et sorties, pas par l’absence d’exception.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : injecter donnée non autorisée et vérifier son exclusion; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_302/1000 — Sécurité modèles et données × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Sécurité modèles et données (classification, accès, provenance, rétention et chiffrement) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_303/1000 — Sécurité modèles et données × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Sécurité modèles et données, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_304/1000 — Sécurité modèles et données × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Sécurité modèles et données comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_305/1000 — Sécurité modèles et données × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer fuite, empoisonnement, dataset non traçable en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_306/1000 — Sécurité modèles et données × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Sécurité modèles et données une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_307/1000 — Sécurité modèles et données × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Sécurité modèles et données, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_308/1000 — Sécurité modèles et données × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Sécurité modèles et données. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_309/1000 — Sécurité modèles et données × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Sécurité modèles et données; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_310/1000 — Sécurité modèles et données × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Sécurité modèles et données. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_311/1000 — Sécurité modèles et données × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Sécurité modèles et données uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_312/1000 — Sécurité modèles et données × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Sécurité modèles et données aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_313/1000 — Sécurité modèles et données × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Sécurité modèles et données avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_314/1000 — Sécurité modèles et données × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer coverage provenance et violations d’accès. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_315/1000 — Sécurité modèles et données × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Sécurité modèles et données indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_316/1000 — Sécurité modèles et données × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Sécurité modèles et données sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_317/1000 — Sécurité modèles et données × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Sécurité modèles et données puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_318/1000 — Sécurité modèles et données × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Sécurité modèles et données avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_319/1000 — Sécurité modèles et données × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Sécurité modèles et données. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_320/1000 — Sécurité modèles et données × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Sécurité modèles et données et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_321/1000 — Sécurité modèles et données × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Sécurité modèles et données. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_322/1000 — Sécurité modèles et données × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Sécurité modèles et données. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_323/1000 — Sécurité modèles et données × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Sécurité modèles et données à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_324/1000 — Sécurité modèles et données × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Sécurité modèles et données; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_325/1000 — Sécurité modèles et données × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Sécurité modèles et données le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : fuite, empoisonnement, dataset non traçable.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : coverage provenance et violations d’accès.
- **Sources** : S09, S10, S11.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Observabilité et tracing

#### AI_ENGINEERING_LEARNING_cycle_326/1000 — Observabilité et tracing × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Observabilité et tracing un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à corréler requête, outils, stockage et modèle, pas par l’absence d’exception.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : suivre une requête multi-outils de bout en bout; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_327/1000 — Observabilité et tracing × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Observabilité et tracing (trace id, spans, logs, métriques et événements) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_328/1000 — Observabilité et tracing × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Observabilité et tracing, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_329/1000 — Observabilité et tracing × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Observabilité et tracing comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_330/1000 — Observabilité et tracing × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer incident non reproductible, logs sans corrélation, données sensibles en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_331/1000 — Observabilité et tracing × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Observabilité et tracing une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_332/1000 — Observabilité et tracing × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Observabilité et tracing, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_333/1000 — Observabilité et tracing × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Observabilité et tracing. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_334/1000 — Observabilité et tracing × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Observabilité et tracing; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_335/1000 — Observabilité et tracing × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Observabilité et tracing. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_336/1000 — Observabilité et tracing × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Observabilité et tracing uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_337/1000 — Observabilité et tracing × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Observabilité et tracing aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_338/1000 — Observabilité et tracing × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Observabilité et tracing avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_339/1000 — Observabilité et tracing × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer trace completeness et time-to-root-cause. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_340/1000 — Observabilité et tracing × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Observabilité et tracing indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_341/1000 — Observabilité et tracing × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Observabilité et tracing sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_342/1000 — Observabilité et tracing × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Observabilité et tracing puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_343/1000 — Observabilité et tracing × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Observabilité et tracing avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_344/1000 — Observabilité et tracing × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Observabilité et tracing. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_345/1000 — Observabilité et tracing × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Observabilité et tracing et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_346/1000 — Observabilité et tracing × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Observabilité et tracing. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_347/1000 — Observabilité et tracing × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Observabilité et tracing. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_348/1000 — Observabilité et tracing × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Observabilité et tracing à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_349/1000 — Observabilité et tracing × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Observabilité et tracing; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_350/1000 — Observabilité et tracing × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Observabilité et tracing le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : incident non reproductible, logs sans corrélation, données sensibles.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : trace completeness et time-to-root-cause.
- **Sources** : S08, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Cloudflare Workers

#### AI_ENGINEERING_LEARNING_cycle_351/1000 — Cloudflare Workers × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Cloudflare Workers un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à garder le chemin requête court, stateless et borné, pas par l’absence d’exception.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : simuler dépendance lente et vérifier découplage async; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_352/1000 — Cloudflare Workers × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Cloudflare Workers (request, bindings, subrequests, waitUntil et réponse) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_353/1000 — Cloudflare Workers × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Cloudflare Workers, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_354/1000 — Cloudflare Workers × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Cloudflare Workers comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_355/1000 — Cloudflare Workers × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer travail long dans request path, dépendance lente, coût non borné en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_356/1000 — Cloudflare Workers × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Cloudflare Workers une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_357/1000 — Cloudflare Workers × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Cloudflare Workers, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_358/1000 — Cloudflare Workers × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Cloudflare Workers. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_359/1000 — Cloudflare Workers × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Cloudflare Workers; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_360/1000 — Cloudflare Workers × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Cloudflare Workers. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_361/1000 — Cloudflare Workers × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Cloudflare Workers uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_362/1000 — Cloudflare Workers × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Cloudflare Workers aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_363/1000 — Cloudflare Workers × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Cloudflare Workers avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_364/1000 — Cloudflare Workers × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer latence p95/p99 et subrequests par requête. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_365/1000 — Cloudflare Workers × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Cloudflare Workers indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_366/1000 — Cloudflare Workers × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Cloudflare Workers sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_367/1000 — Cloudflare Workers × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Cloudflare Workers puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_368/1000 — Cloudflare Workers × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Cloudflare Workers avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_369/1000 — Cloudflare Workers × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Cloudflare Workers. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_370/1000 — Cloudflare Workers × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Cloudflare Workers et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_371/1000 — Cloudflare Workers × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Cloudflare Workers. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_372/1000 — Cloudflare Workers × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Cloudflare Workers. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_373/1000 — Cloudflare Workers × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Cloudflare Workers à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_374/1000 — Cloudflare Workers × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Cloudflare Workers; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_375/1000 — Cloudflare Workers × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Cloudflare Workers le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : travail long dans request path, dépendance lente, coût non borné.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : latence p95/p99 et subrequests par requête.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Durable Objects / Agents SDK

#### AI_ENGINEERING_LEARNING_cycle_376/1000 — Durable Objects / Agents SDK × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Durable Objects / Agents SDK un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à utiliser l’identité durable pour coordonner état et concurrence, pas par l’absence d’exception.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : clients concurrents sur même identité et ordre déterministe; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_377/1000 — Durable Objects / Agents SDK × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Durable Objects / Agents SDK (instance, stockage local, alarmes, connexions et méthodes) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_378/1000 — Durable Objects / Agents SDK × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Durable Objects / Agents SDK, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_379/1000 — Durable Objects / Agents SDK × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Durable Objects / Agents SDK comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_380/1000 — Durable Objects / Agents SDK × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer mauvais sharding, hotspot, état partagé hors DO en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_381/1000 — Durable Objects / Agents SDK × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Durable Objects / Agents SDK une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_382/1000 — Durable Objects / Agents SDK × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Durable Objects / Agents SDK, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_383/1000 — Durable Objects / Agents SDK × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Durable Objects / Agents SDK. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_384/1000 — Durable Objects / Agents SDK × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Durable Objects / Agents SDK; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_385/1000 — Durable Objects / Agents SDK × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Durable Objects / Agents SDK. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_386/1000 — Durable Objects / Agents SDK × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Durable Objects / Agents SDK uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_387/1000 — Durable Objects / Agents SDK × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Durable Objects / Agents SDK aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_388/1000 — Durable Objects / Agents SDK × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Durable Objects / Agents SDK avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_389/1000 — Durable Objects / Agents SDK × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer contention et temps de reprise d’instance. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_390/1000 — Durable Objects / Agents SDK × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Durable Objects / Agents SDK indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_391/1000 — Durable Objects / Agents SDK × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Durable Objects / Agents SDK sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_392/1000 — Durable Objects / Agents SDK × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Durable Objects / Agents SDK puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_393/1000 — Durable Objects / Agents SDK × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Durable Objects / Agents SDK avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_394/1000 — Durable Objects / Agents SDK × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Durable Objects / Agents SDK. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_395/1000 — Durable Objects / Agents SDK × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Durable Objects / Agents SDK et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_396/1000 — Durable Objects / Agents SDK × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Durable Objects / Agents SDK. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_397/1000 — Durable Objects / Agents SDK × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Durable Objects / Agents SDK. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_398/1000 — Durable Objects / Agents SDK × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Durable Objects / Agents SDK à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_399/1000 — Durable Objects / Agents SDK × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Durable Objects / Agents SDK; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_400/1000 — Durable Objects / Agents SDK × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Durable Objects / Agents SDK le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : mauvais sharding, hotspot, état partagé hors DO.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : contention et temps de reprise d’instance.
- **Sources** : S03, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### D1 / SQLite

#### AI_ENGINEERING_LEARNING_cycle_401/1000 — D1 / SQLite × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour D1 / SQLite un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à raisonner transactions, cohérence et migrations, pas par l’absence d’exception.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : write puis read via session et vérifier read-your-writes; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_402/1000 — D1 / SQLite × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de D1 / SQLite (schéma, transaction, bookmark/session, index et version) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_403/1000 — D1 / SQLite × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour D1 / SQLite, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_404/1000 — D1 / SQLite × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de D1 / SQLite comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_405/1000 — D1 / SQLite × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer lecture obsolète, migration cassée, requête non indexée en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_406/1000 — D1 / SQLite × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération D1 / SQLite une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_407/1000 — D1 / SQLite × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour D1 / SQLite, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_408/1000 — D1 / SQLite × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations D1 / SQLite. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_409/1000 — D1 / SQLite × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de D1 / SQLite; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_410/1000 — D1 / SQLite × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à D1 / SQLite. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_411/1000 — D1 / SQLite × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à D1 / SQLite uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_412/1000 — D1 / SQLite × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de D1 / SQLite aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_413/1000 — D1 / SQLite × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter D1 / SQLite avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_414/1000 — D1 / SQLite × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer latence requête, erreurs migration, consistency violations. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_415/1000 — D1 / SQLite × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de D1 / SQLite indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_416/1000 — D1 / SQLite × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier D1 / SQLite sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_417/1000 — D1 / SQLite × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de D1 / SQLite puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_418/1000 — D1 / SQLite × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler D1 / SQLite avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_419/1000 — D1 / SQLite × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de D1 / SQLite. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_420/1000 — D1 / SQLite × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de D1 / SQLite et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_421/1000 — D1 / SQLite × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de D1 / SQLite. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_422/1000 — D1 / SQLite × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à D1 / SQLite. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_423/1000 — D1 / SQLite × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de D1 / SQLite à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_424/1000 — D1 / SQLite × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de D1 / SQLite; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_425/1000 — D1 / SQLite × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour D1 / SQLite le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : lecture obsolète, migration cassée, requête non indexée.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : latence requête, erreurs migration, consistency violations.
- **Sources** : S06, S16, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Queues / Workflows

#### AI_ENGINEERING_LEARNING_cycle_426/1000 — Queues / Workflows × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Queues / Workflows un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à découpler tâches asynchrones et reprendre durablement, pas par l’absence d’exception.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : faire échouer une étape et vérifier reprise idempotente; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_427/1000 — Queues / Workflows × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Queues / Workflows (message/job, tentative, checkpoint, DLQ et résultat) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_428/1000 — Queues / Workflows × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Queues / Workflows, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_429/1000 — Queues / Workflows × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Queues / Workflows comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_430/1000 — Queues / Workflows × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer double traitement, poison message, retry infini en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_431/1000 — Queues / Workflows × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Queues / Workflows une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_432/1000 — Queues / Workflows × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Queues / Workflows, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_433/1000 — Queues / Workflows × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Queues / Workflows. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_434/1000 — Queues / Workflows × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Queues / Workflows; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_435/1000 — Queues / Workflows × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Queues / Workflows. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_436/1000 — Queues / Workflows × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Queues / Workflows uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_437/1000 — Queues / Workflows × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Queues / Workflows aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_438/1000 — Queues / Workflows × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Queues / Workflows avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_439/1000 — Queues / Workflows × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer retry rate, DLQ rate, age of oldest message. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_440/1000 — Queues / Workflows × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Queues / Workflows indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_441/1000 — Queues / Workflows × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Queues / Workflows sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_442/1000 — Queues / Workflows × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Queues / Workflows puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_443/1000 — Queues / Workflows × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Queues / Workflows avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_444/1000 — Queues / Workflows × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Queues / Workflows. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_445/1000 — Queues / Workflows × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Queues / Workflows et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_446/1000 — Queues / Workflows × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Queues / Workflows. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_447/1000 — Queues / Workflows × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Queues / Workflows. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_448/1000 — Queues / Workflows × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Queues / Workflows à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_449/1000 — Queues / Workflows × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Queues / Workflows; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_450/1000 — Queues / Workflows × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Queues / Workflows le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : double traitement, poison message, retry infini.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : retry rate, DLQ rate, age of oldest message.
- **Sources** : S05, S07, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### R2 / stockage objet

#### AI_ENGINEERING_LEARNING_cycle_451/1000 — R2 / stockage objet × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour R2 / stockage objet un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à séparer blobs, métadonnées, intégrité et lifecycle, pas par l’absence d’exception.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : corrompre un blob et vérifier détection par hash; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_452/1000 — R2 / stockage objet × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de R2 / stockage objet (clé, hash, taille, version et métadonnées) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_453/1000 — R2 / stockage objet × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour R2 / stockage objet, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_454/1000 — R2 / stockage objet × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de R2 / stockage objet comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_455/1000 — R2 / stockage objet × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer objet partiel, collision de clé, hash absent en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_456/1000 — R2 / stockage objet × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération R2 / stockage objet une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_457/1000 — R2 / stockage objet × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour R2 / stockage objet, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_458/1000 — R2 / stockage objet × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations R2 / stockage objet. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_459/1000 — R2 / stockage objet × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de R2 / stockage objet; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_460/1000 — R2 / stockage objet × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à R2 / stockage objet. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_461/1000 — R2 / stockage objet × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à R2 / stockage objet uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_462/1000 — R2 / stockage objet × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de R2 / stockage objet aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_463/1000 — R2 / stockage objet × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter R2 / stockage objet avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_464/1000 — R2 / stockage objet × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer integrity verification rate et orphan rate. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_465/1000 — R2 / stockage objet × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de R2 / stockage objet indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_466/1000 — R2 / stockage objet × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier R2 / stockage objet sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_467/1000 — R2 / stockage objet × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de R2 / stockage objet puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_468/1000 — R2 / stockage objet × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler R2 / stockage objet avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_469/1000 — R2 / stockage objet × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de R2 / stockage objet. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_470/1000 — R2 / stockage objet × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de R2 / stockage objet et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_471/1000 — R2 / stockage objet × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de R2 / stockage objet. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_472/1000 — R2 / stockage objet × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à R2 / stockage objet. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_473/1000 — R2 / stockage objet × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de R2 / stockage objet à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_474/1000 — R2 / stockage objet × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de R2 / stockage objet; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_475/1000 — R2 / stockage objet × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour R2 / stockage objet le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : objet partiel, collision de clé, hash absent.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : integrity verification rate et orphan rate.
- **Sources** : S03, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### API design et contrats

#### AI_ENGINEERING_LEARNING_cycle_476/1000 — API design et contrats × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour API design et contrats un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à rendre entrées, sorties, erreurs et idempotence explicites, pas par l’absence d’exception.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : client ancien contre nouvelle version et erreur structurée; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_477/1000 — API design et contrats × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de API design et contrats (version, schema, auth, idempotency key et problem detail) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_478/1000 — API design et contrats × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour API design et contrats, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_479/1000 — API design et contrats × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de API design et contrats comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_480/1000 — API design et contrats × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer breaking change silencieux, ambiguïté 200/erreur en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_481/1000 — API design et contrats × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération API design et contrats une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_482/1000 — API design et contrats × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour API design et contrats, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_483/1000 — API design et contrats × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations API design et contrats. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_484/1000 — API design et contrats × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de API design et contrats; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_485/1000 — API design et contrats × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à API design et contrats. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_486/1000 — API design et contrats × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à API design et contrats uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_487/1000 — API design et contrats × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de API design et contrats aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_488/1000 — API design et contrats × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter API design et contrats avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_489/1000 — API design et contrats × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer contract-test pass rate et breaking-change count. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_490/1000 — API design et contrats × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de API design et contrats indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_491/1000 — API design et contrats × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier API design et contrats sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_492/1000 — API design et contrats × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de API design et contrats puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_493/1000 — API design et contrats × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler API design et contrats avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_494/1000 — API design et contrats × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de API design et contrats. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_495/1000 — API design et contrats × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de API design et contrats et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_496/1000 — API design et contrats × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de API design et contrats. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_497/1000 — API design et contrats × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à API design et contrats. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_498/1000 — API design et contrats × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de API design et contrats à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_499/1000 — API design et contrats × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de API design et contrats; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_500/1000 — API design et contrats × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour API design et contrats le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : breaking change silencieux, ambiguïté 200/erreur.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : contract-test pass rate et breaking-change count.
- **Sources** : S11, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### TypeScript avancé

#### AI_ENGINEERING_LEARNING_cycle_501/1000 — TypeScript avancé × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour TypeScript avancé un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à faire porter les invariants par le type sans complexité gratuite, pas par l’absence d’exception.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : cas exhaustif sur union discriminée avec never; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_502/1000 — TypeScript avancé × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de TypeScript avancé (types discriminés, generics, narrowing et branded ids) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_503/1000 — TypeScript avancé × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour TypeScript avancé, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_504/1000 — TypeScript avancé × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de TypeScript avancé comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_505/1000 — TypeScript avancé × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer any implicite, union mal réduite, type ≠ runtime validation en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_506/1000 — TypeScript avancé × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération TypeScript avancé une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_507/1000 — TypeScript avancé × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour TypeScript avancé, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_508/1000 — TypeScript avancé × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations TypeScript avancé. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_509/1000 — TypeScript avancé × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de TypeScript avancé; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_510/1000 — TypeScript avancé × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à TypeScript avancé. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_511/1000 — TypeScript avancé × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à TypeScript avancé uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_512/1000 — TypeScript avancé × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de TypeScript avancé aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_513/1000 — TypeScript avancé × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter TypeScript avancé avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_514/1000 — TypeScript avancé × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer erreurs attrapées au compile et cast count. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_515/1000 — TypeScript avancé × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de TypeScript avancé indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_516/1000 — TypeScript avancé × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier TypeScript avancé sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_517/1000 — TypeScript avancé × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de TypeScript avancé puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_518/1000 — TypeScript avancé × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler TypeScript avancé avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_519/1000 — TypeScript avancé × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de TypeScript avancé. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_520/1000 — TypeScript avancé × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de TypeScript avancé et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_521/1000 — TypeScript avancé × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de TypeScript avancé. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_522/1000 — TypeScript avancé × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à TypeScript avancé. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_523/1000 — TypeScript avancé × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de TypeScript avancé à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_524/1000 — TypeScript avancé × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de TypeScript avancé; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_525/1000 — TypeScript avancé × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour TypeScript avancé le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : any implicite, union mal réduite, type ≠ runtime validation.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : erreurs attrapées au compile et cast count.
- **Sources** : S17, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Node.js avancé

#### AI_ENGINEERING_LEARNING_cycle_526/1000 — Node.js avancé × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Node.js avancé un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à maîtriser event loop, async context, workers et diagnostics, pas par l’absence d’exception.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : charge CPU déplacée vers pool et corrélation AsyncResource; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_527/1000 — Node.js avancé × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Node.js avancé (tasks, handles, async resources, workers et signals) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_528/1000 — Node.js avancé × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Node.js avancé, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_529/1000 — Node.js avancé × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Node.js avancé comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_530/1000 — Node.js avancé × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer blocage event loop, worker par tâche, fuite handle en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_531/1000 — Node.js avancé × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Node.js avancé une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_532/1000 — Node.js avancé × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Node.js avancé, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_533/1000 — Node.js avancé × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Node.js avancé. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_534/1000 — Node.js avancé × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Node.js avancé; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_535/1000 — Node.js avancé × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Node.js avancé. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_536/1000 — Node.js avancé × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Node.js avancé uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_537/1000 — Node.js avancé × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Node.js avancé aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_538/1000 — Node.js avancé × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Node.js avancé avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_539/1000 — Node.js avancé × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer event-loop delay, heap, active handles. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_540/1000 — Node.js avancé × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Node.js avancé indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_541/1000 — Node.js avancé × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Node.js avancé sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_542/1000 — Node.js avancé × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Node.js avancé puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_543/1000 — Node.js avancé × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Node.js avancé avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_544/1000 — Node.js avancé × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Node.js avancé. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_545/1000 — Node.js avancé × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Node.js avancé et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_546/1000 — Node.js avancé × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Node.js avancé. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_547/1000 — Node.js avancé × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Node.js avancé. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_548/1000 — Node.js avancé × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Node.js avancé à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_549/1000 — Node.js avancé × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Node.js avancé; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_550/1000 — Node.js avancé × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Node.js avancé le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : blocage event loop, worker par tâche, fuite handle.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : event-loop delay, heap, active handles.
- **Sources** : S18, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Tests unitaires/intégration/E2E

#### AI_ENGINEERING_LEARNING_cycle_551/1000 — Tests unitaires/intégration/E2E × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Tests unitaires/intégration/E2E un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à aligner chaque test sur un contrat utile, pas par l’absence d’exception.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : casser intentionnellement le contrat et voir le test échouer; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_552/1000 — Tests unitaires/intégration/E2E × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Tests unitaires/intégration/E2E (fixture, action, observation, oracle et cleanup) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_553/1000 — Tests unitaires/intégration/E2E × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Tests unitaires/intégration/E2E, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_554/1000 — Tests unitaires/intégration/E2E × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Tests unitaires/intégration/E2E comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_555/1000 — Tests unitaires/intégration/E2E × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer test non découvert, mock irréaliste, assertion superficielle en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_556/1000 — Tests unitaires/intégration/E2E × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Tests unitaires/intégration/E2E une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_557/1000 — Tests unitaires/intégration/E2E × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Tests unitaires/intégration/E2E, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_558/1000 — Tests unitaires/intégration/E2E × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Tests unitaires/intégration/E2E. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_559/1000 — Tests unitaires/intégration/E2E × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Tests unitaires/intégration/E2E; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_560/1000 — Tests unitaires/intégration/E2E × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Tests unitaires/intégration/E2E. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_561/1000 — Tests unitaires/intégration/E2E × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Tests unitaires/intégration/E2E uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_562/1000 — Tests unitaires/intégration/E2E × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Tests unitaires/intégration/E2E aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_563/1000 — Tests unitaires/intégration/E2E × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Tests unitaires/intégration/E2E avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_564/1000 — Tests unitaires/intégration/E2E × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer mutation score et bugs échappés. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_565/1000 — Tests unitaires/intégration/E2E × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Tests unitaires/intégration/E2E indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_566/1000 — Tests unitaires/intégration/E2E × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Tests unitaires/intégration/E2E sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_567/1000 — Tests unitaires/intégration/E2E × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Tests unitaires/intégration/E2E puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_568/1000 — Tests unitaires/intégration/E2E × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Tests unitaires/intégration/E2E avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_569/1000 — Tests unitaires/intégration/E2E × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Tests unitaires/intégration/E2E. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_570/1000 — Tests unitaires/intégration/E2E × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Tests unitaires/intégration/E2E et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_571/1000 — Tests unitaires/intégration/E2E × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Tests unitaires/intégration/E2E. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_572/1000 — Tests unitaires/intégration/E2E × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Tests unitaires/intégration/E2E. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_573/1000 — Tests unitaires/intégration/E2E × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Tests unitaires/intégration/E2E à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_574/1000 — Tests unitaires/intégration/E2E × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Tests unitaires/intégration/E2E; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_575/1000 — Tests unitaires/intégration/E2E × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Tests unitaires/intégration/E2E le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : test non découvert, mock irréaliste, assertion superficielle.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : mutation score et bugs échappés.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Property/fuzz/stress testing

#### AI_ENGINEERING_LEARNING_cycle_576/1000 — Property/fuzz/stress testing × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Property/fuzz/stress testing un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à explorer invariants au-delà des exemples manuels, pas par l’absence d’exception.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : générer séquences pause/reprise/retry aléatoires bornées; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_577/1000 — Property/fuzz/stress testing × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Property/fuzz/stress testing (générateur, seed, invariant, shrink et limite) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_578/1000 — Property/fuzz/stress testing × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Property/fuzz/stress testing, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_579/1000 — Property/fuzz/stress testing × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Property/fuzz/stress testing comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_580/1000 — Property/fuzz/stress testing × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer fuzz non reproductible, stress sans cleanup, DoS accidentel en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_581/1000 — Property/fuzz/stress testing × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Property/fuzz/stress testing une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_582/1000 — Property/fuzz/stress testing × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Property/fuzz/stress testing, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_583/1000 — Property/fuzz/stress testing × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Property/fuzz/stress testing. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_584/1000 — Property/fuzz/stress testing × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Property/fuzz/stress testing; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_585/1000 — Property/fuzz/stress testing × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Property/fuzz/stress testing. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_586/1000 — Property/fuzz/stress testing × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Property/fuzz/stress testing uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_587/1000 — Property/fuzz/stress testing × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Property/fuzz/stress testing aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_588/1000 — Property/fuzz/stress testing × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Property/fuzz/stress testing avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_589/1000 — Property/fuzz/stress testing × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer unique failures et seeds reproductibles. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_590/1000 — Property/fuzz/stress testing × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Property/fuzz/stress testing indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_591/1000 — Property/fuzz/stress testing × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Property/fuzz/stress testing sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_592/1000 — Property/fuzz/stress testing × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Property/fuzz/stress testing puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_593/1000 — Property/fuzz/stress testing × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Property/fuzz/stress testing avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_594/1000 — Property/fuzz/stress testing × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Property/fuzz/stress testing. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_595/1000 — Property/fuzz/stress testing × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Property/fuzz/stress testing et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_596/1000 — Property/fuzz/stress testing × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Property/fuzz/stress testing. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_597/1000 — Property/fuzz/stress testing × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Property/fuzz/stress testing. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_598/1000 — Property/fuzz/stress testing × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Property/fuzz/stress testing à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_599/1000 — Property/fuzz/stress testing × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Property/fuzz/stress testing; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_600/1000 — Property/fuzz/stress testing × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Property/fuzz/stress testing le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : fuzz non reproductible, stress sans cleanup, DoS accidentel.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : unique failures et seeds reproductibles.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Git / GitHub / CI

#### AI_ENGINEERING_LEARNING_cycle_601/1000 — Git / GitHub / CI × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Git / GitHub / CI un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à faire du SHA et des preuves CI la source de vérité, pas par l’absence d’exception.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : déplacer branch pendant préparation et vérifier CAS abort; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_602/1000 — Git / GitHub / CI × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Git / GitHub / CI (commit, tree, branch, workflow, artifact et status) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_603/1000 — Git / GitHub / CI × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Git / GitHub / CI, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_604/1000 — Git / GitHub / CI × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Git / GitHub / CI comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_605/1000 — Git / GitHub / CI × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer test sur mauvais SHA, force push, branche concurrente en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_606/1000 — Git / GitHub / CI × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Git / GitHub / CI une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_607/1000 — Git / GitHub / CI × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Git / GitHub / CI, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_608/1000 — Git / GitHub / CI × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Git / GitHub / CI. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_609/1000 — Git / GitHub / CI × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Git / GitHub / CI; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_610/1000 — Git / GitHub / CI × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Git / GitHub / CI. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_611/1000 — Git / GitHub / CI × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Git / GitHub / CI uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_612/1000 — Git / GitHub / CI × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Git / GitHub / CI aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_613/1000 — Git / GitHub / CI × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Git / GitHub / CI avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_614/1000 — Git / GitHub / CI × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer exact-SHA validation rate. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_615/1000 — Git / GitHub / CI × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Git / GitHub / CI indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_616/1000 — Git / GitHub / CI × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Git / GitHub / CI sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_617/1000 — Git / GitHub / CI × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Git / GitHub / CI puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_618/1000 — Git / GitHub / CI × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Git / GitHub / CI avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_619/1000 — Git / GitHub / CI × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Git / GitHub / CI. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_620/1000 — Git / GitHub / CI × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Git / GitHub / CI et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_621/1000 — Git / GitHub / CI × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Git / GitHub / CI. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_622/1000 — Git / GitHub / CI × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Git / GitHub / CI. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_623/1000 — Git / GitHub / CI × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Git / GitHub / CI à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_624/1000 — Git / GitHub / CI × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Git / GitHub / CI; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_625/1000 — Git / GitHub / CI × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Git / GitHub / CI le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : test sur mauvais SHA, force push, branche concurrente.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : exact-SHA validation rate.
- **Sources** : S12, S13, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Supply chain et provenance

#### AI_ENGINEERING_LEARNING_cycle_626/1000 — Supply chain et provenance × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Supply chain et provenance un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à prouver origine des builds et dépendances, pas par l’absence d’exception.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : vérifier attestation contre mauvais SHA et refuser; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_627/1000 — Supply chain et provenance × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Supply chain et provenance (source SHA, workflow, artifact digest, attestation et SBOM) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_628/1000 — Supply chain et provenance × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Supply chain et provenance, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_629/1000 — Supply chain et provenance × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Supply chain et provenance comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_630/1000 — Supply chain et provenance × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer action non épinglée, artefact non traçable, dépendance compromise en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_631/1000 — Supply chain et provenance × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Supply chain et provenance une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_632/1000 — Supply chain et provenance × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Supply chain et provenance, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_633/1000 — Supply chain et provenance × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Supply chain et provenance. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_634/1000 — Supply chain et provenance × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Supply chain et provenance; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_635/1000 — Supply chain et provenance × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Supply chain et provenance. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_636/1000 — Supply chain et provenance × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Supply chain et provenance uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_637/1000 — Supply chain et provenance × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Supply chain et provenance aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_638/1000 — Supply chain et provenance × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Supply chain et provenance avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_639/1000 — Supply chain et provenance × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer attested artifact coverage. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_640/1000 — Supply chain et provenance × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Supply chain et provenance indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_641/1000 — Supply chain et provenance × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Supply chain et provenance sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_642/1000 — Supply chain et provenance × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Supply chain et provenance puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_643/1000 — Supply chain et provenance × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Supply chain et provenance avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_644/1000 — Supply chain et provenance × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Supply chain et provenance. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_645/1000 — Supply chain et provenance × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Supply chain et provenance et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_646/1000 — Supply chain et provenance × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Supply chain et provenance. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_647/1000 — Supply chain et provenance × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Supply chain et provenance. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_648/1000 — Supply chain et provenance × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Supply chain et provenance à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_649/1000 — Supply chain et provenance × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Supply chain et provenance; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_650/1000 — Supply chain et provenance × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Supply chain et provenance le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : action non épinglée, artefact non traçable, dépendance compromise.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : attested artifact coverage.
- **Sources** : S12, S13, S19.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Release engineering

#### AI_ENGINEERING_LEARNING_cycle_651/1000 — Release engineering × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Release engineering un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à promouvoir exactement l’artefact testé avec rollback, pas par l’absence d’exception.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : canary contrôlé puis rollback exact sur seuil; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_652/1000 — Release engineering × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Release engineering (candidate SHA, canary, métriques, décision et rollback target) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_653/1000 — Release engineering × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Release engineering, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_654/1000 — Release engineering × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Release engineering comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_655/1000 — Release engineering × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer rebuild différent, promotion approximative, rollback non testé en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_656/1000 — Release engineering × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Release engineering une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_657/1000 — Release engineering × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Release engineering, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_658/1000 — Release engineering × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Release engineering. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_659/1000 — Release engineering × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Release engineering; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_660/1000 — Release engineering × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Release engineering. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_661/1000 — Release engineering × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Release engineering uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_662/1000 — Release engineering × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Release engineering aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_663/1000 — Release engineering × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Release engineering avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_664/1000 — Release engineering × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer change failure rate et rollback time. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_665/1000 — Release engineering × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Release engineering indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_666/1000 — Release engineering × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Release engineering sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_667/1000 — Release engineering × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Release engineering puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_668/1000 — Release engineering × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Release engineering avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_669/1000 — Release engineering × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Release engineering. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_670/1000 — Release engineering × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Release engineering et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_671/1000 — Release engineering × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Release engineering. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_672/1000 — Release engineering × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Release engineering. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_673/1000 — Release engineering × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Release engineering à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_674/1000 — Release engineering × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Release engineering; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_675/1000 — Release engineering × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Release engineering le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : rebuild différent, promotion approximative, rollback non testé.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : change failure rate et rollback time.
- **Sources** : S14, S12, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Systèmes distribués

#### AI_ENGINEERING_LEARNING_cycle_676/1000 — Systèmes distribués × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Systèmes distribués un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à concevoir pour latence, partitions et dépendances imparfaites, pas par l’absence d’exception.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : couper une dépendance et vérifier stabilité statique; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_677/1000 — Systèmes distribués × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Systèmes distribués (deadline, dependency graph, replicas et consistency model) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_678/1000 — Systèmes distribués × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Systèmes distribués, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_679/1000 — Systèmes distribués × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Systèmes distribués comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_680/1000 — Systèmes distribués × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer cascade, thundering herd, dépendance obligatoire inutile en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_681/1000 — Systèmes distribués × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Systèmes distribués une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_682/1000 — Systèmes distribués × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Systèmes distribués, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_683/1000 — Systèmes distribués × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Systèmes distribués. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_684/1000 — Systèmes distribués × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Systèmes distribués; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_685/1000 — Systèmes distribués × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Systèmes distribués. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_686/1000 — Systèmes distribués × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Systèmes distribués uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_687/1000 — Systèmes distribués × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Systèmes distribués aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_688/1000 — Systèmes distribués × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Systèmes distribués avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_689/1000 — Systèmes distribués × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer availability par dépendance et tail latency. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_690/1000 — Systèmes distribués × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Systèmes distribués indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_691/1000 — Systèmes distribués × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Systèmes distribués sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_692/1000 — Systèmes distribués × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Systèmes distribués puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_693/1000 — Systèmes distribués × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Systèmes distribués avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_694/1000 — Systèmes distribués × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Systèmes distribués. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_695/1000 — Systèmes distribués × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Systèmes distribués et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_696/1000 — Systèmes distribués × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Systèmes distribués. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_697/1000 — Systèmes distribués × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Systèmes distribués. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_698/1000 — Systèmes distribués × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Systèmes distribués à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_699/1000 — Systèmes distribués × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Systèmes distribués; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_700/1000 — Systèmes distribués × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Systèmes distribués le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : cascade, thundering herd, dépendance obligatoire inutile.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : availability par dépendance et tail latency.
- **Sources** : S14, S15, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Concurrence et idempotence

#### AI_ENGINEERING_LEARNING_cycle_701/1000 — Concurrence et idempotence × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Concurrence et idempotence un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à rendre les retries sûrs et les courses explicites, pas par l’absence d’exception.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : même requête 10 fois concurrentes -> un seul effet; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_702/1000 — Concurrence et idempotence × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Concurrence et idempotence (operation id, lock/version, side effect et result cache) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_703/1000 — Concurrence et idempotence × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Concurrence et idempotence, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_704/1000 — Concurrence et idempotence × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Concurrence et idempotence comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_705/1000 — Concurrence et idempotence × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer double effet, lost update, retry non sûr en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_706/1000 — Concurrence et idempotence × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Concurrence et idempotence une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_707/1000 — Concurrence et idempotence × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Concurrence et idempotence, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_708/1000 — Concurrence et idempotence × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Concurrence et idempotence. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_709/1000 — Concurrence et idempotence × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Concurrence et idempotence; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_710/1000 — Concurrence et idempotence × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Concurrence et idempotence. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_711/1000 — Concurrence et idempotence × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Concurrence et idempotence uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_712/1000 — Concurrence et idempotence × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Concurrence et idempotence aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_713/1000 — Concurrence et idempotence × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Concurrence et idempotence avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_714/1000 — Concurrence et idempotence × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer duplicate side-effect rate. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_715/1000 — Concurrence et idempotence × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Concurrence et idempotence indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_716/1000 — Concurrence et idempotence × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Concurrence et idempotence sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_717/1000 — Concurrence et idempotence × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Concurrence et idempotence puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_718/1000 — Concurrence et idempotence × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Concurrence et idempotence avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_719/1000 — Concurrence et idempotence × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Concurrence et idempotence. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_720/1000 — Concurrence et idempotence × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Concurrence et idempotence et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_721/1000 — Concurrence et idempotence × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Concurrence et idempotence. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_722/1000 — Concurrence et idempotence × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Concurrence et idempotence. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_723/1000 — Concurrence et idempotence × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Concurrence et idempotence à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_724/1000 — Concurrence et idempotence × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Concurrence et idempotence; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_725/1000 — Concurrence et idempotence × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Concurrence et idempotence le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : double effet, lost update, retry non sûr.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : duplicate side-effect rate.
- **Sources** : S15, S04, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Performance et caching

#### AI_ENGINEERING_LEARNING_cycle_726/1000 — Performance et caching × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Performance et caching un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à optimiser après mesure, sans casser cohérence, pas par l’absence d’exception.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : désactiver cache pour comparer baseline et cohérence; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_727/1000 — Performance et caching × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Performance et caching (hot path, cache key, TTL, invalidation et budget) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_728/1000 — Performance et caching × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Performance et caching, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_729/1000 — Performance et caching × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Performance et caching comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_730/1000 — Performance et caching × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer cache stale, optimisation prématurée, p99 ignoré en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_731/1000 — Performance et caching × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Performance et caching une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_732/1000 — Performance et caching × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Performance et caching, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_733/1000 — Performance et caching × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Performance et caching. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_734/1000 — Performance et caching × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Performance et caching; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_735/1000 — Performance et caching × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Performance et caching. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_736/1000 — Performance et caching × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Performance et caching uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_737/1000 — Performance et caching × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Performance et caching aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_738/1000 — Performance et caching × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Performance et caching avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_739/1000 — Performance et caching × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer p50/p95/p99, hit rate, CPU/IO budget. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_740/1000 — Performance et caching × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Performance et caching indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_741/1000 — Performance et caching × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Performance et caching sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_742/1000 — Performance et caching × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Performance et caching puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_743/1000 — Performance et caching × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Performance et caching avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_744/1000 — Performance et caching × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Performance et caching. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_745/1000 — Performance et caching × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Performance et caching et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_746/1000 — Performance et caching × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Performance et caching. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_747/1000 — Performance et caching × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Performance et caching. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_748/1000 — Performance et caching × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Performance et caching à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_749/1000 — Performance et caching × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Performance et caching; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_750/1000 — Performance et caching × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Performance et caching le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : cache stale, optimisation prématurée, p99 ignoré.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : p50/p95/p99, hit rate, CPU/IO budget.
- **Sources** : S05, S08, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Auth, permissions et secrets

#### AI_ENGINEERING_LEARNING_cycle_751/1000 — Auth, permissions et secrets × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Auth, permissions et secrets un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à appliquer moindre privilège et credentials éphémères, pas par l’absence d’exception.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : appel sans scope minimal -> deny explicite; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_752/1000 — Auth, permissions et secrets × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Auth, permissions et secrets (principal, scope, token lifetime, audit et revocation) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_753/1000 — Auth, permissions et secrets × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Auth, permissions et secrets, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_754/1000 — Auth, permissions et secrets × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Auth, permissions et secrets comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_755/1000 — Auth, permissions et secrets × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer secret commit, scope global, permission implicite en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_756/1000 — Auth, permissions et secrets × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Auth, permissions et secrets une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_757/1000 — Auth, permissions et secrets × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Auth, permissions et secrets, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_758/1000 — Auth, permissions et secrets × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Auth, permissions et secrets. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_759/1000 — Auth, permissions et secrets × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Auth, permissions et secrets; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_760/1000 — Auth, permissions et secrets × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Auth, permissions et secrets. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_761/1000 — Auth, permissions et secrets × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Auth, permissions et secrets uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_762/1000 — Auth, permissions et secrets × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Auth, permissions et secrets aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_763/1000 — Auth, permissions et secrets × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Auth, permissions et secrets avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_764/1000 — Auth, permissions et secrets × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer least-privilege coverage et secret exposure count. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_765/1000 — Auth, permissions et secrets × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Auth, permissions et secrets indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_766/1000 — Auth, permissions et secrets × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Auth, permissions et secrets sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_767/1000 — Auth, permissions et secrets × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Auth, permissions et secrets puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_768/1000 — Auth, permissions et secrets × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Auth, permissions et secrets avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_769/1000 — Auth, permissions et secrets × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Auth, permissions et secrets. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_770/1000 — Auth, permissions et secrets × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Auth, permissions et secrets et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_771/1000 — Auth, permissions et secrets × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Auth, permissions et secrets. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_772/1000 — Auth, permissions et secrets × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Auth, permissions et secrets. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_773/1000 — Auth, permissions et secrets × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Auth, permissions et secrets à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_774/1000 — Auth, permissions et secrets × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Auth, permissions et secrets; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_775/1000 — Auth, permissions et secrets × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Auth, permissions et secrets le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : secret commit, scope global, permission implicite.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : least-privilege coverage et secret exposure count.
- **Sources** : S12, S11, S09.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### State machines et jobs persistants

#### AI_ENGINEERING_LEARNING_cycle_776/1000 — State machines et jobs persistants × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour State machines et jobs persistants un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à rendre transitions, retries et terminal states déterministes, pas par l’absence d’exception.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : crash entre deux transitions puis reprise depuis checkpoint; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_777/1000 — State machines et jobs persistants × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de State machines et jobs persistants (state, event, guard, transition, heartbeat et terminal result) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_778/1000 — State machines et jobs persistants × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour State machines et jobs persistants, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_779/1000 — State machines et jobs persistants × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de State machines et jobs persistants comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_780/1000 — State machines et jobs persistants × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer état impossible, double terminal, job zombie en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_781/1000 — State machines et jobs persistants × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération State machines et jobs persistants une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_782/1000 — State machines et jobs persistants × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour State machines et jobs persistants, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_783/1000 — State machines et jobs persistants × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations State machines et jobs persistants. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_784/1000 — State machines et jobs persistants × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de State machines et jobs persistants; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_785/1000 — State machines et jobs persistants × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à State machines et jobs persistants. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_786/1000 — State machines et jobs persistants × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à State machines et jobs persistants uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_787/1000 — State machines et jobs persistants × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de State machines et jobs persistants aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_788/1000 — State machines et jobs persistants × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter State machines et jobs persistants avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_789/1000 — State machines et jobs persistants × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer invalid transition count et stale heartbeat count. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_790/1000 — State machines et jobs persistants × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de State machines et jobs persistants indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_791/1000 — State machines et jobs persistants × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier State machines et jobs persistants sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_792/1000 — State machines et jobs persistants × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de State machines et jobs persistants puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_793/1000 — State machines et jobs persistants × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler State machines et jobs persistants avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_794/1000 — State machines et jobs persistants × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de State machines et jobs persistants. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_795/1000 — State machines et jobs persistants × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de State machines et jobs persistants et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_796/1000 — State machines et jobs persistants × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de State machines et jobs persistants. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_797/1000 — State machines et jobs persistants × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à State machines et jobs persistants. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_798/1000 — State machines et jobs persistants × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de State machines et jobs persistants à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_799/1000 — State machines et jobs persistants × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de State machines et jobs persistants; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_800/1000 — State machines et jobs persistants × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour State machines et jobs persistants le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : état impossible, double terminal, job zombie.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : invalid transition count et stale heartbeat count.
- **Sources** : S03, S05, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Fine-tuning / LoRA

#### AI_ENGINEERING_LEARNING_cycle_801/1000 — Fine-tuning / LoRA × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Fine-tuning / LoRA un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à distinguer entraînement réel, compatibilité et qualité, pas par l’absence d’exception.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : charger adapter persisté puis comparer mêmes evals; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_802/1000 — Fine-tuning / LoRA × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Fine-tuning / LoRA (dataset, base model, adapter, step, loss, eval et activation) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_803/1000 — Fine-tuning / LoRA × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Fine-tuning / LoRA, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_804/1000 — Fine-tuning / LoRA × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Fine-tuning / LoRA comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_805/1000 — Fine-tuning / LoRA × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer adapter non chargé, data leakage, amélioration non mesurée en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_806/1000 — Fine-tuning / LoRA × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Fine-tuning / LoRA une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_807/1000 — Fine-tuning / LoRA × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Fine-tuning / LoRA, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_808/1000 — Fine-tuning / LoRA × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Fine-tuning / LoRA. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_809/1000 — Fine-tuning / LoRA × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Fine-tuning / LoRA; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_810/1000 — Fine-tuning / LoRA × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Fine-tuning / LoRA. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_811/1000 — Fine-tuning / LoRA × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Fine-tuning / LoRA uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_812/1000 — Fine-tuning / LoRA × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Fine-tuning / LoRA aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_813/1000 — Fine-tuning / LoRA × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Fine-tuning / LoRA avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_814/1000 — Fine-tuning / LoRA × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer delta eval vs baseline et regression set. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_815/1000 — Fine-tuning / LoRA × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Fine-tuning / LoRA indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_816/1000 — Fine-tuning / LoRA × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Fine-tuning / LoRA sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_817/1000 — Fine-tuning / LoRA × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Fine-tuning / LoRA puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_818/1000 — Fine-tuning / LoRA × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Fine-tuning / LoRA avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_819/1000 — Fine-tuning / LoRA × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Fine-tuning / LoRA. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_820/1000 — Fine-tuning / LoRA × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Fine-tuning / LoRA et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_821/1000 — Fine-tuning / LoRA × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Fine-tuning / LoRA. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_822/1000 — Fine-tuning / LoRA × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Fine-tuning / LoRA. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_823/1000 — Fine-tuning / LoRA × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Fine-tuning / LoRA à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_824/1000 — Fine-tuning / LoRA × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Fine-tuning / LoRA; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_825/1000 — Fine-tuning / LoRA × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Fine-tuning / LoRA le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : adapter non chargé, data leakage, amélioration non mesurée.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : delta eval vs baseline et regression set.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Datasets et qualité des données

#### AI_ENGINEERING_LEARNING_cycle_826/1000 — Datasets et qualité des données × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Datasets et qualité des données un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à versionner données, labels, provenance et exclusions, pas par l’absence d’exception.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : hash-based dedup avant split train/eval; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_827/1000 — Datasets et qualité des données × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Datasets et qualité des données (record id, source, consent, split, label et version) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_828/1000 — Datasets et qualité des données × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Datasets et qualité des données, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_829/1000 — Datasets et qualité des données × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Datasets et qualité des données comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_830/1000 — Datasets et qualité des données × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer duplicate leakage, label noise, source inconnue en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_831/1000 — Datasets et qualité des données × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Datasets et qualité des données une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_832/1000 — Datasets et qualité des données × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Datasets et qualité des données, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_833/1000 — Datasets et qualité des données × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Datasets et qualité des données. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_834/1000 — Datasets et qualité des données × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Datasets et qualité des données; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_835/1000 — Datasets et qualité des données × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Datasets et qualité des données. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_836/1000 — Datasets et qualité des données × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Datasets et qualité des données uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_837/1000 — Datasets et qualité des données × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Datasets et qualité des données aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_838/1000 — Datasets et qualité des données × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Datasets et qualité des données avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_839/1000 — Datasets et qualité des données × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer duplicate rate, label agreement, provenance coverage. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_840/1000 — Datasets et qualité des données × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Datasets et qualité des données indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_841/1000 — Datasets et qualité des données × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Datasets et qualité des données sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_842/1000 — Datasets et qualité des données × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Datasets et qualité des données puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_843/1000 — Datasets et qualité des données × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Datasets et qualité des données avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_844/1000 — Datasets et qualité des données × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Datasets et qualité des données. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_845/1000 — Datasets et qualité des données × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Datasets et qualité des données et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_846/1000 — Datasets et qualité des données × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Datasets et qualité des données. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_847/1000 — Datasets et qualité des données × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Datasets et qualité des données. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_848/1000 — Datasets et qualité des données × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Datasets et qualité des données à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_849/1000 — Datasets et qualité des données × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Datasets et qualité des données; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_850/1000 — Datasets et qualité des données × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Datasets et qualité des données le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : duplicate leakage, label noise, source inconnue.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : duplicate rate, label agreement, provenance coverage.
- **Sources** : S10, S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Embeddings et recherche vectorielle

#### AI_ENGINEERING_LEARNING_cycle_851/1000 — Embeddings et recherche vectorielle × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Embeddings et recherche vectorielle un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à séparer similarité sémantique, filtres et vérité factuelle, pas par l’absence d’exception.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : mêmes documents réindexés nouvelle version sans mélange; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_852/1000 — Embeddings et recherche vectorielle × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Embeddings et recherche vectorielle (chunk, embedding version, metadata, score et filter) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_853/1000 — Embeddings et recherche vectorielle × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Embeddings et recherche vectorielle, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_854/1000 — Embeddings et recherche vectorielle × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Embeddings et recherche vectorielle comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_855/1000 — Embeddings et recherche vectorielle × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer chunk trop gros, score pris pour vérité, mélange de versions en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_856/1000 — Embeddings et recherche vectorielle × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Embeddings et recherche vectorielle une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_857/1000 — Embeddings et recherche vectorielle × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Embeddings et recherche vectorielle, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_858/1000 — Embeddings et recherche vectorielle × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Embeddings et recherche vectorielle. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_859/1000 — Embeddings et recherche vectorielle × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Embeddings et recherche vectorielle; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_860/1000 — Embeddings et recherche vectorielle × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Embeddings et recherche vectorielle. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_861/1000 — Embeddings et recherche vectorielle × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Embeddings et recherche vectorielle uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_862/1000 — Embeddings et recherche vectorielle × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Embeddings et recherche vectorielle aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_863/1000 — Embeddings et recherche vectorielle × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Embeddings et recherche vectorielle avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_864/1000 — Embeddings et recherche vectorielle × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer retrieval precision/recall par requête. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_865/1000 — Embeddings et recherche vectorielle × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Embeddings et recherche vectorielle indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_866/1000 — Embeddings et recherche vectorielle × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Embeddings et recherche vectorielle sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_867/1000 — Embeddings et recherche vectorielle × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Embeddings et recherche vectorielle puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_868/1000 — Embeddings et recherche vectorielle × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Embeddings et recherche vectorielle avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_869/1000 — Embeddings et recherche vectorielle × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Embeddings et recherche vectorielle. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_870/1000 — Embeddings et recherche vectorielle × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Embeddings et recherche vectorielle et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_871/1000 — Embeddings et recherche vectorielle × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Embeddings et recherche vectorielle. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_872/1000 — Embeddings et recherche vectorielle × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Embeddings et recherche vectorielle. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_873/1000 — Embeddings et recherche vectorielle × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Embeddings et recherche vectorielle à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_874/1000 — Embeddings et recherche vectorielle × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Embeddings et recherche vectorielle; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_875/1000 — Embeddings et recherche vectorielle × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Embeddings et recherche vectorielle le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : chunk trop gros, score pris pour vérité, mélange de versions.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : retrieval precision/recall par requête.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Multimodal / audio / image / vidéo

#### AI_ENGINEERING_LEARNING_cycle_876/1000 — Multimodal / audio / image / vidéo × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Multimodal / audio / image / vidéo un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à conserver provenance, formats et limites modalité, pas par l’absence d’exception.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : round-trip metadata et échec codec propre; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_877/1000 — Multimodal / audio / image / vidéo × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Multimodal / audio / image / vidéo (asset id, codec, timestamps, model, transform et output) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_878/1000 — Multimodal / audio / image / vidéo × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Multimodal / audio / image / vidéo, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_879/1000 — Multimodal / audio / image / vidéo × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Multimodal / audio / image / vidéo comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_880/1000 — Multimodal / audio / image / vidéo × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer conversion destructive, mismatch texte/image, latence non bornée en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_881/1000 — Multimodal / audio / image / vidéo × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Multimodal / audio / image / vidéo une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_882/1000 — Multimodal / audio / image / vidéo × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Multimodal / audio / image / vidéo, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_883/1000 — Multimodal / audio / image / vidéo × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Multimodal / audio / image / vidéo. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_884/1000 — Multimodal / audio / image / vidéo × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Multimodal / audio / image / vidéo; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_885/1000 — Multimodal / audio / image / vidéo × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Multimodal / audio / image / vidéo. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_886/1000 — Multimodal / audio / image / vidéo × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Multimodal / audio / image / vidéo uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_887/1000 — Multimodal / audio / image / vidéo × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Multimodal / audio / image / vidéo aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_888/1000 — Multimodal / audio / image / vidéo × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Multimodal / audio / image / vidéo avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_889/1000 — Multimodal / audio / image / vidéo × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer quality par modalité et end-to-end latency. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_890/1000 — Multimodal / audio / image / vidéo × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Multimodal / audio / image / vidéo indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_891/1000 — Multimodal / audio / image / vidéo × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Multimodal / audio / image / vidéo sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_892/1000 — Multimodal / audio / image / vidéo × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Multimodal / audio / image / vidéo puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_893/1000 — Multimodal / audio / image / vidéo × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Multimodal / audio / image / vidéo avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_894/1000 — Multimodal / audio / image / vidéo × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Multimodal / audio / image / vidéo. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_895/1000 — Multimodal / audio / image / vidéo × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Multimodal / audio / image / vidéo et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_896/1000 — Multimodal / audio / image / vidéo × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Multimodal / audio / image / vidéo. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_897/1000 — Multimodal / audio / image / vidéo × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Multimodal / audio / image / vidéo. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_898/1000 — Multimodal / audio / image / vidéo × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Multimodal / audio / image / vidéo à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_899/1000 — Multimodal / audio / image / vidéo × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Multimodal / audio / image / vidéo; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_900/1000 — Multimodal / audio / image / vidéo × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Multimodal / audio / image / vidéo le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : conversion destructive, mismatch texte/image, latence non bornée.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : quality par modalité et end-to-end latency.
- **Sources** : S01, S03, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Browser / computer use

#### AI_ENGINEERING_LEARNING_cycle_901/1000 — Browser / computer use × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Browser / computer use un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à séparer observation, décision et action avec confirmations, pas par l’absence d’exception.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : DOM change entre observation et clic -> revalidation; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_902/1000 — Browser / computer use × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Browser / computer use (screen/page state, target, action, result et rollback) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_903/1000 — Browser / computer use × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Browser / computer use, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_904/1000 — Browser / computer use × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Browser / computer use comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_905/1000 — Browser / computer use × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer clic sur mauvais élément, état stale, action irreversible en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_906/1000 — Browser / computer use × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Browser / computer use une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_907/1000 — Browser / computer use × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Browser / computer use, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_908/1000 — Browser / computer use × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Browser / computer use. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_909/1000 — Browser / computer use × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Browser / computer use; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_910/1000 — Browser / computer use × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Browser / computer use. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_911/1000 — Browser / computer use × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Browser / computer use uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_912/1000 — Browser / computer use × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Browser / computer use aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_913/1000 — Browser / computer use × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Browser / computer use avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_914/1000 — Browser / computer use × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer action success rate avec observation post-action. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_915/1000 — Browser / computer use × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Browser / computer use indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_916/1000 — Browser / computer use × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Browser / computer use sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_917/1000 — Browser / computer use × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Browser / computer use puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_918/1000 — Browser / computer use × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Browser / computer use avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_919/1000 — Browser / computer use × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Browser / computer use. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_920/1000 — Browser / computer use × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Browser / computer use et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_921/1000 — Browser / computer use × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Browser / computer use. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_922/1000 — Browser / computer use × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Browser / computer use. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_923/1000 — Browser / computer use × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Browser / computer use à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_924/1000 — Browser / computer use × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Browser / computer use; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_925/1000 — Browser / computer use × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Browser / computer use le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : clic sur mauvais élément, état stale, action irreversible.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : action success rate avec observation post-action.
- **Sources** : S01, S09, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Hardware / protocoles

#### AI_ENGINEERING_LEARNING_cycle_926/1000 — Hardware / protocoles × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Hardware / protocoles un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à versionner protocole et prouver l’effet physique séparément, pas par l’absence d’exception.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : perte réseau pendant OTA avec récupération; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_927/1000 — Hardware / protocoles × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Hardware / protocoles (device id, firmware, handshake, heartbeat, command ack) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_928/1000 — Hardware / protocoles × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Hardware / protocoles, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_929/1000 — Hardware / protocoles × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Hardware / protocoles comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_930/1000 — Hardware / protocoles × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer firmware/protocol mismatch, offline ghost, OTA brick en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_931/1000 — Hardware / protocoles × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Hardware / protocoles une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_932/1000 — Hardware / protocoles × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Hardware / protocoles, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_933/1000 — Hardware / protocoles × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Hardware / protocoles. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_934/1000 — Hardware / protocoles × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Hardware / protocoles; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_935/1000 — Hardware / protocoles × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Hardware / protocoles. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_936/1000 — Hardware / protocoles × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Hardware / protocoles uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_937/1000 — Hardware / protocoles × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Hardware / protocoles aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_938/1000 — Hardware / protocoles × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Hardware / protocoles avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_939/1000 — Hardware / protocoles × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer heartbeat health et command round-trip success. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_940/1000 — Hardware / protocoles × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Hardware / protocoles indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_941/1000 — Hardware / protocoles × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Hardware / protocoles sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_942/1000 — Hardware / protocoles × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Hardware / protocoles puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_943/1000 — Hardware / protocoles × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Hardware / protocoles avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_944/1000 — Hardware / protocoles × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Hardware / protocoles. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_945/1000 — Hardware / protocoles × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Hardware / protocoles et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_946/1000 — Hardware / protocoles × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Hardware / protocoles. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_947/1000 — Hardware / protocoles × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Hardware / protocoles. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_948/1000 — Hardware / protocoles × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Hardware / protocoles à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_949/1000 — Hardware / protocoles × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Hardware / protocoles; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_950/1000 — Hardware / protocoles × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Hardware / protocoles le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : firmware/protocol mismatch, offline ghost, OTA brick.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : heartbeat health et command round-trip success.
- **Sources** : S11, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### UX conversationnelle et accessibilité

#### AI_ENGINEERING_LEARNING_cycle_951/1000 — UX conversationnelle et accessibilité × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour UX conversationnelle et accessibilité un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à répondre au bon niveau avec continuité et feedback, pas par l’absence d’exception.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : suite de messages elliptiques et corrections explicites; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_952/1000 — UX conversationnelle et accessibilité × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de UX conversationnelle et accessibilité (intent, topic, constraints, uncertainty et next action) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_953/1000 — UX conversationnelle et accessibilité × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour UX conversationnelle et accessibilité, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_954/1000 — UX conversationnelle et accessibilité × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de UX conversationnelle et accessibilité comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_955/1000 — UX conversationnelle et accessibilité × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer hors sujet, sur-explication, faux statut, ambiguïté ignorée en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_956/1000 — UX conversationnelle et accessibilité × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération UX conversationnelle et accessibilité une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_957/1000 — UX conversationnelle et accessibilité × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour UX conversationnelle et accessibilité, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_958/1000 — UX conversationnelle et accessibilité × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations UX conversationnelle et accessibilité. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_959/1000 — UX conversationnelle et accessibilité × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de UX conversationnelle et accessibilité; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_960/1000 — UX conversationnelle et accessibilité × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à UX conversationnelle et accessibilité. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_961/1000 — UX conversationnelle et accessibilité × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à UX conversationnelle et accessibilité uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_962/1000 — UX conversationnelle et accessibilité × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de UX conversationnelle et accessibilité aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_963/1000 — UX conversationnelle et accessibilité × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter UX conversationnelle et accessibilité avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_964/1000 — UX conversationnelle et accessibilité × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer task success, correction rate, clarification precision. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_965/1000 — UX conversationnelle et accessibilité × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de UX conversationnelle et accessibilité indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_966/1000 — UX conversationnelle et accessibilité × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier UX conversationnelle et accessibilité sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_967/1000 — UX conversationnelle et accessibilité × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de UX conversationnelle et accessibilité puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_968/1000 — UX conversationnelle et accessibilité × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler UX conversationnelle et accessibilité avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_969/1000 — UX conversationnelle et accessibilité × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de UX conversationnelle et accessibilité. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_970/1000 — UX conversationnelle et accessibilité × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de UX conversationnelle et accessibilité et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_971/1000 — UX conversationnelle et accessibilité × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de UX conversationnelle et accessibilité. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_972/1000 — UX conversationnelle et accessibilité × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à UX conversationnelle et accessibilité. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_973/1000 — UX conversationnelle et accessibilité × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de UX conversationnelle et accessibilité à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_974/1000 — UX conversationnelle et accessibilité × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de UX conversationnelle et accessibilité; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_975/1000 — UX conversationnelle et accessibilité × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour UX conversationnelle et accessibilité le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : hors sujet, sur-explication, faux statut, ambiguïté ignorée.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : task success, correction rate, clarification precision.
- **Sources** : S10, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

### Incident response et documentation

#### AI_ENGINEERING_LEARNING_cycle_976/1000 — Incident response et documentation × Contrat explicite
- **Angle** : Contrat explicite.
- **Principe opérationnel** : Formaliser pour Incident response et documentation un contrat entrée/sortie/invariants avant l’implémentation. Le succès doit être défini par une postcondition observable liée à transformer incidents en corrections et connaissances réutilisables, pas par l’absence d’exception.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : rejouer incident en test de non-régression; ajouter aussi entrée invalide, champ manquant et champ superflu.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_977/1000 — Incident response et documentation × Modèle d’état
- **Angle** : Modèle d’état.
- **Principe opérationnel** : Lister l’état minimal de Incident response et documentation (timeline, impact, evidence, root cause, fix et follow-up) et séparer état durable, cache et observation dérivée. Toute reprise doit reconstruire la même décision à partir de l’état durable.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : restart au milieu de l’opération puis comparaison de l’état final avec un run sans interruption.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_978/1000 — Incident response et documentation × Validation d’entrées
- **Angle** : Validation d’entrées.
- **Principe opérationnel** : Valider les données au bord du système, avant toute mutation. Pour Incident response et documentation, refuser les valeurs ambiguës plutôt que laisser le cœur deviner silencieusement.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : valeurs limites, types inattendus, chaînes vides, tailles maximales et payload tronqué.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_979/1000 — Incident response et documentation × Validation de sorties
- **Angle** : Validation de sorties.
- **Principe opérationnel** : Traiter la sortie de Incident response et documentation comme non fiable jusqu’à vérification de forme et d’effet. Distinguer résultat transport, résultat métier et preuve relue.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : réponse 200 contenant un résultat métier invalide doit rester FAIL.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_980/1000 — Incident response et documentation × Taxonomie d’échec
- **Angle** : Taxonomie d’échec.
- **Principe opérationnel** : Classer postmortem sans action, cause supposée, runbook périmé en erreurs transitoires, permanentes, ambiguës et externes. La politique de retry ou d’arrêt dépend de cette classe, pas d’un catch générique.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : injecter un exemple de chaque classe et vérifier le chemin de récupération attendu.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_981/1000 — Incident response et documentation × Deadlines et timeouts
- **Angle** : Deadlines et timeouts.
- **Principe opérationnel** : Donner à chaque opération Incident response et documentation une deadline propagée. Un timeout doit produire un état explicite et ne jamais laisser une mutation sans statut.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : dépendance plus lente que la deadline; vérifier annulation, cleanup et statut observable.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_982/1000 — Incident response et documentation × Retries bornés
- **Angle** : Retries bornés.
- **Principe opérationnel** : Retry uniquement les échecs considérés transitoires, avec backoff/jitter et budget total. Pour Incident response et documentation, ne jamais transformer un retry en boucle sans limite.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : trois échecs transitoires puis succès; vérifier nombre de tentatives et délai total.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_983/1000 — Incident response et documentation × Idempotence
- **Angle** : Idempotence.
- **Principe opérationnel** : Associer une identité d’opération stable aux mutations Incident response et documentation. Un retry du même ordre doit converger vers un seul effet métier.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : envoyer simultanément le même operation_id plusieurs fois et vérifier un effet unique.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_984/1000 — Incident response et documentation × Concurrence
- **Angle** : Concurrence.
- **Principe opérationnel** : Identifier les sections critiques de Incident response et documentation; préférer versioning/transaction/sérialisation explicite aux hypothèses temporelles.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : deux acteurs modifient le même état dans des ordres inversés; vérifier invariant final.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_985/1000 — Incident response et documentation × Cohérence
- **Angle** : Cohérence.
- **Principe opérationnel** : Choisir et documenter le modèle de cohérence nécessaire à Incident response et documentation. Ne pas exiger sérialisable si read-your-writes suffit, ni accepter eventual consistency quand une décision dépend du dernier write.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : lecture juste après écriture et lecture concurrente depuis une autre session.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_986/1000 — Incident response et documentation × Moindre privilège
- **Angle** : Moindre privilège.
- **Principe opérationnel** : Donner à Incident response et documentation uniquement les permissions nécessaires à l’action courante, avec séparation lecture/écriture/administration.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : supprimer un scope nécessaire -> échec explicite; ajouter un scope non nécessaire -> aucune dépendance fonctionnelle.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_987/1000 — Incident response et documentation × Minimisation des données
- **Angle** : Minimisation des données.
- **Principe opérationnel** : Réduire les données de Incident response et documentation aux champs nécessaires; ne pas journaliser secrets ni contenu sensible quand un identifiant/hash suffit.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : scanner logs/artefacts et vérifier absence de secrets ou données inutiles.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_988/1000 — Incident response et documentation × Observabilité
- **Angle** : Observabilité.
- **Principe opérationnel** : Instrumenter Incident response et documentation avec identifiants corrélables, durée, statut, cause d’échec et provenance. Une trace doit permettre de relier demande, dépendances et résultat.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : partir d’un incident final et remonter à l’étape fautive sans lire le code.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_989/1000 — Incident response et documentation × Métriques et SLO
- **Angle** : Métriques et SLO.
- **Principe opérationnel** : Mesurer recurrence rate et mean time to recovery. Définir au moins une métrique qualité et une métrique fiabilité; éviter les métriques de volume prises pour du succès.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : provoquer une dégradation contrôlée et vérifier que le signal choisi la détecte.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_990/1000 — Incident response et documentation × Tests unitaires
- **Angle** : Tests unitaires.
- **Principe opérationnel** : Tester les invariants purs de Incident response et documentation indépendamment des providers. Les unités doivent couvrir branches d’erreur et limites, pas seulement le happy path.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : mutation volontaire d’une condition critique doit faire échouer au moins un test.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_991/1000 — Incident response et documentation × Tests d’intégration/E2E
- **Angle** : Tests d’intégration/E2E.
- **Principe opérationnel** : Vérifier Incident response et documentation sur son chemin runtime réel, avec persistance/outil/provider représentatif. Un mock seul ne prouve pas la capacité E2E.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : entrée réelle -> effet réel -> relecture/observation réelle.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_992/1000 — Incident response et documentation × Property/fuzz
- **Angle** : Property/fuzz.
- **Principe opérationnel** : Exprimer un invariant général de Incident response et documentation puis générer des séquences d’entrées pour chercher les contre-exemples. Conserver seed et cas réduit.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : 100+ cas bornés reproductibles, shrink du premier échec et test de régression ajouté.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_993/1000 — Incident response et documentation × Performance
- **Angle** : Performance.
- **Principe opérationnel** : Profiler Incident response et documentation avant optimisation. Optimiser le chemin dominant sans déplacer le coût vers une dépendance ou perdre la preuve métier.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : comparer baseline et version optimisée sur p50/p95/p99 et mêmes résultats.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_994/1000 — Incident response et documentation × Bornes de ressources
- **Angle** : Bornes de ressources.
- **Principe opérationnel** : Bor­ner taille, profondeur, nombre d’outils, retries, tokens, temps et mémoire de Incident response et documentation. Une tâche valide ne doit pas pouvoir devenir une consommation infinie.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : entrée au plafond puis juste au-dessus; vérifier rejet/gradation propre.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_995/1000 — Incident response et documentation × Versioning et migrations
- **Angle** : Versioning et migrations.
- **Principe opérationnel** : Versionner les contrats/états de Incident response et documentation et prévoir lecture de l’ancien format pendant migration. Les migrations doivent être répétables ou explicitement one-shot avec garde.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : ancien état -> nouveau code -> migration -> seconde exécution sans dommage.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_996/1000 — Incident response et documentation × Rollback et récupération
- **Angle** : Rollback et récupération.
- **Principe opérationnel** : Préparer avant changement le chemin de retour de Incident response et documentation. Le rollback doit viser un artefact/état exact et préserver les écritures non incompatibles.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : déployer changement cassé en preview, déclencher rollback, vérifier retour exact.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_997/1000 — Incident response et documentation × Threat modeling
- **Angle** : Threat modeling.
- **Principe opérationnel** : Lister actifs, frontières de confiance, attaquants et abus propres à Incident response et documentation. Les contrôles doivent réduire un risque identifié, pas seulement suivre une checklist.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : un scénario d’abus par frontière de confiance et preuve du contrôle.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_998/1000 — Incident response et documentation × Provenance et audit
- **Angle** : Provenance et audit.
- **Principe opérationnel** : Associer chaque résultat critique de Incident response et documentation à sa source, version, timestamp et identité d’exécution. L’audit doit distinguer observation, inférence et action.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : demander “d’où vient ce statut ?” et reconstruire la chaîne de preuve.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_999/1000 — Incident response et documentation × Human-in-the-loop
- **Angle** : Human-in-the-loop.
- **Principe opérationnel** : Placer une approbation humaine sur les actions irréversibles, coûteuses ou à fort impact de Incident response et documentation; ne pas demander confirmation pour les lectures sûres répétitives.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : action HIGH sans approbation -> bloquée; lecture LOW -> exécutable sans friction inutile.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

#### AI_ENGINEERING_LEARNING_cycle_1000/1000 — Incident response et documentation × Documentation et ADR
- **Angle** : Documentation et ADR.
- **Principe opérationnel** : Documenter pour Incident response et documentation le pourquoi, les invariants, les limites et le mode de diagnostic. La doc doit pointer vers le chemin runtime réellement actif.
- **Risque ciblé** : postmortem sans action, cause supposée, runbook périmé.
- **Critère de test** : Test : une autre page doit pouvoir diagnostiquer et modifier le composant sans rechercher une vérité concurrente.
- **Mesure utile** : recurrence rate et mean time to recovery.
- **Sources** : S11, S14, S20.
- **Implication MEL** : appliquer ce principe uniquement au composant concerné, sans élargir le périmètre ni déclarer PASS avant relecture de l’effet.

## Index thématique

- 0001–0025 : Architecture d’agents IA — séparer boucle agentique, état, outils, garde-fous et preuves.
- 0026–0050 : Tool use / function calling — rendre l’usage d’outils typé, borné et vérifiable.
- 0051–0075 : MCP et connecteurs — isoler transport, permissions, ressources et outils.
- 0076–0100 : RAG / retrieval — récupérer le minimum pertinent avec provenance.
- 0101–0125 : Mémoire conversationnelle — préserver continuité sans laisser l’ancien contexte dominer.
- 0126–0150 : Context engineering — construire un contexte hiérarchisé, compact et falsifiable.
- 0151–0175 : Evals et benchmarks — mesurer des comportements plutôt que l’impression subjective.
- 0176–0200 : Grounding et hallucinations — lier les affirmations aux observations vérifiables.
- 0201–0225 : Planification et raisonnement — décomposer sans multiplier les étapes inutiles.
- 0226–0250 : Orchestration multi-agents — déléguer avec contrats et fusion contrôlée.
- 0251–0275 : Guardrails et sécurité IA — limiter précisément le risque sans bloquer le contenu légitime.
- 0276–0300 : Prompt injection et données non fiables — traiter contenu récupéré comme données, pas comme autorité.
- 0301–0325 : Sécurité modèles et données — protéger données, datasets, adapters et sorties.
- 0326–0350 : Observabilité et tracing — corréler requête, outils, stockage et modèle.
- 0351–0375 : Cloudflare Workers — garder le chemin requête court, stateless et borné.
- 0376–0400 : Durable Objects / Agents SDK — utiliser l’identité durable pour coordonner état et concurrence.
- 0401–0425 : D1 / SQLite — raisonner transactions, cohérence et migrations.
- 0426–0450 : Queues / Workflows — découpler tâches asynchrones et reprendre durablement.
- 0451–0475 : R2 / stockage objet — séparer blobs, métadonnées, intégrité et lifecycle.
- 0476–0500 : API design et contrats — rendre entrées, sorties, erreurs et idempotence explicites.
- 0501–0525 : TypeScript avancé — faire porter les invariants par le type sans complexité gratuite.
- 0526–0550 : Node.js avancé — maîtriser event loop, async context, workers et diagnostics.
- 0551–0575 : Tests unitaires/intégration/E2E — aligner chaque test sur un contrat utile.
- 0576–0600 : Property/fuzz/stress testing — explorer invariants au-delà des exemples manuels.
- 0601–0625 : Git / GitHub / CI — faire du SHA et des preuves CI la source de vérité.
- 0626–0650 : Supply chain et provenance — prouver origine des builds et dépendances.
- 0651–0675 : Release engineering — promouvoir exactement l’artefact testé avec rollback.
- 0676–0700 : Systèmes distribués — concevoir pour latence, partitions et dépendances imparfaites.
- 0701–0725 : Concurrence et idempotence — rendre les retries sûrs et les courses explicites.
- 0726–0750 : Performance et caching — optimiser après mesure, sans casser cohérence.
- 0751–0775 : Auth, permissions et secrets — appliquer moindre privilège et credentials éphémères.
- 0776–0800 : State machines et jobs persistants — rendre transitions, retries et terminal states déterministes.
- 0801–0825 : Fine-tuning / LoRA — distinguer entraînement réel, compatibilité et qualité.
- 0826–0850 : Datasets et qualité des données — versionner données, labels, provenance et exclusions.
- 0851–0875 : Embeddings et recherche vectorielle — séparer similarité sémantique, filtres et vérité factuelle.
- 0876–0900 : Multimodal / audio / image / vidéo — conserver provenance, formats et limites modalité.
- 0901–0925 : Browser / computer use — séparer observation, décision et action avec confirmations.
- 0926–0950 : Hardware / protocoles — versionner protocole et prouver l’effet physique séparément.
- 0951–0975 : UX conversationnelle et accessibilité — répondre au bon niveau avec continuité et feedback.
- 0976–1000 : Incident response et documentation — transformer incidents en corrections et connaissances réutilisables.

## Règle après cycle 1000

Le corpus est désormais une base de consultation. Les runs MEL doivent revenir en priorité à l’audit/réparation/test du produit. Une nouvelle veille ne crée un nouveau cycle que si elle apporte un principe réellement nouveau; sinon elle met à jour la source ou confirme une leçon existante. Ne jamais gonfler artificiellement le compteur.