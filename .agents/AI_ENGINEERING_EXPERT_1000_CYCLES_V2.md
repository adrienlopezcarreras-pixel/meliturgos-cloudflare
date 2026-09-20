# MEL — Expert Track V2 : 1000 cycles avancés codage & IA

**AI_ENGINEERING_EXPERT_cycle_1000/1000 — COMPLETED**  
Date : 2026-09-20  
Cumul structuré : **2000 cycles** (1000 fondamentaux + 1000 expert V2).

Ces cycles constituent un corpus technique, pas un entraînement des poids du modèle ni une preuve d’implémentation. Une leçon devient XP validée uniquement après application réelle, tests et preuve runtime.

## Sources
- **F01** — OpenAI Agents SDK — https://openai.github.io/openai-agents-js/
- **F02** — OpenAI Agents tracing — https://openai.github.io/openai-agents-js/guides/tracing/
- **F03** — OpenAI Agents guardrails — https://openai.github.io/openai-agents-js/guides/guardrails/
- **F04** — OpenAI Agents handoffs — https://openai.github.io/openai-agents-js/guides/handoffs/
- **F05** — Anthropic effective agents — https://www.anthropic.com/engineering/building-effective-agents
- **F06** — Anthropic agent tools — https://www.anthropic.com/engineering/writing-tools-for-agents
- **F07** — MCP 2026-07-28 — https://blog.modelcontextprotocol.io/posts/2026-07-28/
- **F08** — Cloudflare Agents — https://developers.cloudflare.com/agents/runtime/agents-api/
- **F09** — Cloudflare Workflows — https://developers.cloudflare.com/workflows/
- **F10** — Cloudflare Durable Objects SQLite — https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- **F11** — Cloudflare Queues delivery — https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- **F12** — Cloudflare Queues retries/DLQ — https://developers.cloudflare.com/queues/configuration/dead-letter-queues/
- **F13** — Cloudflare D1 Sessions/read replication — https://developers.cloudflare.com/d1/best-practices/read-replication/
- **F14** — OpenTelemetry trace conventions — https://opentelemetry.io/docs/specs/semconv/general/trace/
- **F15** — OWASP GenAI Top 10 — https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/
- **F16** — OWASP Top 10:2025 — https://top10.owasp.org/2025/
- **F17** — NIST AI RMF GenAI Profile — https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence
- **F18** — GitHub artifact attestations — https://docs.github.com/en/actions/concepts/security/artifact-attestations
- **F19** — Sigstore Cosign — https://docs.sigstore.dev/cosign/
- **F20** — Google SRE canarying — https://sre.google/workbook/canarying-releases/
- **F21** — MEL repository truth — repo:.agents + CAPABILITY_MATRIX.json + tests/

## Cycles

## Boucle agentique

### AI_ENGINEERING_EXPERT_cycle_1/1000 — Boucle agentique × Invariants
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_2/1000 — Boucle agentique × Modèle d’état
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_3/1000 — Boucle agentique × Contrats
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_4/1000 — Boucle agentique × Validation
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_5/1000 — Boucle agentique × Taxonomie d’échec
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_6/1000 — Boucle agentique × Timeouts
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_7/1000 — Boucle agentique × Retries
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_8/1000 — Boucle agentique × Idempotence
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_9/1000 — Boucle agentique × Concurrence
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_10/1000 — Boucle agentique × Observabilité
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_11/1000 — Boucle agentique × Sécurité
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_12/1000 — Boucle agentique × Confidentialité
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_13/1000 — Boucle agentique × Evals
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_14/1000 — Boucle agentique × Property testing
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_15/1000 — Boucle agentique × Stress/chaos
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_16/1000 — Boucle agentique × Performance
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_17/1000 — Boucle agentique × Versioning
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_18/1000 — Boucle agentique × Recovery
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_19/1000 — Boucle agentique × Provenance
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_20/1000 — Boucle agentique × Application MEL
- **État raisonné** : perception-plan-action-observation-termination.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Boucle agentique.
- **Défaillance ciblée** : boucle infinie/faux succès.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F02, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Outils agents

### AI_ENGINEERING_EXPERT_cycle_21/1000 — Outils agents × Invariants
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_22/1000 — Outils agents × Modèle d’état
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_23/1000 — Outils agents × Contrats
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_24/1000 — Outils agents × Validation
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_25/1000 — Outils agents × Taxonomie d’échec
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_26/1000 — Outils agents × Timeouts
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_27/1000 — Outils agents × Retries
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_28/1000 — Outils agents × Idempotence
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_29/1000 — Outils agents × Concurrence
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_30/1000 — Outils agents × Observabilité
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_31/1000 — Outils agents × Sécurité
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_32/1000 — Outils agents × Confidentialité
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_33/1000 — Outils agents × Evals
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_34/1000 — Outils agents × Property testing
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_35/1000 — Outils agents × Stress/chaos
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_36/1000 — Outils agents × Performance
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_37/1000 — Outils agents × Versioning
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_38/1000 — Outils agents × Recovery
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_39/1000 — Outils agents × Provenance
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_40/1000 — Outils agents × Application MEL
- **État raisonné** : schéma-permissions-effets-résultat.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Outils agents.
- **Défaillance ciblée** : outil ambigu/mauvais effet.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F03, F06, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Handoffs

### AI_ENGINEERING_EXPERT_cycle_41/1000 — Handoffs × Invariants
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_42/1000 — Handoffs × Modèle d’état
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_43/1000 — Handoffs × Contrats
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_44/1000 — Handoffs × Validation
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_45/1000 — Handoffs × Taxonomie d’échec
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_46/1000 — Handoffs × Timeouts
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_47/1000 — Handoffs × Retries
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_48/1000 — Handoffs × Idempotence
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_49/1000 — Handoffs × Concurrence
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_50/1000 — Handoffs × Observabilité
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_51/1000 — Handoffs × Sécurité
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_52/1000 — Handoffs × Confidentialité
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_53/1000 — Handoffs × Evals
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_54/1000 — Handoffs × Property testing
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_55/1000 — Handoffs × Stress/chaos
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_56/1000 — Handoffs × Performance
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_57/1000 — Handoffs × Versioning
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_58/1000 — Handoffs × Recovery
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_59/1000 — Handoffs × Provenance
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_60/1000 — Handoffs × Application MEL
- **État raisonné** : source-cible-payload-autorité-retour.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Handoffs.
- **Défaillance ciblée** : mauvaise délégation/perte auth.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F04, F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Guardrails

### AI_ENGINEERING_EXPERT_cycle_61/1000 — Guardrails × Invariants
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_62/1000 — Guardrails × Modèle d’état
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_63/1000 — Guardrails × Contrats
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_64/1000 — Guardrails × Validation
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_65/1000 — Guardrails × Taxonomie d’échec
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_66/1000 — Guardrails × Timeouts
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_67/1000 — Guardrails × Retries
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_68/1000 — Guardrails × Idempotence
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_69/1000 — Guardrails × Concurrence
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_70/1000 — Guardrails × Observabilité
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_71/1000 — Guardrails × Sécurité
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_72/1000 — Guardrails × Confidentialité
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_73/1000 — Guardrails × Evals
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_74/1000 — Guardrails × Property testing
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_75/1000 — Guardrails × Stress/chaos
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_76/1000 — Guardrails × Performance
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_77/1000 — Guardrails × Versioning
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_78/1000 — Guardrails × Recovery
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_79/1000 — Guardrails × Provenance
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_80/1000 — Guardrails × Application MEL
- **État raisonné** : entrée-outil-sortie-tripwire.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Guardrails.
- **Défaillance ciblée** : contrôle trop tardif/surblocage.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## MCP avancé

### AI_ENGINEERING_EXPERT_cycle_81/1000 — MCP avancé × Invariants
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_82/1000 — MCP avancé × Modèle d’état
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_83/1000 — MCP avancé × Contrats
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_84/1000 — MCP avancé × Validation
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_85/1000 — MCP avancé × Taxonomie d’échec
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_86/1000 — MCP avancé × Timeouts
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_87/1000 — MCP avancé × Retries
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_88/1000 — MCP avancé × Idempotence
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_89/1000 — MCP avancé × Concurrence
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_90/1000 — MCP avancé × Observabilité
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_91/1000 — MCP avancé × Sécurité
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_92/1000 — MCP avancé × Confidentialité
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_93/1000 — MCP avancé × Evals
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_94/1000 — MCP avancé × Property testing
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_95/1000 — MCP avancé × Stress/chaos
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_96/1000 — MCP avancé × Performance
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_97/1000 — MCP avancé × Versioning
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_98/1000 — MCP avancé × Recovery
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_99/1000 — MCP avancé × Provenance
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_100/1000 — MCP avancé × Application MEL
- **État raisonné** : requête-routage-extension-scope.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à MCP avancé.
- **Défaillance ciblée** : confused deputy/tool confusion.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F07, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Context engineering

