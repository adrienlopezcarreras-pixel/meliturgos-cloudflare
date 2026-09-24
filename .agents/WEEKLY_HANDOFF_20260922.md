# MEL — Handoff technique canonique — semaine du 15 au 22 septembre 2026

Date de consolidation : 2026-09-22.
Base de départ de ce lot : main df021a63694e98582a816db5c1bc95cc41f29eaa.

## Règle de lecture

> Instantané historique arrêté au 22 septembre 2026. Pour tout état courant, `src/roadmap/master-roadmap.js` au HEAD de `main` prévaut; ce document ne doit jamais rétrograder un statut ou une version plus récente déjà intégrée.

Ce document décrit l’état de développement et les décisions techniques partageables dans le dépôt public. Les données personnelles, médicales, familiales, autobiographiques détaillées et les contenus privés des archives sont volontairement exclus : ils sont conservés dans un handoff privé Drive séparé.

## État canonique au 22 septembre

- GEN2-05 Model Council : DONE_VERIFIED. Council exposé via CapabilityBus, deux modèles Workers AI distincts, critiques indépendantes, synthèse MEL séparée et coût zéro runtime prouvé fail-closed.
- GEN2-17 Dev Agent / auto-évolution supervisée : DONE_VERIFIED. Trois cycles candidats successifs, approbations Teacher liées au SHA exact, CI et Council à chaque cycle, aucune mutation production autonome.
- GEN2-31 Browser capability : DONE_VERIFIED. Browser Run réel via MEL_BROWSER_COMPANION + Durable Object, navigate + read-text E2E, audit terminal.
- GEN2-36 GitHub / Cloudflare / Vercel : BLOCKED_HUMAN. GitHub et Cloudflare ont leurs preuves live; Vercel reste non vérifié faute de cible/token.
- GEN2-44 Observability : DONE_VERIFIED. Persistance D1 d’événements terminaux bornés, métriques/readiness et dashboard runtime.
- GEN2-45 Audit log : DONE_VERIFIED. Corrélation capability/requestId, refus préflight et événements terminaux prouvés.
- MEL-CODE-01/02/03 : DONE_VERIFIED. MEL lit/recherche son propre code et vérifie branche/SHA déployés.
- MEL-WORK-01/02/03 : DONE_VERIFIED. Work DAG persistant, reprise idempotente, actions destructives derrière approbation propriétaire exacte.
- MEL-MEM-06 à 10 : DONE_VERIFIED. Retrieval unifié, recherche hybride, apprentissage avec provenance, rappel historique difficile et reconstruction identique.
- MEL-MEM-04 : IN_PROGRESS. La preuve de complétude est maintenant fail-closed et sans plafond 2 000, mais attend encore full_archive_confirmed=true sur inventaire profond réel.
- MEL-MEM-05 : IN_PROGRESS. Backfill historique des descripteurs/pièces jointes validé; le contenu binaire reste limité aux octets réellement récupérables.
- MEL-EVOL-06 : IN_PROGRESS. Chaîne LoRA/Kaggle gratuite supervisée; aucun fallback payant.
- GEN2-54 et MEL-UI-05 : IN_PROGRESS. Control Center et cartes runtime continuent d’être raccordés à l’état réel.
- Release : exact-SHA + full CI + smokes production restent obligatoires.

## Travaux techniques majeurs de la semaine

1. Mémoire : suppression du faux positif de complétude lié à 2 000 conversations; reçus obligatoires; inventaire bidirectionnel; backfill attachment-only et métadonnées; retrieval exact/lexical/sémantique; provenance et reconstruction.
2. Sécurité : pare-feu prompt-injection renforcé; permissions CapabilityBus centralisées; approbation destructive propriétaire/scopée partagée par Work, Browser et Computer Use.
3. Work/Module Lab : DAG persistant, reprise multi-étapes, pipeline Council -> inspection -> plan -> spec -> génération -> validation -> tests -> sandbox -> sécurité.
4. Self-code/release : code.read/code.search et self-check exact-SHA certifiés depuis /api/chat de production; smoke release déterministe.
5. Council : wiring CapabilityBus, providers distincts, synthèse MEL, preuve Workers Free courte et fail-closed.
6. Browser : exécution réelle Cloudflare Browser Run certifiée et preview isolée gardée distincte de la production.
7. Observabilité/audit : événements terminaux D1 bornés, readiness, métriques et corrélation requestId.
8. Plateformes : GitHub dispatch et mutation Cloudflare bornée certifiés; Vercel demeure le seul bloqueur de GEN2-36.
9. Nettoyage dépôt/site : réconciliation roadmap/branches, suppression de snapshots historiques non référencés de l’arbre actif, hardening des réponses et accessibilité.

## XP distillées dans le LearningEngine

Les nouvelles règles réutilisables de cette consolidation sont dans `src/learning/development-experience-pack.js` et indexées dans `.agents/DEVELOPMENT_EXPERIENCE_INDEX.md`. Elles portent le corpus bootstrap statique de 65 à 72 leçons canoniques.

## Prochaines priorités fiables

- obtenir la preuve profonde réelle MEL-MEM-04;
- finir l’indexation binaire MEL-MEM-05 quand les octets existent;
- fournir une cible Vercel réelle pour clore GEN2-36;
- automatiser l’ingestion des handoffs validés dans GEN2-20 / MEL-MEM-02;
- poursuivre les tâches non bloquées sans réouvrir les éléments DONE_VERIFIED sans régression observée.
