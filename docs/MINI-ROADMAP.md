# MEL MINI — Roadmap ordonnée et critères de preuve

Mise à jour : 2026-10-15. Cette roadmap MINI fait partie du plan global MEL Ordi / Android / Cloudflare / MINI. **Elle ne remplace pas** la roadmap centrale ni les contrats de sécurité Link V2.

## Règles de suivi

- Statuts : `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `DONE_VERIFIED`.
- `DONE_VERIFIED` exige une preuve datée, un SHA/version exact(e), l'environnement, une exécution réelle sur matériel lorsqu'elle est nécessaire, les résultats négatifs et un lien vers les artefacts.
- CI verte, connexion BLE, bouton câblé ou contrat déclaré ne suffisent jamais à prouver un comportement physique.
- Ne pas reconstruire des fonctionnalités existantes : recenser, exécuter, réparer seulement les lacunes prouvées.
- Priorité aux alternatives locales/gratuites. SharePoint et Vercel ne doivent pas bloquer les fonctions essentielles ; leur éventuelle indisponibilité reste explicitement signalée.
- Pas de flash destructif ou de publication concurrente ; sauvegarde, exact-SHA, health gates et rollback conservés.

## Priorités, dans l'ordre

| Ordre | ID | Chantier | Statut initial | Preuve requise |
| --- | --- | --- | --- | --- |
| 1 | MINI-ROAD-01 | Réconcilier code, branches, firmware, APK, Companion, Worker et releases réellement déployées | IN_PROGRESS | Matrice SHA/version concordante et liste documentée des écarts |
| 2 | MINI-ROAD-02 | Inventorier toutes les compétences et toutes les lignes `DONE_VERIFIED`, distinguer présence, santé, exécution et preuve réelle | NOT_STARTED | Registre exhaustif avec résultats par compétence, artefacts et blocages |
| 3 | MINI-ROAD-03 | Vérifier l'autonomie évolutive existante : détection d'écart → solution gratuite → préflight → code/PR → CI → autorisation → déploiement → preuve, sans doublons | NOT_STARTED | Scénario E2E reproductible, journal d'actions et traitement sûr des échecs |
| 4 | MINI-ROAD-04 | Auditer tous les boutons, états, permissions, formulaires et parcours de la MINI, de l'APK et du Companion | NOT_STARTED | Inventaire exhaustif, tests d'interaction réelle et preuves par contrôle |
| 5 | MINI-ROAD-05 | Vérifier la voix « OK MEL », STT/TTS français, réveil, STOP VOIX, permissions, audio HP/micro et fonctionnement verrouillé selon limites Android | NOT_STARTED | Essais sur appareils physiques, mesures d'échec/latence et consentements |
| 6 | MINI-ROAD-06 | Tester Link V2 / BLE, sessions chiffrées, reconnexions, négociation TRIAD, état réel et refus fail-closed | NOT_STARTED | Stress de reconnexions, pertes/réordonnancement et preuve des commandes réellement exécutées |
| 7 | MINI-ROAD-07 | Tester les actions MEL Ordi de bout en bout : application, fichiers, Internet, messages, calendrier, commandes PC distantes avec permissions appropriées | NOT_STARTED | Succès/échecs réels mesurés ; aucun simple ACK présenté comme tâche finie |
| 8 | MINI-ROAD-08 | Effectuer stress, stabilité et tests de sécurité : charge, délais, reprise, panne réseau, perte Bluetooth, permissions et HALT | NOT_STARTED | Rapport horodaté, couverture, taux de réussite et bugs corrigés/retestés |
| 9 | MINI-ROAD-09 | Optimiser UX, animation, ergonomie, performances, consommation et fiabilité des trois interfaces | NOT_STARTED | Benchmarks avant/après et non-régression sur matériel |
| 10 | MINI-ROAD-10 | Intégrer les correctifs par petites PR, publier fréquemment sans chevauchement et valider production + versions client | NOT_STARTED | CI, sauvegarde, rollback, SHA exact et health gates ; preuve physique distincte de la publication |

## Dépendances et limites actuelles

- Les fonctions de développement autonome existent déjà (`src/evolution/`). Leur présence n'est pas une validation E2E de leur exécution en production.
- Les tests logiciels de boutons et de capacités existent, mais n'établissent pas à eux seuls une couverture réelle de tous les contrôles.
- Les fonctionnalités MINI, Android et Companion nécessitant du matériel restent **non vérifiées** jusqu'à réalisation et conservation d'essais physiques.
- Le progrès `DONE_VERIFIED` ne peut être attribué à aucune ligne ci-dessus sans la preuve correspondante.

## Références

- `docs/MEL-DEVELOPMENT-ROADMAP.md`
- `docs/MELITURGOS-MASTER-CHECKLIST.md`
- `docs/MEL-TRIAD-DEVICE-READINESS-20261014.md`
- `docs/mini-linkv2-triad-phase-v1-contract.md`