### AI_ENGINEERING_EXPERT_cycle_101/1000 — Context engineering × Invariants
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_102/1000 — Context engineering × Modèle d’état
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_103/1000 — Context engineering × Contrats
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_104/1000 — Context engineering × Validation
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_105/1000 — Context engineering × Taxonomie d’échec
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_106/1000 — Context engineering × Timeouts
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_107/1000 — Context engineering × Retries
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_108/1000 — Context engineering × Idempotence
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_109/1000 — Context engineering × Concurrence
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_110/1000 — Context engineering × Observabilité
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_111/1000 — Context engineering × Sécurité
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_112/1000 — Context engineering × Confidentialité
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_113/1000 — Context engineering × Evals
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_114/1000 — Context engineering × Property testing
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_115/1000 — Context engineering × Stress/chaos
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_116/1000 — Context engineering × Performance
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_117/1000 — Context engineering × Versioning
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_118/1000 — Context engineering × Recovery
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_119/1000 — Context engineering × Provenance
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_120/1000 — Context engineering × Application MEL
- **État raisonné** : instructions-focus-mémoire-outils-demande.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Context engineering.
- **Défaillance ciblée** : ancien contexte dominant.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Dialogue state

### AI_ENGINEERING_EXPERT_cycle_121/1000 — Dialogue state × Invariants
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_122/1000 — Dialogue state × Modèle d’état
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_123/1000 — Dialogue state × Contrats
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_124/1000 — Dialogue state × Validation
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_125/1000 — Dialogue state × Taxonomie d’échec
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_126/1000 — Dialogue state × Timeouts
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_127/1000 — Dialogue state × Retries
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_128/1000 — Dialogue state × Idempotence
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_129/1000 — Dialogue state × Concurrence
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_130/1000 — Dialogue state × Observabilité
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_131/1000 — Dialogue state × Sécurité
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_132/1000 — Dialogue state × Confidentialité
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_133/1000 — Dialogue state × Evals
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_134/1000 — Dialogue state × Property testing
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_135/1000 — Dialogue state × Stress/chaos
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_136/1000 — Dialogue state × Performance
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_137/1000 — Dialogue state × Versioning
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_138/1000 — Dialogue state × Recovery
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_139/1000 — Dialogue state × Provenance
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_140/1000 — Dialogue state × Application MEL
- **État raisonné** : sujet-sous-tâche-contraintes-exclusions.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Dialogue state.
- **Défaillance ciblée** : saut de sujet/oubli.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Mémoire IA

### AI_ENGINEERING_EXPERT_cycle_141/1000 — Mémoire IA × Invariants
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_142/1000 — Mémoire IA × Modèle d’état
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_143/1000 — Mémoire IA × Contrats
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_144/1000 — Mémoire IA × Validation
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_145/1000 — Mémoire IA × Taxonomie d’échec
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_146/1000 — Mémoire IA × Timeouts
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_147/1000 — Mémoire IA × Retries
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_148/1000 — Mémoire IA × Idempotence
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_149/1000 — Mémoire IA × Concurrence
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_150/1000 — Mémoire IA × Observabilité
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_151/1000 — Mémoire IA × Sécurité
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_152/1000 — Mémoire IA × Confidentialité
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_153/1000 — Mémoire IA × Evals
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_154/1000 — Mémoire IA × Property testing
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_155/1000 — Mémoire IA × Stress/chaos
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_156/1000 — Mémoire IA × Performance
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_157/1000 — Mémoire IA × Versioning
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_158/1000 — Mémoire IA × Recovery
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_159/1000 — Mémoire IA × Provenance
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_160/1000 — Mémoire IA × Application MEL
- **État raisonné** : archive-cognitive-active-provenance.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Mémoire IA.
- **Défaillance ciblée** : stale fact/duplication.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Conflits mémoire

### AI_ENGINEERING_EXPERT_cycle_161/1000 — Conflits mémoire × Invariants
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_162/1000 — Conflits mémoire × Modèle d’état
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_163/1000 — Conflits mémoire × Contrats
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_164/1000 — Conflits mémoire × Validation
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_165/1000 — Conflits mémoire × Taxonomie d’échec
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_166/1000 — Conflits mémoire × Timeouts
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_167/1000 — Conflits mémoire × Retries
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_168/1000 — Conflits mémoire × Idempotence
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_169/1000 — Conflits mémoire × Concurrence
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_170/1000 — Conflits mémoire × Observabilité
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_171/1000 — Conflits mémoire × Sécurité
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_172/1000 — Conflits mémoire × Confidentialité
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_173/1000 — Conflits mémoire × Evals
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_174/1000 — Conflits mémoire × Property testing
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_175/1000 — Conflits mémoire × Stress/chaos
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_176/1000 — Conflits mémoire × Performance
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_177/1000 — Conflits mémoire × Versioning
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_178/1000 — Conflits mémoire × Recovery
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_179/1000 — Conflits mémoire × Provenance
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_180/1000 — Conflits mémoire × Application MEL
- **État raisonné** : claim-source-temps-supersession.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Conflits mémoire.
- **Défaillance ciblée** : vérités incompatibles.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## RAG

### AI_ENGINEERING_EXPERT_cycle_181/1000 — RAG × Invariants
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_182/1000 — RAG × Modèle d’état
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_183/1000 — RAG × Contrats
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_184/1000 — RAG × Validation
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_185/1000 — RAG × Taxonomie d’échec
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_186/1000 — RAG × Timeouts
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_187/1000 — RAG × Retries
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_188/1000 — RAG × Idempotence
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_189/1000 — RAG × Concurrence
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_190/1000 — RAG × Observabilité
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_191/1000 — RAG × Sécurité
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_192/1000 — RAG × Confidentialité
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_193/1000 — RAG × Evals
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_194/1000 — RAG × Property testing
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_195/1000 — RAG × Stress/chaos
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_196/1000 — RAG × Performance
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_197/1000 — RAG × Versioning
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_198/1000 — RAG × Recovery
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_199/1000 — RAG × Provenance
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_200/1000 — RAG × Application MEL
- **État raisonné** : query-filtres-chunks-score-rôle.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à RAG.
- **Défaillance ciblée** : distracteurs/stale retrieval.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F15, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Embeddings

### AI_ENGINEERING_EXPERT_cycle_201/1000 — Embeddings × Invariants
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_202/1000 — Embeddings × Modèle d’état
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_203/1000 — Embeddings × Contrats
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_204/1000 — Embeddings × Validation
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_205/1000 — Embeddings × Taxonomie d’échec
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_206/1000 — Embeddings × Timeouts
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_207/1000 — Embeddings × Retries
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_208/1000 — Embeddings × Idempotence
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_209/1000 — Embeddings × Concurrence
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_210/1000 — Embeddings × Observabilité
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_211/1000 — Embeddings × Sécurité
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_212/1000 — Embeddings × Confidentialité
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_213/1000 — Embeddings × Evals
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_214/1000 — Embeddings × Property testing
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_215/1000 — Embeddings × Stress/chaos
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_216/1000 — Embeddings × Performance
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_217/1000 — Embeddings × Versioning
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_218/1000 — Embeddings × Recovery
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_219/1000 — Embeddings × Provenance
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_220/1000 — Embeddings × Application MEL
- **État raisonné** : version-chunk-hash-metadata.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Embeddings.
- **Défaillance ciblée** : index mélangé/stale.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Grounding

### AI_ENGINEERING_EXPERT_cycle_221/1000 — Grounding × Invariants
- **État raisonné** : claim-evidence-time-source.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_222/1000 — Grounding × Modèle d’état
- **État raisonné** : claim-evidence-time-source.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_223/1000 — Grounding × Contrats
- **État raisonné** : claim-evidence-time-source.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_224/1000 — Grounding × Validation
- **État raisonné** : claim-evidence-time-source.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_225/1000 — Grounding × Taxonomie d’échec
- **État raisonné** : claim-evidence-time-source.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_226/1000 — Grounding × Timeouts
- **État raisonné** : claim-evidence-time-source.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_227/1000 — Grounding × Retries
- **État raisonné** : claim-evidence-time-source.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_228/1000 — Grounding × Idempotence
- **État raisonné** : claim-evidence-time-source.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_229/1000 — Grounding × Concurrence
- **État raisonné** : claim-evidence-time-source.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_230/1000 — Grounding × Observabilité
- **État raisonné** : claim-evidence-time-source.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_231/1000 — Grounding × Sécurité
- **État raisonné** : claim-evidence-time-source.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_232/1000 — Grounding × Confidentialité
- **État raisonné** : claim-evidence-time-source.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_233/1000 — Grounding × Evals
- **État raisonné** : claim-evidence-time-source.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_234/1000 — Grounding × Property testing
- **État raisonné** : claim-evidence-time-source.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_235/1000 — Grounding × Stress/chaos
- **État raisonné** : claim-evidence-time-source.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_236/1000 — Grounding × Performance
- **État raisonné** : claim-evidence-time-source.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_237/1000 — Grounding × Versioning
- **État raisonné** : claim-evidence-time-source.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_238/1000 — Grounding × Recovery
- **État raisonné** : claim-evidence-time-source.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_239/1000 — Grounding × Provenance
- **État raisonné** : claim-evidence-time-source.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_240/1000 — Grounding × Application MEL
- **État raisonné** : claim-evidence-time-source.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Grounding.
- **Défaillance ciblée** : hallucination d’état.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F02, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Capability truth

