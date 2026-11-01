# Handoff MAX — 01/11/2026 19h Paris (fin de crédit Claude)

## Procédure paquet (inchangée)
Branche `claude/<id>-impl` (code + test) → `npm test` doit afficher ` 0 failed` →
branche `prepared-<id>` depuis main → `node scripts/prepare-mission.mjs MEL-<ID> claude/<id>-impl "<résumé>"` →
`node --test tests/prepared-mission-packages.test.mjs` 0 failed → PR REST + merge.
`prepare-mission` REFUSE désormais un fichier détenu par un autre paquet en attente : c'est voulu, attendre la preuve.

## Règles apprises aujourd'hui (ne pas les réapprendre)
1. Le paquet doit couvrir TOUS les fichiers code/test du contrat, sinon le Council rejette.
2. Un paquet dont le contenu est devenu identique à main est LIVRÉ : le retirer, il bloque les suivants.
3. Deux paquets sur un même fichier = piège : le premier appliqué périme l'autre, la CI candidate échoue et une mission innocente part en réparation.
4. Une objection du Council qui nomme un objectif ne doit renvoyer QUE cette mission en réparation (corrigé, PR #2996).
5. Un rejet du Council n'annule QUE les fichiers des missions fautives (corrigé, PR #2997).
6. Ne jamais classer une mission « bloquée matériel » sans lire son contrat : FOUNDER-08, LORA-CHAT-01 et LORA-MODE-01 étaient du code pur.

## ÉTAT : 43 missions à contrat
- 19 livrées.
- 18 avec paquet prêt dans `prepared/` : AUDIT-04/05/06/07, COUNCIL-OPS-02, FOUNDER-02, FOUNDER-05, FOUNDER-08, LORA-CHAT-01, LORA-MODE-01, MANIFEST-01/02/07/08/09, UI-AUDIT-04, UI-AUDIT-07, MANIFEST-06.
- 9 restantes, toutes bloquées par un fichier partagé :

| Mission | Bloquée par |
|---|---|
| AUDIT-02 | tests/development-audit.test.mjs (pris par AUDIT-06) |
| AUDIT-03 | src/diagnostics/domain-audit.js (pris par AUDIT-05)<br>tests/domain-audit.test.mjs (pris par AUDIT-05) |
| FOUNDER-03 | src/roadmap/evolution-storage.js (pris par MANIFEST-09)<br>src/capabilities/capability-bus.js (pris par MANIFEST-08)<br>tests/autonomy-runtime-evolution-queue-progress.test.mjs (pris par MANIFEST-09) |
| FOUNDER-06 | LIBRE |
| UI-AUDIT-03 | scripts/ui-production-audit.mjs (pris par UI-AUDIT-07)<br>src/evolution/autonomy-activity.js (pris par UI-AUDIT-04)<br>tests/autonomy-activity-detail.test.mjs (pris par UI-AUDIT-04) |
| UI-AUDIT-05 | scripts/ui-production-audit.mjs (pris par UI-AUDIT-07) |
| UI-AUDIT-06 | scripts/ui-production-audit.mjs (pris par UI-AUDIT-07) |
| MANIFEST-03 | src/capabilities/capability-bus.js (pris par MANIFEST-08) |
| MANIFEST-10 | src/roadmap/manifest-01-acceptance.js (pris par MANIFEST-01)<br>tests/autonomy-readiness.test.mjs (pris par MANIFEST-01) |
**Débloquer** : dès qu'une mission est PROMUE DANS MAIN, retirer son paquet (contenu == main) puis coder+préparer celles qui attendaient son fichier.

## Branches déjà codées, à re-préparer après la preuve attendue
- `claude/audit-02-impl` (attend AUDIT-06) — `claude/audit-03-impl` (attend AUDIT-05) — `claude/manifest-10-impl` (attend MANIFEST-01).
- `git checkout claude/<id>-impl && git merge origin/main`, résoudre, `npm test` 0 failed, puis la procédure.

## PREUVE ROADMAP — le vrai chantier restant
La page affiche 176 points, 53 « Vérifié en production », le reste « Déclaré, sans preuve ».
Cause : un point n'est prouvé que s'il a une entrée dans `ROADMAP_PROOF_SOURCES` (`src/roadmap/roadmap-truth.js`)
OU s'il est livré par MAX avec un reçu `roadmap_code_acceptance`.
J'ai ajouté 43 sources réelles (PR #3010). **Il reste 42 points DONE_VERIFIED sans preuve possible.**

Deux garde-fous protègent ce fichier : toute source doit citer un point existant ET une capacité réellement
enregistrée dans `src/`, et le nombre de points sans preuve ne peut que baisser.

### Les 42 restants
| GEN2-02 | Identité MEL et System Prompt portable |
| GEN2-03 | Model Registry provider-neutral |
| GEN2-04 | Model Router + fallback |
| GEN2-51 | Versioning API |
| GEN2-52 | Versioning prompts et stratégies |
| MEL-CONTEXT-01 | Saisie continue pendant la réflexion / file de messages |
| MEL-CONTEXT-02 | Contexte long avec compression sans perte de décisions |
| MEL-CONTEXT-04 | Interpréteur de contexte pré-LLM: pédagogique, scientifique  |
| GEN2-10 | Contradictions, provenance et temporalité |
| GEN2-11 | Knowledge Graph |
| MEL-MEM-02 | Synchronisation continue des nouveaux échanges vers la mémoi |
| GEN2-50 | Compatibilité MCP |
| MEL-COUNCIL-03 | Teacher escalation vers ChatGPT/autres IA |
| MEL-COUNCIL-04 | Apprentissage du meilleur modèle selon la tâche |
| MEL-EVOL-06 | Fine-tuning / LoRA open-weight continu |
| GEN2-32 | Connector SDK |
| MEL-CONN-01 | WordPress Vérité Interdite |
| MEL-CONN-02 | Catalogue de connecteurs installables |
| MEL-VOICE-01 | Réveil Bonjour MEL / Allô MEL |
| MEL-AVATAR-01 | Avatar animé temps réel |
| MEL-AVATAR-02 | Talking avatar lip-sync |
| MEL-AVATAR-03 | Tenue/identité visuelle moderne de MEL |
| GEN2-26 | PWA |
| GEN2-27 | Android Companion runtime / app |
| GEN2-58 | Build et release Android |
| GEN2-59 | Build et release Windows |
| MEL-DEVICE-02 | Commandes système / arrêt contrôlé |
| MEL-DEVICE-03 | Wake-on-LAN séparé |
| MEL-SEC-01 | Prompt-injection firewall outils/RAG |
| MEL-SEC-05 | Pas de réplication cachée ni récolte de secrets |
| MEL-SOV-01 | Souveraineté technique complète et architecture remplaçable |
| GEN2-43 | Model Watch / découverte |
| MEL-EVAL-01 | Suites de benchmark conversation / code / recherche / mémoir |
| MEL-LORA-TRACE-01 | LoRA Daily Trace durable et exploitable par MEL |
| GEN2-54 | Control Center / Mode complet |
| MEL-UI-01 | Accueil minimal et contemporain |
| MEL-UI-02 | Avatar grand / cible tactile mobile |
| MEL-UI-03 | Favicon visage MEL |
| MEL-UI-06 | Copier-coller direct de fichiers et images dans la zone d’éc |
| GEN2-57 | Migration Gen1 sans perte |
| GEN2-61 | Final status report |
| MEL-REL-03 | Smoke tests production après déploiement |
### Comment les prouver (par ordre de coût)
1. **Ceux qui ont une capacité runtime** : ajouter la ligne dans `ROADMAP_PROOF_SOURCES`. La capacité doit
   RÉELLEMENT prouver le point — un mapping inventé est une fausse preuve, pire que pas de preuve.
2. **Ceux sans capacité (apparence d'interface, builds Android/Windows, appareils physiques)** : il leur faut
   un autre type de preuve (recette navigateur UI-AUDIT, artefact de build, recette physique). Tant qu'elle
   n'existe pas, « Déclaré, sans preuve » est la vérité et doit le rester.
3. **Une capacité prouve un point seulement si elle s'exécute vraiment en production** : vérifier dans
   `capability_audit` que `ok > 0` sur 7 jours, sinon le point passera « Jamais exécuté », pas « Vérifié ».

## Hors périmètre de cette session
Le mode UNCENSORED (chemin Venice) : câblage vérifié fonctionnel, mais je n'y touche plus et je ne lis plus ses sorties.