### AI_ENGINEERING_EXPERT_cycle_241/1000 — Capability truth × Invariants
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_242/1000 — Capability truth × Modèle d’état
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_243/1000 — Capability truth × Contrats
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_244/1000 — Capability truth × Validation
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_245/1000 — Capability truth × Taxonomie d’échec
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_246/1000 — Capability truth × Timeouts
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_247/1000 — Capability truth × Retries
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_248/1000 — Capability truth × Idempotence
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_249/1000 — Capability truth × Concurrence
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_250/1000 — Capability truth × Observabilité
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_251/1000 — Capability truth × Sécurité
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_252/1000 — Capability truth × Confidentialité
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_253/1000 — Capability truth × Evals
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_254/1000 — Capability truth × Property testing
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_255/1000 — Capability truth × Stress/chaos
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_256/1000 — Capability truth × Performance
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_257/1000 — Capability truth × Versioning
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_258/1000 — Capability truth × Recovery
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_259/1000 — Capability truth × Provenance
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_260/1000 — Capability truth × Application MEL
- **État raisonné** : id-enabled-health-tests-runtime.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Capability truth.
- **Défaillance ciblée** : HEALTHY pris pour E2E.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Self-state

### AI_ENGINEERING_EXPERT_cycle_261/1000 — Self-state × Invariants
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_262/1000 — Self-state × Modèle d’état
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_263/1000 — Self-state × Contrats
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_264/1000 — Self-state × Validation
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_265/1000 — Self-state × Taxonomie d’échec
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_266/1000 — Self-state × Timeouts
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_267/1000 — Self-state × Retries
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_268/1000 — Self-state × Idempotence
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_269/1000 — Self-state × Concurrence
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_270/1000 — Self-state × Observabilité
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_271/1000 — Self-state × Sécurité
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_272/1000 — Self-state × Confidentialité
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_273/1000 — Self-state × Evals
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_274/1000 — Self-state × Property testing
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_275/1000 — Self-state × Stress/chaos
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_276/1000 — Self-state × Performance
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_277/1000 — Self-state × Versioning
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_278/1000 — Self-state × Recovery
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_279/1000 — Self-state × Provenance
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_280/1000 — Self-state × Application MEL
- **État raisonné** : branch-SHA-jobs-bindings-incidents.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Self-state.
- **Défaillance ciblée** : introspection sans preuve.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F02, F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Evals comportementales

### AI_ENGINEERING_EXPERT_cycle_281/1000 — Evals comportementales × Invariants
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_282/1000 — Evals comportementales × Modèle d’état
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_283/1000 — Evals comportementales × Contrats
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_284/1000 — Evals comportementales × Validation
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_285/1000 — Evals comportementales × Taxonomie d’échec
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_286/1000 — Evals comportementales × Timeouts
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_287/1000 — Evals comportementales × Retries
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_288/1000 — Evals comportementales × Idempotence
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_289/1000 — Evals comportementales × Concurrence
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_290/1000 — Evals comportementales × Observabilité
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_291/1000 — Evals comportementales × Sécurité
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_292/1000 — Evals comportementales × Confidentialité
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_293/1000 — Evals comportementales × Evals
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_294/1000 — Evals comportementales × Property testing
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_295/1000 — Evals comportementales × Stress/chaos
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_296/1000 — Evals comportementales × Performance
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_297/1000 — Evals comportementales × Versioning
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_298/1000 — Evals comportementales × Recovery
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_299/1000 — Evals comportementales × Provenance
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_300/1000 — Evals comportementales × Application MEL
- **État raisonné** : dataset-rubric-oracle-baseline.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Evals comportementales.
- **Défaillance ciblée** : benchmark trompeur.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F06, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Evals trajectoires

### AI_ENGINEERING_EXPERT_cycle_301/1000 — Evals trajectoires × Invariants
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_302/1000 — Evals trajectoires × Modèle d’état
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_303/1000 — Evals trajectoires × Contrats
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_304/1000 — Evals trajectoires × Validation
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_305/1000 — Evals trajectoires × Taxonomie d’échec
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_306/1000 — Evals trajectoires × Timeouts
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_307/1000 — Evals trajectoires × Retries
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_308/1000 — Evals trajectoires × Idempotence
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_309/1000 — Evals trajectoires × Concurrence
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_310/1000 — Evals trajectoires × Observabilité
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_311/1000 — Evals trajectoires × Sécurité
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_312/1000 — Evals trajectoires × Confidentialité
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_313/1000 — Evals trajectoires × Evals
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_314/1000 — Evals trajectoires × Property testing
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_315/1000 — Evals trajectoires × Stress/chaos
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_316/1000 — Evals trajectoires × Performance
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_317/1000 — Evals trajectoires × Versioning
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_318/1000 — Evals trajectoires × Recovery
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_319/1000 — Evals trajectoires × Provenance
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_320/1000 — Evals trajectoires × Application MEL
- **État raisonné** : trace-tools-étapes-postcondition.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Evals trajectoires.
- **Défaillance ciblée** : bon résultat par hasard.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F02, F06.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Evals adversariales

### AI_ENGINEERING_EXPERT_cycle_321/1000 — Evals adversariales × Invariants
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_322/1000 — Evals adversariales × Modèle d’état
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_323/1000 — Evals adversariales × Contrats
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_324/1000 — Evals adversariales × Validation
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_325/1000 — Evals adversariales × Taxonomie d’échec
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_326/1000 — Evals adversariales × Timeouts
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_327/1000 — Evals adversariales × Retries
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_328/1000 — Evals adversariales × Idempotence
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_329/1000 — Evals adversariales × Concurrence
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_330/1000 — Evals adversariales × Observabilité
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_331/1000 — Evals adversariales × Sécurité
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_332/1000 — Evals adversariales × Confidentialité
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_333/1000 — Evals adversariales × Evals
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_334/1000 — Evals adversariales × Property testing
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_335/1000 — Evals adversariales × Stress/chaos
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_336/1000 — Evals adversariales × Performance
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_337/1000 — Evals adversariales × Versioning
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_338/1000 — Evals adversariales × Recovery
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_339/1000 — Evals adversariales × Provenance
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_340/1000 — Evals adversariales × Application MEL
- **État raisonné** : attacks-mutations-oracle-regression.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Evals adversariales.
- **Défaillance ciblée** : sur-ajustement sécurité.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F15, F16, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Tracing

### AI_ENGINEERING_EXPERT_cycle_341/1000 — Tracing × Invariants
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_342/1000 — Tracing × Modèle d’état
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_343/1000 — Tracing × Contrats
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_344/1000 — Tracing × Validation
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_345/1000 — Tracing × Taxonomie d’échec
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_346/1000 — Tracing × Timeouts
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_347/1000 — Tracing × Retries
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_348/1000 — Tracing × Idempotence
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_349/1000 — Tracing × Concurrence
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_350/1000 — Tracing × Observabilité
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_351/1000 — Tracing × Sécurité
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_352/1000 — Tracing × Confidentialité
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_353/1000 — Tracing × Evals
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_354/1000 — Tracing × Property testing
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_355/1000 — Tracing × Stress/chaos
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_356/1000 — Tracing × Performance
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_357/1000 — Tracing × Versioning
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_358/1000 — Tracing × Recovery
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_359/1000 — Tracing × Provenance
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_360/1000 — Tracing × Application MEL
- **État raisonné** : trace-span-attributs-erreurs-parent.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Tracing.
- **Défaillance ciblée** : causalité perdue/PII.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F02, F14.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Observabilité

### AI_ENGINEERING_EXPERT_cycle_361/1000 — Observabilité × Invariants
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_362/1000 — Observabilité × Modèle d’état
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_363/1000 — Observabilité × Contrats
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_364/1000 — Observabilité × Validation
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_365/1000 — Observabilité × Taxonomie d’échec
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_366/1000 — Observabilité × Timeouts
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_367/1000 — Observabilité × Retries
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_368/1000 — Observabilité × Idempotence
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_369/1000 — Observabilité × Concurrence
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_370/1000 — Observabilité × Observabilité
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_371/1000 — Observabilité × Sécurité
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_372/1000 — Observabilité × Confidentialité
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_373/1000 — Observabilité × Evals
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_374/1000 — Observabilité × Property testing
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_375/1000 — Observabilité × Stress/chaos
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_376/1000 — Observabilité × Performance
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_377/1000 — Observabilité × Versioning
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_378/1000 — Observabilité × Recovery
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_379/1000 — Observabilité × Provenance
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_380/1000 — Observabilité × Application MEL
- **État raisonné** : SLO-metrics-logs-traces-events.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Observabilité.
- **Défaillance ciblée** : alert fatigue/signal faible.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F14, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Workflows durables

### AI_ENGINEERING_EXPERT_cycle_381/1000 — Workflows durables × Invariants
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_382/1000 — Workflows durables × Modèle d’état
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_383/1000 — Workflows durables × Contrats
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_384/1000 — Workflows durables × Validation
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_385/1000 — Workflows durables × Taxonomie d’échec
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_386/1000 — Workflows durables × Timeouts
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_387/1000 — Workflows durables × Retries
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_388/1000 — Workflows durables × Idempotence
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_389/1000 — Workflows durables × Concurrence
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_390/1000 — Workflows durables × Observabilité
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_391/1000 — Workflows durables × Sécurité
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_392/1000 — Workflows durables × Confidentialité
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_393/1000 — Workflows durables × Evals
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_394/1000 — Workflows durables × Property testing
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_395/1000 — Workflows durables × Stress/chaos
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_396/1000 — Workflows durables × Performance
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_397/1000 — Workflows durables × Versioning
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_398/1000 — Workflows durables × Recovery
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_399/1000 — Workflows durables × Provenance
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_400/1000 — Workflows durables × Application MEL
- **État raisonné** : workflow-steps-checkpoints-waits.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Workflows durables.
- **Défaillance ciblée** : restart from zero/double effet.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F09, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Queues

### AI_ENGINEERING_EXPERT_cycle_401/1000 — Queues × Invariants
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_402/1000 — Queues × Modèle d’état
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_403/1000 — Queues × Contrats
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_404/1000 — Queues × Validation
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_405/1000 — Queues × Taxonomie d’échec
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_406/1000 — Queues × Timeouts
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_407/1000 — Queues × Retries
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_408/1000 — Queues × Idempotence
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_409/1000 — Queues × Concurrence
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_410/1000 — Queues × Observabilité
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_411/1000 — Queues × Sécurité
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_412/1000 — Queues × Confidentialité
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_413/1000 — Queues × Evals
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_414/1000 — Queues × Property testing
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_415/1000 — Queues × Stress/chaos
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_416/1000 — Queues × Performance
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_417/1000 — Queues × Versioning
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_418/1000 — Queues × Recovery
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_419/1000 — Queues × Provenance
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_420/1000 — Queues × Application MEL
- **État raisonné** : message-attempt-ack-idempotency-DLQ.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Queues.
- **Défaillance ciblée** : redelivery/double effet.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F11, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Durable Objects

### AI_ENGINEERING_EXPERT_cycle_421/1000 — Durable Objects × Invariants
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_422/1000 — Durable Objects × Modèle d’état
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_423/1000 — Durable Objects × Contrats
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_424/1000 — Durable Objects × Validation
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_425/1000 — Durable Objects × Taxonomie d’échec
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_426/1000 — Durable Objects × Timeouts
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_427/1000 — Durable Objects × Retries
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_428/1000 — Durable Objects × Idempotence
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_429/1000 — Durable Objects × Concurrence
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_430/1000 — Durable Objects × Observabilité
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_431/1000 — Durable Objects × Sécurité
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_432/1000 — Durable Objects × Confidentialité
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_433/1000 — Durable Objects × Evals
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_434/1000 — Durable Objects × Property testing
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_435/1000 — Durable Objects × Stress/chaos
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_436/1000 — Durable Objects × Performance
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_437/1000 — Durable Objects × Versioning
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_438/1000 — Durable Objects × Recovery
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_439/1000 — Durable Objects × Provenance
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_440/1000 — Durable Objects × Application MEL
- **État raisonné** : object-id-SQLite-gates-alarms.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Durable Objects.
- **Défaillance ciblée** : race/hotspot.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F08, F10.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## D1 cohérence

### AI_ENGINEERING_EXPERT_cycle_441/1000 — D1 cohérence × Invariants
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_442/1000 — D1 cohérence × Modèle d’état
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_443/1000 — D1 cohérence × Contrats
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_444/1000 — D1 cohérence × Validation
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_445/1000 — D1 cohérence × Taxonomie d’échec
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_446/1000 — D1 cohérence × Timeouts
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_447/1000 — D1 cohérence × Retries
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_448/1000 — D1 cohérence × Idempotence
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_449/1000 — D1 cohérence × Concurrence
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_450/1000 — D1 cohérence × Observabilité
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_451/1000 — D1 cohérence × Sécurité
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_452/1000 — D1 cohérence × Confidentialité
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_453/1000 — D1 cohérence × Evals
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_454/1000 — D1 cohérence × Property testing
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_455/1000 — D1 cohérence × Stress/chaos
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_456/1000 — D1 cohérence × Performance
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_457/1000 — D1 cohérence × Versioning
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_458/1000 — D1 cohérence × Recovery
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_459/1000 — D1 cohérence × Provenance
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_460/1000 — D1 cohérence × Application MEL
- **État raisonné** : session-bookmark-primary-replica.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à D1 cohérence.
- **Défaillance ciblée** : stale read.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Schémas SQL

### AI_ENGINEERING_EXPERT_cycle_461/1000 — Schémas SQL × Invariants
- **État raisonné** : version-migration-index-default.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_462/1000 — Schémas SQL × Modèle d’état
- **État raisonné** : version-migration-index-default.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_463/1000 — Schémas SQL × Contrats
- **État raisonné** : version-migration-index-default.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_464/1000 — Schémas SQL × Validation
- **État raisonné** : version-migration-index-default.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_465/1000 — Schémas SQL × Taxonomie d’échec
- **État raisonné** : version-migration-index-default.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_466/1000 — Schémas SQL × Timeouts
- **État raisonné** : version-migration-index-default.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_467/1000 — Schémas SQL × Retries
- **État raisonné** : version-migration-index-default.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_468/1000 — Schémas SQL × Idempotence
- **État raisonné** : version-migration-index-default.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_469/1000 — Schémas SQL × Concurrence
- **État raisonné** : version-migration-index-default.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_470/1000 — Schémas SQL × Observabilité
- **État raisonné** : version-migration-index-default.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_471/1000 — Schémas SQL × Sécurité
- **État raisonné** : version-migration-index-default.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_472/1000 — Schémas SQL × Confidentialité
- **État raisonné** : version-migration-index-default.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_473/1000 — Schémas SQL × Evals
- **État raisonné** : version-migration-index-default.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_474/1000 — Schémas SQL × Property testing
- **État raisonné** : version-migration-index-default.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_475/1000 — Schémas SQL × Stress/chaos
- **État raisonné** : version-migration-index-default.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_476/1000 — Schémas SQL × Performance
- **État raisonné** : version-migration-index-default.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_477/1000 — Schémas SQL × Versioning
- **État raisonné** : version-migration-index-default.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_478/1000 — Schémas SQL × Recovery
- **État raisonné** : version-migration-index-default.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_479/1000 — Schémas SQL × Provenance
- **État raisonné** : version-migration-index-default.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_480/1000 — Schémas SQL × Application MEL
- **État raisonné** : version-migration-index-default.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Schémas SQL.
- **Défaillance ciblée** : schema drift/lazy create.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## API contracts

### AI_ENGINEERING_EXPERT_cycle_481/1000 — API contracts × Invariants
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_482/1000 — API contracts × Modèle d’état
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_483/1000 — API contracts × Contrats
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_484/1000 — API contracts × Validation
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_485/1000 — API contracts × Taxonomie d’échec
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_486/1000 — API contracts × Timeouts
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_487/1000 — API contracts × Retries
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_488/1000 — API contracts × Idempotence
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_489/1000 — API contracts × Concurrence
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_490/1000 — API contracts × Observabilité
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_491/1000 — API contracts × Sécurité
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_492/1000 — API contracts × Confidentialité
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_493/1000 — API contracts × Evals
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_494/1000 — API contracts × Property testing
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_495/1000 — API contracts × Stress/chaos
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_496/1000 — API contracts × Performance
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_497/1000 — API contracts × Versioning
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_498/1000 — API contracts × Recovery
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_499/1000 — API contracts × Provenance
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_500/1000 — API contracts × Application MEL
- **État raisonné** : route-method-auth-schema-errors.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à API contracts.
- **Défaillance ciblée** : breaking change/faux 200.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F16, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## TypeScript

### AI_ENGINEERING_EXPERT_cycle_501/1000 — TypeScript × Invariants
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_502/1000 — TypeScript × Modèle d’état
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_503/1000 — TypeScript × Contrats
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_504/1000 — TypeScript × Validation
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_505/1000 — TypeScript × Taxonomie d’échec
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_506/1000 — TypeScript × Timeouts
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_507/1000 — TypeScript × Retries
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_508/1000 — TypeScript × Idempotence
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_509/1000 — TypeScript × Concurrence
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_510/1000 — TypeScript × Observabilité
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_511/1000 — TypeScript × Sécurité
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_512/1000 — TypeScript × Confidentialité
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_513/1000 — TypeScript × Evals
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_514/1000 — TypeScript × Property testing
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_515/1000 — TypeScript × Stress/chaos
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_516/1000 — TypeScript × Performance
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_517/1000 — TypeScript × Versioning
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_518/1000 — TypeScript × Recovery
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_519/1000 — TypeScript × Provenance
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_520/1000 — TypeScript × Application MEL
- **État raisonné** : unions-branded-ids-narrowing-schema.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à TypeScript.
- **Défaillance ciblée** : any/runtime mismatch.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Node runtime

### AI_ENGINEERING_EXPERT_cycle_521/1000 — Node runtime × Invariants
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_522/1000 — Node runtime × Modèle d’état
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_523/1000 — Node runtime × Contrats
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_524/1000 — Node runtime × Validation
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_525/1000 — Node runtime × Taxonomie d’échec
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_526/1000 — Node runtime × Timeouts
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_527/1000 — Node runtime × Retries
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_528/1000 — Node runtime × Idempotence
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_529/1000 — Node runtime × Concurrence
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_530/1000 — Node runtime × Observabilité
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_531/1000 — Node runtime × Sécurité
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_532/1000 — Node runtime × Confidentialité
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_533/1000 — Node runtime × Evals
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_534/1000 — Node runtime × Property testing
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_535/1000 — Node runtime × Stress/chaos
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_536/1000 — Node runtime × Performance
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_537/1000 — Node runtime × Versioning
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_538/1000 — Node runtime × Recovery
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_539/1000 — Node runtime × Provenance
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_540/1000 — Node runtime × Application MEL
- **État raisonné** : event-loop-workers-async-context.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Node runtime.
- **Défaillance ciblée** : blocage/leak handle.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F14, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Concurrence

### AI_ENGINEERING_EXPERT_cycle_541/1000 — Concurrence × Invariants
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_542/1000 — Concurrence × Modèle d’état
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_543/1000 — Concurrence × Contrats
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_544/1000 — Concurrence × Validation
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_545/1000 — Concurrence × Taxonomie d’échec
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_546/1000 — Concurrence × Timeouts
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_547/1000 — Concurrence × Retries
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_548/1000 — Concurrence × Idempotence
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_549/1000 — Concurrence × Concurrence
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_550/1000 — Concurrence × Observabilité
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_551/1000 — Concurrence × Sécurité
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_552/1000 — Concurrence × Confidentialité
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_553/1000 — Concurrence × Evals
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_554/1000 — Concurrence × Property testing
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_555/1000 — Concurrence × Stress/chaos
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_556/1000 — Concurrence × Performance
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_557/1000 — Concurrence × Versioning
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_558/1000 — Concurrence × Recovery
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_559/1000 — Concurrence × Provenance
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_560/1000 — Concurrence × Application MEL
- **État raisonné** : version-lease-lock-transaction-CAS.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Concurrence.
- **Défaillance ciblée** : lost update/split brain.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F10, F13, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Idempotence

### AI_ENGINEERING_EXPERT_cycle_561/1000 — Idempotence × Invariants
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_562/1000 — Idempotence × Modèle d’état
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_563/1000 — Idempotence × Contrats
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_564/1000 — Idempotence × Validation
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_565/1000 — Idempotence × Taxonomie d’échec
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_566/1000 — Idempotence × Timeouts
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_567/1000 — Idempotence × Retries
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_568/1000 — Idempotence × Idempotence
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_569/1000 — Idempotence × Concurrence
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_570/1000 — Idempotence × Observabilité
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_571/1000 — Idempotence × Sécurité
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_572/1000 — Idempotence × Confidentialité
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_573/1000 — Idempotence × Evals
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_574/1000 — Idempotence × Property testing
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_575/1000 — Idempotence × Stress/chaos
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_576/1000 — Idempotence × Performance
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_577/1000 — Idempotence × Versioning
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_578/1000 — Idempotence × Recovery
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_579/1000 — Idempotence × Provenance
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_580/1000 — Idempotence × Application MEL
- **État raisonné** : operation-id-dedup-side-effect-result.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Idempotence.
- **Défaillance ciblée** : double mutation.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F11, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Retries/deadlines

### AI_ENGINEERING_EXPERT_cycle_581/1000 — Retries/deadlines × Invariants
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_582/1000 — Retries/deadlines × Modèle d’état
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_583/1000 — Retries/deadlines × Contrats
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_584/1000 — Retries/deadlines × Validation
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_585/1000 — Retries/deadlines × Taxonomie d’échec
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_586/1000 — Retries/deadlines × Timeouts
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_587/1000 — Retries/deadlines × Retries
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_588/1000 — Retries/deadlines × Idempotence
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_589/1000 — Retries/deadlines × Concurrence
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_590/1000 — Retries/deadlines × Observabilité
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_591/1000 — Retries/deadlines × Sécurité
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_592/1000 — Retries/deadlines × Confidentialité
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_593/1000 — Retries/deadlines × Evals
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_594/1000 — Retries/deadlines × Property testing
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_595/1000 — Retries/deadlines × Stress/chaos
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_596/1000 — Retries/deadlines × Performance
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_597/1000 — Retries/deadlines × Versioning
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_598/1000 — Retries/deadlines × Recovery
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_599/1000 — Retries/deadlines × Provenance
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_600/1000 — Retries/deadlines × Application MEL
- **État raisonné** : deadline-budget-jitter-error-class.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Retries/deadlines.
- **Défaillance ciblée** : retry storm/boucle.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F09, F12.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Systèmes distribués

### AI_ENGINEERING_EXPERT_cycle_601/1000 — Systèmes distribués × Invariants
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_602/1000 — Systèmes distribués × Modèle d’état
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_603/1000 — Systèmes distribués × Contrats
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_604/1000 — Systèmes distribués × Validation
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_605/1000 — Systèmes distribués × Taxonomie d’échec
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_606/1000 — Systèmes distribués × Timeouts
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_607/1000 — Systèmes distribués × Retries
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_608/1000 — Systèmes distribués × Idempotence
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_609/1000 — Systèmes distribués × Concurrence
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_610/1000 — Systèmes distribués × Observabilité
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_611/1000 — Systèmes distribués × Sécurité
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_612/1000 — Systèmes distribués × Confidentialité
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_613/1000 — Systèmes distribués × Evals
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_614/1000 — Systèmes distribués × Property testing
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_615/1000 — Systèmes distribués × Stress/chaos
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_616/1000 — Systèmes distribués × Performance
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_617/1000 — Systèmes distribués × Versioning
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_618/1000 — Systèmes distribués × Recovery
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_619/1000 — Systèmes distribués × Provenance
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_620/1000 — Systèmes distribués × Application MEL
- **État raisonné** : deps-consistency-timeout-fallback.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Systèmes distribués.
- **Défaillance ciblée** : cascade/thundering herd.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F10, F11, F13, F20.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Model routing

### AI_ENGINEERING_EXPERT_cycle_621/1000 — Model routing × Invariants
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_622/1000 — Model routing × Modèle d’état
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_623/1000 — Model routing × Contrats
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_624/1000 — Model routing × Validation
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_625/1000 — Model routing × Taxonomie d’échec
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_626/1000 — Model routing × Timeouts
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_627/1000 — Model routing × Retries
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_628/1000 — Model routing × Idempotence
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_629/1000 — Model routing × Concurrence
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_630/1000 — Model routing × Observabilité
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_631/1000 — Model routing × Sécurité
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_632/1000 — Model routing × Confidentialité
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_633/1000 — Model routing × Evals
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_634/1000 — Model routing × Property testing
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_635/1000 — Model routing × Stress/chaos
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_636/1000 — Model routing × Performance
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_637/1000 — Model routing × Versioning
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_638/1000 — Model routing × Recovery
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_639/1000 — Model routing × Provenance
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_640/1000 — Model routing × Application MEL
- **État raisonné** : task-provider-benchmark-cost-fallback.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Model routing.
- **Défaillance ciblée** : route statique/provider faux.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Multi-agent

### AI_ENGINEERING_EXPERT_cycle_641/1000 — Multi-agent × Invariants
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_642/1000 — Multi-agent × Modèle d’état
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_643/1000 — Multi-agent × Contrats
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_644/1000 — Multi-agent × Validation
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_645/1000 — Multi-agent × Taxonomie d’échec
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_646/1000 — Multi-agent × Timeouts
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_647/1000 — Multi-agent × Retries
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_648/1000 — Multi-agent × Idempotence
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_649/1000 — Multi-agent × Concurrence
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_650/1000 — Multi-agent × Observabilité
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_651/1000 — Multi-agent × Sécurité
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_652/1000 — Multi-agent × Confidentialité
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_653/1000 — Multi-agent × Evals
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_654/1000 — Multi-agent × Property testing
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_655/1000 — Multi-agent × Stress/chaos
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_656/1000 — Multi-agent × Performance
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_657/1000 — Multi-agent × Versioning
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_658/1000 — Multi-agent × Recovery
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_659/1000 — Multi-agent × Provenance
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_660/1000 — Multi-agent × Application MEL
- **État raisonné** : lot-owner-deps-evidence-merge.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Multi-agent.
- **Défaillance ciblée** : duplication/conflits.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F04, F05, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Codage autonome

### AI_ENGINEERING_EXPERT_cycle_661/1000 — Codage autonome × Invariants
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_662/1000 — Codage autonome × Modèle d’état
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_663/1000 — Codage autonome × Contrats
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_664/1000 — Codage autonome × Validation
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_665/1000 — Codage autonome × Taxonomie d’échec
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_666/1000 — Codage autonome × Timeouts
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_667/1000 — Codage autonome × Retries
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_668/1000 — Codage autonome × Idempotence
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_669/1000 — Codage autonome × Concurrence
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_670/1000 — Codage autonome × Observabilité
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_671/1000 — Codage autonome × Sécurité
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_672/1000 — Codage autonome × Confidentialité
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_673/1000 — Codage autonome × Evals
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_674/1000 — Codage autonome × Property testing
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_675/1000 — Codage autonome × Stress/chaos
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_676/1000 — Codage autonome × Performance
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_677/1000 — Codage autonome × Versioning
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_678/1000 — Codage autonome × Recovery
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_679/1000 — Codage autonome × Provenance
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_680/1000 — Codage autonome × Application MEL
- **État raisonné** : goal-repo-patch-tests-SHA-approval.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Codage autonome.
- **Défaillance ciblée** : wrong SHA/patch sans preuve.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F06, F18, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Code review IA

### AI_ENGINEERING_EXPERT_cycle_681/1000 — Code review IA × Invariants
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_682/1000 — Code review IA × Modèle d’état
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_683/1000 — Code review IA × Contrats
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_684/1000 — Code review IA × Validation
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_685/1000 — Code review IA × Taxonomie d’échec
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_686/1000 — Code review IA × Timeouts
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_687/1000 — Code review IA × Retries
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_688/1000 — Code review IA × Idempotence
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_689/1000 — Code review IA × Concurrence
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_690/1000 — Code review IA × Observabilité
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_691/1000 — Code review IA × Sécurité
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_692/1000 — Code review IA × Confidentialité
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_693/1000 — Code review IA × Evals
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_694/1000 — Code review IA × Property testing
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_695/1000 — Code review IA × Stress/chaos
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_696/1000 — Code review IA × Performance
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_697/1000 — Code review IA × Versioning
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_698/1000 — Code review IA × Recovery
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_699/1000 — Code review IA × Provenance
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_700/1000 — Code review IA × Application MEL
- **État raisonné** : diff-contracts-tests-security-migrations.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Code review IA.
- **Défaillance ciblée** : review cosmétique.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F16, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## LoRA/fine-tuning

### AI_ENGINEERING_EXPERT_cycle_701/1000 — LoRA/fine-tuning × Invariants
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_702/1000 — LoRA/fine-tuning × Modèle d’état
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_703/1000 — LoRA/fine-tuning × Contrats
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_704/1000 — LoRA/fine-tuning × Validation
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_705/1000 — LoRA/fine-tuning × Taxonomie d’échec
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_706/1000 — LoRA/fine-tuning × Timeouts
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_707/1000 — LoRA/fine-tuning × Retries
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_708/1000 — LoRA/fine-tuning × Idempotence
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_709/1000 — LoRA/fine-tuning × Concurrence
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_710/1000 — LoRA/fine-tuning × Observabilité
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_711/1000 — LoRA/fine-tuning × Sécurité
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_712/1000 — LoRA/fine-tuning × Confidentialité
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_713/1000 — LoRA/fine-tuning × Evals
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_714/1000 — LoRA/fine-tuning × Property testing
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_715/1000 — LoRA/fine-tuning × Stress/chaos
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_716/1000 — LoRA/fine-tuning × Performance
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_717/1000 — LoRA/fine-tuning × Versioning
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_718/1000 — LoRA/fine-tuning × Recovery
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_719/1000 — LoRA/fine-tuning × Provenance
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_720/1000 — LoRA/fine-tuning × Application MEL
- **État raisonné** : base-data-adapter-eval-activation.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à LoRA/fine-tuning.
- **Défaillance ciblée** : adapter non chargé/leakage.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Data quality

### AI_ENGINEERING_EXPERT_cycle_721/1000 — Data quality × Invariants
- **État raisonné** : record-source-consent-label-split.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_722/1000 — Data quality × Modèle d’état
- **État raisonné** : record-source-consent-label-split.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_723/1000 — Data quality × Contrats
- **État raisonné** : record-source-consent-label-split.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_724/1000 — Data quality × Validation
- **État raisonné** : record-source-consent-label-split.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_725/1000 — Data quality × Taxonomie d’échec
- **État raisonné** : record-source-consent-label-split.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_726/1000 — Data quality × Timeouts
- **État raisonné** : record-source-consent-label-split.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_727/1000 — Data quality × Retries
- **État raisonné** : record-source-consent-label-split.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_728/1000 — Data quality × Idempotence
- **État raisonné** : record-source-consent-label-split.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_729/1000 — Data quality × Concurrence
- **État raisonné** : record-source-consent-label-split.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_730/1000 — Data quality × Observabilité
- **État raisonné** : record-source-consent-label-split.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_731/1000 — Data quality × Sécurité
- **État raisonné** : record-source-consent-label-split.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_732/1000 — Data quality × Confidentialité
- **État raisonné** : record-source-consent-label-split.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_733/1000 — Data quality × Evals
- **État raisonné** : record-source-consent-label-split.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_734/1000 — Data quality × Property testing
- **État raisonné** : record-source-consent-label-split.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_735/1000 — Data quality × Stress/chaos
- **État raisonné** : record-source-consent-label-split.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_736/1000 — Data quality × Performance
- **État raisonné** : record-source-consent-label-split.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_737/1000 — Data quality × Versioning
- **État raisonné** : record-source-consent-label-split.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_738/1000 — Data quality × Recovery
- **État raisonné** : record-source-consent-label-split.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_739/1000 — Data quality × Provenance
- **État raisonné** : record-source-consent-label-split.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_740/1000 — Data quality × Application MEL
- **État raisonné** : record-source-consent-label-split.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Data quality.
- **Défaillance ciblée** : train/eval leakage/poisoning.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Prompt injection

### AI_ENGINEERING_EXPERT_cycle_741/1000 — Prompt injection × Invariants
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_742/1000 — Prompt injection × Modèle d’état
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_743/1000 — Prompt injection × Contrats
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_744/1000 — Prompt injection × Validation
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_745/1000 — Prompt injection × Taxonomie d’échec
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_746/1000 — Prompt injection × Timeouts
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_747/1000 — Prompt injection × Retries
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_748/1000 — Prompt injection × Idempotence
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_749/1000 — Prompt injection × Concurrence
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_750/1000 — Prompt injection × Observabilité
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_751/1000 — Prompt injection × Sécurité
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_752/1000 — Prompt injection × Confidentialité
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_753/1000 — Prompt injection × Evals
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_754/1000 — Prompt injection × Property testing
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_755/1000 — Prompt injection × Stress/chaos
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_756/1000 — Prompt injection × Performance
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_757/1000 — Prompt injection × Versioning
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_758/1000 — Prompt injection × Recovery
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_759/1000 — Prompt injection × Provenance
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_760/1000 — Prompt injection × Application MEL
- **État raisonné** : trust-boundary-data-scope-guardrail.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Prompt injection.
- **Défaillance ciblée** : tool hijack/exfiltration.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F03, F15, F17.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## AI risk

### AI_ENGINEERING_EXPERT_cycle_761/1000 — AI risk × Invariants
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_762/1000 — AI risk × Modèle d’état
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_763/1000 — AI risk × Contrats
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_764/1000 — AI risk × Validation
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_765/1000 — AI risk × Taxonomie d’échec
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_766/1000 — AI risk × Timeouts
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_767/1000 — AI risk × Retries
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_768/1000 — AI risk × Idempotence
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_769/1000 — AI risk × Concurrence
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_770/1000 — AI risk × Observabilité
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_771/1000 — AI risk × Sécurité
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_772/1000 — AI risk × Confidentialité
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_773/1000 — AI risk × Evals
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_774/1000 — AI risk × Property testing
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_775/1000 — AI risk × Stress/chaos
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_776/1000 — AI risk × Performance
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_777/1000 — AI risk × Versioning
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_778/1000 — AI risk × Recovery
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_779/1000 — AI risk × Provenance
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_780/1000 — AI risk × Application MEL
- **État raisonné** : risk-control-owner-evidence.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à AI risk.
- **Défaillance ciblée** : risque sans mesure.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F17, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## AppSec

### AI_ENGINEERING_EXPERT_cycle_781/1000 — AppSec × Invariants
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_782/1000 — AppSec × Modèle d’état
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_783/1000 — AppSec × Contrats
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_784/1000 — AppSec × Validation
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_785/1000 — AppSec × Taxonomie d’échec
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_786/1000 — AppSec × Timeouts
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_787/1000 — AppSec × Retries
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_788/1000 — AppSec × Idempotence
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_789/1000 — AppSec × Concurrence
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_790/1000 — AppSec × Observabilité
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_791/1000 — AppSec × Sécurité
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_792/1000 — AppSec × Confidentialité
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_793/1000 — AppSec × Evals
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_794/1000 — AppSec × Property testing
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_795/1000 — AppSec × Stress/chaos
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_796/1000 — AppSec × Performance
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_797/1000 — AppSec × Versioning
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_798/1000 — AppSec × Recovery
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_799/1000 — AppSec × Provenance
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_800/1000 — AppSec × Application MEL
- **État raisonné** : authz-config-crypto-input-integrity.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à AppSec.
- **Défaillance ciblée** : broken access/misconfig.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F16, F15.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Supply chain

### AI_ENGINEERING_EXPERT_cycle_801/1000 — Supply chain × Invariants
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_802/1000 — Supply chain × Modèle d’état
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_803/1000 — Supply chain × Contrats
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_804/1000 — Supply chain × Validation
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_805/1000 — Supply chain × Taxonomie d’échec
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_806/1000 — Supply chain × Timeouts
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_807/1000 — Supply chain × Retries
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_808/1000 — Supply chain × Idempotence
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_809/1000 — Supply chain × Concurrence
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_810/1000 — Supply chain × Observabilité
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_811/1000 — Supply chain × Sécurité
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_812/1000 — Supply chain × Confidentialité
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_813/1000 — Supply chain × Evals
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_814/1000 — Supply chain × Property testing
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_815/1000 — Supply chain × Stress/chaos
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_816/1000 — Supply chain × Performance
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_817/1000 — Supply chain × Versioning
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_818/1000 — Supply chain × Recovery
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_819/1000 — Supply chain × Provenance
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_820/1000 — Supply chain × Application MEL
- **État raisonné** : SHA-workflow-digest-attestation-SBOM.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Supply chain.
- **Défaillance ciblée** : artefact non traçable.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F18, F19.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Release engineering

### AI_ENGINEERING_EXPERT_cycle_821/1000 — Release engineering × Invariants
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_822/1000 — Release engineering × Modèle d’état
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_823/1000 — Release engineering × Contrats
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_824/1000 — Release engineering × Validation
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_825/1000 — Release engineering × Taxonomie d’échec
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_826/1000 — Release engineering × Timeouts
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_827/1000 — Release engineering × Retries
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_828/1000 — Release engineering × Idempotence
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_829/1000 — Release engineering × Concurrence
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_830/1000 — Release engineering × Observabilité
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_831/1000 — Release engineering × Sécurité
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_832/1000 — Release engineering × Confidentialité
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_833/1000 — Release engineering × Evals
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_834/1000 — Release engineering × Property testing
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_835/1000 — Release engineering × Stress/chaos
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_836/1000 — Release engineering × Performance
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_837/1000 — Release engineering × Versioning
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_838/1000 — Release engineering × Recovery
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_839/1000 — Release engineering × Provenance
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_840/1000 — Release engineering × Application MEL
- **État raisonné** : candidate-artifact-canary-metrics.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Release engineering.
- **Défaillance ciblée** : rebuild différent.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F18, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Rollback/recovery

### AI_ENGINEERING_EXPERT_cycle_841/1000 — Rollback/recovery × Invariants
- **État raisonné** : target-data-trigger-verification.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_842/1000 — Rollback/recovery × Modèle d’état
- **État raisonné** : target-data-trigger-verification.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_843/1000 — Rollback/recovery × Contrats
- **État raisonné** : target-data-trigger-verification.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_844/1000 — Rollback/recovery × Validation
- **État raisonné** : target-data-trigger-verification.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_845/1000 — Rollback/recovery × Taxonomie d’échec
- **État raisonné** : target-data-trigger-verification.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_846/1000 — Rollback/recovery × Timeouts
- **État raisonné** : target-data-trigger-verification.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_847/1000 — Rollback/recovery × Retries
- **État raisonné** : target-data-trigger-verification.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_848/1000 — Rollback/recovery × Idempotence
- **État raisonné** : target-data-trigger-verification.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_849/1000 — Rollback/recovery × Concurrence
- **État raisonné** : target-data-trigger-verification.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_850/1000 — Rollback/recovery × Observabilité
- **État raisonné** : target-data-trigger-verification.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_851/1000 — Rollback/recovery × Sécurité
- **État raisonné** : target-data-trigger-verification.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_852/1000 — Rollback/recovery × Confidentialité
- **État raisonné** : target-data-trigger-verification.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_853/1000 — Rollback/recovery × Evals
- **État raisonné** : target-data-trigger-verification.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_854/1000 — Rollback/recovery × Property testing
- **État raisonné** : target-data-trigger-verification.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_855/1000 — Rollback/recovery × Stress/chaos
- **État raisonné** : target-data-trigger-verification.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_856/1000 — Rollback/recovery × Performance
- **État raisonné** : target-data-trigger-verification.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_857/1000 — Rollback/recovery × Versioning
- **État raisonné** : target-data-trigger-verification.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_858/1000 — Rollback/recovery × Recovery
- **État raisonné** : target-data-trigger-verification.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_859/1000 — Rollback/recovery × Provenance
- **État raisonné** : target-data-trigger-verification.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_860/1000 — Rollback/recovery × Application MEL
- **État raisonné** : target-data-trigger-verification.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Rollback/recovery.
- **Défaillance ciblée** : rollback non testé.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Backup/DR

### AI_ENGINEERING_EXPERT_cycle_861/1000 — Backup/DR × Invariants
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_862/1000 — Backup/DR × Modèle d’état
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_863/1000 — Backup/DR × Contrats
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_864/1000 — Backup/DR × Validation
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_865/1000 — Backup/DR × Taxonomie d’échec
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_866/1000 — Backup/DR × Timeouts
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_867/1000 — Backup/DR × Retries
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_868/1000 — Backup/DR × Idempotence
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_869/1000 — Backup/DR × Concurrence
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_870/1000 — Backup/DR × Observabilité
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_871/1000 — Backup/DR × Sécurité
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_872/1000 — Backup/DR × Confidentialité
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_873/1000 — Backup/DR × Evals
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_874/1000 — Backup/DR × Property testing
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_875/1000 — Backup/DR × Stress/chaos
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_876/1000 — Backup/DR × Performance
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_877/1000 — Backup/DR × Versioning
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_878/1000 — Backup/DR × Recovery
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_879/1000 — Backup/DR × Provenance
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_880/1000 — Backup/DR × Application MEL
- **État raisonné** : manifest-hash-inventory-restore-drill.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Backup/DR.
- **Défaillance ciblée** : backup inutilisable.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F10, F19, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Computer use

### AI_ENGINEERING_EXPERT_cycle_881/1000 — Computer use × Invariants
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_882/1000 — Computer use × Modèle d’état
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_883/1000 — Computer use × Contrats
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_884/1000 — Computer use × Validation
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_885/1000 — Computer use × Taxonomie d’échec
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_886/1000 — Computer use × Timeouts
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_887/1000 — Computer use × Retries
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_888/1000 — Computer use × Idempotence
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_889/1000 — Computer use × Concurrence
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_890/1000 — Computer use × Observabilité
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_891/1000 — Computer use × Sécurité
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_892/1000 — Computer use × Confidentialité
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_893/1000 — Computer use × Evals
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_894/1000 — Computer use × Property testing
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_895/1000 — Computer use × Stress/chaos
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_896/1000 — Computer use × Performance
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_897/1000 — Computer use × Versioning
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_898/1000 — Computer use × Recovery
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_899/1000 — Computer use × Provenance
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_900/1000 — Computer use × Application MEL
- **État raisonné** : screen-target-approval-action-observation.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Computer use.
- **Défaillance ciblée** : clic stale/action irréversible.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F03, F15, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Multimodal

### AI_ENGINEERING_EXPERT_cycle_901/1000 — Multimodal × Invariants
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_902/1000 — Multimodal × Modèle d’état
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_903/1000 — Multimodal × Contrats
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_904/1000 — Multimodal × Validation
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_905/1000 — Multimodal × Taxonomie d’échec
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_906/1000 — Multimodal × Timeouts
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_907/1000 — Multimodal × Retries
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_908/1000 — Multimodal × Idempotence
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_909/1000 — Multimodal × Concurrence
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_910/1000 — Multimodal × Observabilité
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_911/1000 — Multimodal × Sécurité
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_912/1000 — Multimodal × Confidentialité
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_913/1000 — Multimodal × Evals
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_914/1000 — Multimodal × Property testing
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_915/1000 — Multimodal × Stress/chaos
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_916/1000 — Multimodal × Performance
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_917/1000 — Multimodal × Versioning
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_918/1000 — Multimodal × Recovery
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_919/1000 — Multimodal × Provenance
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_920/1000 — Multimodal × Application MEL
- **État raisonné** : asset-modality-codec-time-model.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Multimodal.
- **Défaillance ciblée** : metadata perdue/mismatch.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Voix temps réel

### AI_ENGINEERING_EXPERT_cycle_921/1000 — Voix temps réel × Invariants
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_922/1000 — Voix temps réel × Modèle d’état
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_923/1000 — Voix temps réel × Contrats
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_924/1000 — Voix temps réel × Validation
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_925/1000 — Voix temps réel × Taxonomie d’échec
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_926/1000 — Voix temps réel × Timeouts
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_927/1000 — Voix temps réel × Retries
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_928/1000 — Voix temps réel × Idempotence
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_929/1000 — Voix temps réel × Concurrence
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_930/1000 — Voix temps réel × Observabilité
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_931/1000 — Voix temps réel × Sécurité
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_932/1000 — Voix temps réel × Confidentialité
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_933/1000 — Voix temps réel × Evals
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_934/1000 — Voix temps réel × Property testing
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_935/1000 — Voix temps réel × Stress/chaos
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_936/1000 — Voix temps réel × Performance
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_937/1000 — Voix temps réel × Versioning
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_938/1000 — Voix temps réel × Recovery
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_939/1000 — Voix temps réel × Provenance
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_940/1000 — Voix temps réel × Application MEL
- **État raisonné** : stream-VAD-turn-transcript-session.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Voix temps réel.
- **Défaillance ciblée** : double parole/stale transcript.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F02, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## UX conversation

### AI_ENGINEERING_EXPERT_cycle_941/1000 — UX conversation × Invariants
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_942/1000 — UX conversation × Modèle d’état
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_943/1000 — UX conversation × Contrats
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_944/1000 — UX conversation × Validation
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_945/1000 — UX conversation × Taxonomie d’échec
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_946/1000 — UX conversation × Timeouts
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_947/1000 — UX conversation × Retries
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_948/1000 — UX conversation × Idempotence
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_949/1000 — UX conversation × Concurrence
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_950/1000 — UX conversation × Observabilité
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_951/1000 — UX conversation × Sécurité
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_952/1000 — UX conversation × Confidentialité
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_953/1000 — UX conversation × Evals
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_954/1000 — UX conversation × Property testing
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_955/1000 — UX conversation × Stress/chaos
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_956/1000 — UX conversation × Performance
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_957/1000 — UX conversation × Versioning
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_958/1000 — UX conversation × Recovery
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_959/1000 — UX conversation × Provenance
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_960/1000 — UX conversation × Application MEL
- **État raisonné** : intent-focus-constraints-uncertainty.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à UX conversation.
- **Défaillance ciblée** : hors sujet/faux statut.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F01, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Résilience autonome

### AI_ENGINEERING_EXPERT_cycle_961/1000 — Résilience autonome × Invariants
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_962/1000 — Résilience autonome × Modèle d’état
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_963/1000 — Résilience autonome × Contrats
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_964/1000 — Résilience autonome × Validation
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_965/1000 — Résilience autonome × Taxonomie d’échec
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_966/1000 — Résilience autonome × Timeouts
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_967/1000 — Résilience autonome × Retries
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_968/1000 — Résilience autonome × Idempotence
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_969/1000 — Résilience autonome × Concurrence
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_970/1000 — Résilience autonome × Observabilité
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_971/1000 — Résilience autonome × Sécurité
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_972/1000 — Résilience autonome × Confidentialité
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_973/1000 — Résilience autonome × Evals
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_974/1000 — Résilience autonome × Property testing
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_975/1000 — Résilience autonome × Stress/chaos
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_976/1000 — Résilience autonome × Performance
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_977/1000 — Résilience autonome × Versioning
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_978/1000 — Résilience autonome × Recovery
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_979/1000 — Résilience autonome × Provenance
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_980/1000 — Résilience autonome × Application MEL
- **État raisonné** : mode-checkpoint-heartbeat-stop-cleanup.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Résilience autonome.
- **Défaillance ciblée** : job zombie/stop ignoré.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F09, F20, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Supervision humaine

### AI_ENGINEERING_EXPERT_cycle_981/1000 — Supervision humaine × Invariants
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : définir une propriété observable qui doit toujours rester vraie, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : casser volontairement la propriété et vérifier que le test échoue.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_982/1000 — Supervision humaine × Modèle d’état
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : séparer état durable, transitoire, dérivé et terminal, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : crash/restart puis comparer l’état final.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_983/1000 — Supervision humaine × Contrats
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : formaliser préconditions, sorties, effets et postconditions, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : retour transport OK mais postcondition fausse => FAIL.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_984/1000 — Supervision humaine × Validation
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : valider avant mutation et après frontière non fiable, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : types, bornes, champs inconnus, sortie malformée.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_985/1000 — Supervision humaine × Taxonomie d’échec
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : classer transitoire, permanent, ambigu, sécurité, externe, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : injecter chaque classe et vérifier le chemin.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_986/1000 — Supervision humaine × Timeouts
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : propager une deadline totale et borner chaque sous-attente, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : dépendance lente => annulation, cleanup, statut explicite.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_987/1000 — Supervision humaine × Retries
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : retry seulement le sûr avec budget/backoff/jitter, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : échecs transitoires puis succès sans dépasser budget.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_988/1000 — Supervision humaine × Idempotence
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : faire converger les répétitions vers un effet unique, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : 10 répétitions concurrentes même operation-id.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_989/1000 — Supervision humaine × Concurrence
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : formaliser races et atomicité, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : deux acteurs ordres inversés, invariant final identique.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_990/1000 — Supervision humaine × Observabilité
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : corréler trace, logs, métriques et état métier, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : remonter de l’incident final à la cause.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_991/1000 — Supervision humaine × Sécurité
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : moindre privilège et fail-closed, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : scope manquant => deny explicite et audité.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_992/1000 — Supervision humaine × Confidentialité
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : minimiser données envoyées et persistées, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : scanner logs/traces pour secrets et contenu inutile.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_993/1000 — Supervision humaine × Evals
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : lier capacité à cas, oracle, baseline et version, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : régression contrôlée détectée automatiquement.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_994/1000 — Supervision humaine × Property testing
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : générer séquences autour d’un invariant, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : conserver seed et shrink comme test permanent.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_995/1000 — Supervision humaine × Stress/chaos
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : tester charge bornée, crash, timeouts et reprise, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : rafales bornées sans fuite, duplication ni zombie.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_996/1000 — Supervision humaine × Performance
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : mesurer avant d’optimiser p50/p95/p99, CPU/I/O/tokens, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : baseline vs changement avec même résultat métier.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_997/1000 — Supervision humaine × Versioning
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : versionner contrats et migrations, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : ancien état -> migration -> rerun idempotent.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_998/1000 — Supervision humaine × Recovery
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : préparer reprise/rollback avant activation, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : crash à checkpoint puis reprise sans double effet.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_999/1000 — Supervision humaine × Provenance
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : lier résultat à source, version, temps, SHA et acteur, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : reconstruire la preuve de sortie jusqu’à la source.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

### AI_ENGINEERING_EXPERT_cycle_1000/1000 — Supervision humaine × Application MEL
- **État raisonné** : risk-approval-stop-actor-audit.
- **Principe** : appliquer seulement sur défaut observé, patch minimal et preuve, appliqué spécifiquement à Supervision humaine.
- **Défaillance ciblée** : action high-risk sans gate.
- **Test falsifiable** : diagnostic -> patch -> test ciblé -> full CI -> preview exact SHA.
- **Sources** : F03, F17, F21.
- **Règle MEL** : vérité runtime et postcondition observable priment sur présence du code, nom de branche ou réponse HTTP.

## Index
- 0001–0020 : Boucle agentique.
- 0021–0040 : Outils agents.
- 0041–0060 : Handoffs.
- 0061–0080 : Guardrails.
- 0081–0100 : MCP avancé.
- 0101–0120 : Context engineering.
- 0121–0140 : Dialogue state.
- 0141–0160 : Mémoire IA.
- 0161–0180 : Conflits mémoire.
- 0181–0200 : RAG.
- 0201–0220 : Embeddings.
- 0221–0240 : Grounding.
- 0241–0260 : Capability truth.
- 0261–0280 : Self-state.
- 0281–0300 : Evals comportementales.
- 0301–0320 : Evals trajectoires.
- 0321–0340 : Evals adversariales.
- 0341–0360 : Tracing.
- 0361–0380 : Observabilité.
- 0381–0400 : Workflows durables.
- 0401–0420 : Queues.
- 0421–0440 : Durable Objects.
- 0441–0460 : D1 cohérence.
- 0461–0480 : Schémas SQL.
- 0481–0500 : API contracts.
- 0501–0520 : TypeScript.
- 0521–0540 : Node runtime.
- 0541–0560 : Concurrence.
- 0561–0580 : Idempotence.
- 0581–0600 : Retries/deadlines.
- 0601–0620 : Systèmes distribués.
- 0621–0640 : Model routing.
- 0641–0660 : Multi-agent.
- 0661–0680 : Codage autonome.
- 0681–0700 : Code review IA.
- 0701–0720 : LoRA/fine-tuning.
- 0721–0740 : Data quality.
- 0741–0760 : Prompt injection.
- 0761–0780 : AI risk.
- 0781–0800 : AppSec.
- 0801–0820 : Supply chain.
- 0821–0840 : Release engineering.
- 0841–0860 : Rollback/recovery.
- 0861–0880 : Backup/DR.
- 0881–0900 : Computer use.
- 0901–0920 : Multimodal.
- 0921–0940 : Voix temps réel.
- 0941–0960 : UX conversation.
- 0961–0980 : Résilience autonome.
- 0981–1000 : Supervision humaine.

## Synthèse
Ce track expert renforce en priorité : autorité du contexte, tool contracts, guardrails au bon niveau, état durable, provenance exact-SHA, idempotence, retries bornés, cohérence D1/DO/Queues, observabilité, evals adversariales, vérité des capacités, prompt-injection, supply chain, canary/rollback et supervision proportionnée au risque.