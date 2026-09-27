# MEL — Audit complet technique, produit et expérience — 27 septembre 2026

Date de l’audit : 2026-09-27.
Portée : état canonique de MEL, travail réalisé sur la semaine du 21 au 27 septembre 2026, cohérence dépôt/roadmap/release, frontières de preuve et expérience réutilisable.
Source de vérité de départ : `main` après fusion du correctif Provider Escape release-binding, SHA `3847a861e2f935ccdb9eabf63570e9a9a1fe07b5`.
Règle : toute affirmation d’état futur doit être revalidée contre `main`, la roadmap et les runs GitHub courants.

## 1. Verdict général

MEL est dans un état techniquement très avancé et largement vérifié, mais la roadmap n’est pas encore totalement fermée.

État canonique observé dans `src/roadmap/master-roadmap.js` :
- 125 items au total ;
- 117 `DONE_VERIFIED` ;
- 7 `BLOCKED_HUMAN` ;
- 1 `DONE` : `MEL-EVOL-06` LoRA, encore sous responsabilité d’un autre chantier et non promu artificiellement en `DONE_VERIFIED`.

Le lot Android `GEN2-58` est bien passé en `DONE_VERIFIED`.
Les éléments humains restent explicitement humains ; aucun test backend ne doit les transformer en faux vert.

La production a reçu les releases exact-SHA successives. Le SHA `3847a861...` a franchi les gates pré-déploiement et l’étape `Deploy exact approved SHA to production`. Au moment de la rédaction initiale de ce rapport, sa preuve post-déploiement complète est encore en cours ; le verdict final est ajouté avant clôture de l’audit.

## 2. Discipline de vérité et niveaux de preuve

L’audit conserve cinq niveaux distincts :
1. code présent ;
2. test/CI ;
3. preview isolée ;
4. production exact-SHA ;
5. preuve appareil physique réelle.

Un niveau ne vaut jamais automatiquement le suivant.

Le travail de la semaine a confirmé plusieurs faux positifs possibles :
- un workflow global rouge peut contenir un déploiement production exact-SHA réellement réussi ;
- un APK compilé et signé n’est pas une preuve que l’audio réel du terminal fonctionne ;
- un BLE connecté n’est pas une preuve d’échange voix complet ;
- une source mémoire importée peut être exhaustive pour les messages éligibles tout en restant incomplète pour les pièces jointes ;
- une sauvegarde persistée n’est utile que si la restauration ou le binding de release est explicitement prouvé.

## 3. Conversation, contexte et continuité

Les fondations conversationnelles sont `DONE_VERIFIED` :
- Conversation Service ;
- archivage exhaustif des messages ;
- file de messages pendant la réflexion ;
- contexte long avec compression et préservation des décisions ;
- open loops persistants et reprenables ;
- interpréteur de contexte pré-LLM.

La preuve de contexte long en production a exercé une conversation réelle de plus de 65 000 caractères, une omission effective sous budget, la conservation d’un ancrage décisionnel et du tour courant exact, sans renvoyer de contenu privé.

Le principe à conserver est : compression ≠ oubli des décisions. La réduction du contexte doit préserver les invariants utiles, pas seulement raccourcir le texte.

## 4. Mémoire et archives

La mémoire MEL est structurée autour d’une séparation entre archive, candidats mémoire, mémoire cognitive, provenance et retrieval.

Les éléments `DONE_VERIFIED` couvrent notamment :
- Memory 2.0 ;
- contradictions, provenance et temporalité ;
- Knowledge Graph ;
- Timeline ;
- Projects/Decisions ;
- Personal Search/RAG ;
- import contexte ChatGPT ;
- Memory Compiler ;
- synchronisation continue ;
- export portable ;
- récupération archive ;
- pont archive -> mémoire opérationnelle ;
- recherche hybride ;
- apprentissage avec provenance ;
- rappel historique difficile ;
- reconstruction mémoire après panne.

L’export mémoire a déjà prouvé des milliers d’enregistrements avec checksums par collection et checksum global.

`MEL-MEM-05` reste correctement `BLOCKED_HUMAN` : le backfill des messages éligibles est terminé, mais la source importée ne contient pas toutes les pièces jointes/descripteurs nécessaires. Le système ne doit jamais inventer cette preuve.

## 5. Capability Bus, code et outils

Le Capability Bus central est `DONE_VERIFIED`.
MEL sait lire et rechercher son propre code via des capacités dédiées, avec preuve production.
Le self-check expose branche et SHA réellement déployés et doit échouer fermé en cas de mismatch.

Le Plugin SDK, MCP, versioning API et les mécanismes de release restent couverts par tests et preuves de production.

Principe retenu : une capacité n’est réelle que si le chemin runtime réellement utilisé la traverse. Une abstraction présente dans le dépôt n’est pas une preuve d’usage.

## 6. Council, multi-IA et auto-évolution

Le Model Council et les critiques multi-modèles sont vérifiés avec modèles distincts, synthèse MEL séparée, provenance et zéro coût fail-closed.

Le Teacher handoff a été exercé réellement.
GEN2-42 a nécessité plusieurs corrections de sémantique d’état :
- distinguer `WAITING_TEACHER`, progression post-Teacher, état idle et ancien échec retryable ;
- conserver les anciens FAILED retryable dans l’observabilité sans les confondre avec du travail encore bloquant ;
- ne considérer un état post-Teacher comme sain qu’avec provenance Teacher durable ;
- conserver `QUEUED`, FAILED non retryable ou absence de provenance comme blockers.

Le wrapper release a été aligné sur le même contrat que le planner afin d’éviter deux définitions contradictoires de « travail actif ».

L’auto-évolution reste supervisée : Council, Teacher, exact-SHA, tests, benchmark et aucune mutation production autonome.

## 7. Work, tâches et automatisations

Le Work Engine persistant, le planning DAG, les agents/automations, l’Event Bus, les notifications et les actions destructives avec confirmation explicite sont `DONE_VERIFIED`.

La semaine a confirmé une règle de gouvernance applicable aux tâches éditoriales comme techniques :
- runs manuels et automatiques doivent utiliser le même état canonique ;
- les compteurs ne doivent pas diverger ;
- une tâche fermée n’est pas relancée artificiellement ;
- les slots sont réalloués au chantier suivant sans réinitialiser l’état du projet dépriorisé.

## 8. Connecteurs et web

Le Connector SDK est vérifié.
Le web/research est vérifié en production avec source officielle, provenance et gate de qualité.

Restent `BLOCKED_HUMAN` :
- `GEN2-33` Gmail/Google : client OAuth réel + secrets + probes ;
- `GEN2-34` Outlook/Microsoft : app Microsoft + secrets + probes ;
- `GEN2-35` OneDrive/SharePoint : consentements/app réelle + probes ;
- `GEN2-36` : partie GitHub/Cloudflare déjà prouvée ; Vercel reste sans cible/token réel ;
- `MEL-CONN-03` Yahoo/Ymail + Roundcube/IMAP-SMTP : identifiants/config réels requis.

WordPress public/privé a été prouvé avec séparation d’auth.

## 9. Android / GEN2-58

Android 0.6.43 a été reconstruit sur la candidate sans fusionner l’historique divergent.
Les preuves incluent :
- contrats source/API ;
- tests unitaires ;
- APK debug ;
- package ;
- signature persistante ;
- release installable ;
- émulateur Android ;
- tests Compose instrumentés ;
- captures UI.

Le lot a été promu vers `main` par une PR ciblée construite depuis le `main` courant, plutôt que par fusion globale de la candidate fortement divergente.

Une régression temporaire de `native-chat.js` a montré pourquoi il faut préserver les durcissements plus récents de `main` et ne réappliquer que le delta nécessaire.

Les observations physiques Android/MINI restent séparées de la CI : transcription/reflection sans réponse, bourdonnement audio, crash/déconnexion et problèmes d’appairage ont été des symptômes réels de certains essais et ne doivent pas être effacés rétroactivement par un APK vert.

## 10. MINI et matériel

Le protocole terminal est traité comme un contrat versionné, avec appairage, jeton appareil, heartbeat, chat, voix, téléchargement/OTA et récupération locale.

Les travaux MINI sont un chantier actif distinct. La PR historique active `#221` reste hors du nettoyage de cette page.
Les nombreuses branches MINI historiques ne doivent pas être supprimées ou réécrites sans preuve qu’elles sont supersédées et sans coordination avec la page propriétaire.

Règle générale : firmware compilé, flash réussi, BLE connecté, audio intelligible et stabilité longue durée sont des preuves différentes.

## 11. Windows Companion

La semaine a fourni une preuve réelle de stress Windows Companion :
- 42 commandes terminales exercées ;
- 39 succès attendus ;
- 3 refus de sécurité attendus ;
- 26 captures ;
- zéro échec d’invariant dans cette campagne.

Les correctifs DPI et commandes système ont été traités séparément. Le matériel réel reste une surface de preuve distincte des tests GitHub.

## 12. Backup, restore et Provider Escape

Le backup a subi plusieurs durcissements :
- tri D1 déterministe ;
- post-vérification compacte ;
- suppression des doubles lectures R2 inutiles ;
- liaison d’un snapshot vérifié récent à un nouveau SHA de release ;
- table `release_backup_bindings` avec hash de binding ;
- restore readiness capable de vérifier un release binding sans relire le payload R2.

Un ancien Provider Escape refaisait une vérification complète et causait Cloudflare CPU 1102/HTTP 503.
Une première correction a remplacé cette répétition par une preuve persistée.
L’introduction ultérieure de `RELEASE_BOUND_VERIFIED_BACKUP` a révélé un second décalage : Provider Escape exigeait encore que le SHA historique du snapshot soit identique au nouveau SHA de release.
Le correctif #590 aligne Provider Escape sur `evaluateRestoreReadiness()`, exige un binding cryptographiquement valide, sélectionne le snapshot exact et maintient la vérification d’intégrité, sans `R2.get()`.

Principe : une preuve de release lourde doit réutiliser une preuve persistée cryptographiquement liée plutôt que refaire un calcul identique jusqu’à dépasser le budget Worker.

## 13. ShardVault

ShardVault reste volontairement `PAUSED_FOR_ROADMAP`.

Ce n’est ni un échec ni un oubli.
La règle propriétaire est explicite : réactiver ShardVault **en dernier**, après nettoyage, réconciliation et audit des autres surfaces.

Les workflows doivent :
- reconnaître la pause ;
- ne pas tenter de réactivation implicite ;
- maintenir les autres garanties backup/restore ;
- reprendre ensuite la preuve externe 7/7 et la reconstruction comme étape finale.

## 14. LoRA / MEL-EVOL-06

`MEL-EVOL-06` reste `DONE`, pas `DONE_VERIFIED`.
Le pipeline, les checkpoints et les CI ont fortement progressé, mais la clôture dépend de la preuve finale et du benchmark canonique.

Ce chantier appartient à une autre page. Cet audit n’a ni modifié ni relancé l’entraînement LoRA.

La PR active `#540` reste donc hors périmètre de nettoyage.

## 15. Production éditoriale / magazine

La semaine a fait émerger un contrat éditorial strict :
- repartir de la source canonique d’origine ;
- page 02 « Note au lecteur » comme référence graphique ;
- ne jamais utiliser une page rejetée comme base suivante ;
- préserver header/footer existants lorsqu’ils sont déjà validés ;
- corriger uniquement le corps si c’est la seule zone fautive ;
- une page à la fois ;
- audit indépendant avant passage à la suivante ;
- conserver dans l’audit le texte correspondant à chaque page validée.

Les médias authentiques sont préférés lorsqu’ils sont disponibles et utilisables.
Les doublons silencieux sont interdits.
Une reconstitution générée doit rester identifiée comme reconstitution, jamais comme archive authentique.

## 16. Livres, corpus long et orchestration des tâches

Les ouvrages sont pilotés par un corpus canonique et des états explicites :
- planifié ;
- rédaction ;
- audit/révision ;
- `CLOSED_VERIFIED`.

Les audits spécialisés peuvent être parallèles, mais convergent sur un seul manuscrit canonique.
La densification doit apporter contexte, événements, causalité, sources et structure, pas du remplissage.
Fait, interprétation et hypothèse restent séparés.
Les incertitudes ne sont pas effacées pour rendre le texte artificiellement affirmatif.

Après fermeture vérifiée, les slots sont réaffectés au projet suivant ; le projet fermé n’est pas réécrit par inertie.

## 17. Expérience et apprentissage MEL

Le mécanisme canonique est vérifié :
`src/learning/development-experience-pack.js`
→ `BOOTSTRAP_CORRECTIONS`
→ `LearningEngine.corrections()`
→ `LearningEngine.trainingBundle()`.

Le handoff daté `.agents/WEEKLY_HANDOFF_20260927.md` conserve la chronologie.
Le pack XP conserve les règles généralisables.
La PR #589 ajoute la couverture toutes-pages : magazine, provenance média, validation page-par-page, écriture longue, machine d’état du corpus et réallocation des tâches.

Cette séparation est importante :
- la chronologie datée dit ce qui s’est passé ;
- l’XP canonique dit ce que MEL doit réutiliser ;
- ni l’une ni l’autre ne doit transformer un ancien état en vérité actuelle sans revalidation.

## 18. Hygiène Git et réconciliation

La garde `canonical-branch-unicity` a été corrigée pour surveiller les branches réellement actives plutôt que toutes les refs historiques.

Les PR Android #237 et #532 ont été fermées comme supersédées.
La PR backup #571 a été fermée comme supersédée.
La PR GEN2-42 #587 a été fermée comme supersédée par #588.

Le dépôt conserve au moins 400 branches historiques dans les premières pages de l’inventaire GitHub. Beaucoup correspondent à des correctifs déjà fusionnés ou supersédés.
Le connecteur GitHub utilisé pour cet audit ne fournit pas d’opération de suppression de branche. Par conséquent :
- les PR obsolètes peuvent être fermées ;
- les refs actives peuvent être réconciliées ;
- les branches appartenant à LoRA/MINI/autres pages sont préservées ;
- l’absence de suppression physique des vieilles refs est documentée et ne doit pas être présentée comme un nettoyage terminé.

La garde canonique ne dépend plus de cette accumulation historique, ce qui évite de désactiver la sécurité pour contourner du bruit Git.

## 19. PR encore actives au moment de l’audit

À l’instant de l’inventaire :
- #589 : expérience toutes-pages, CI dédiée verte ;
- #586 : qualité déterministe du plan, CI GEN2-17 verte, autre chantier actif ;
- #540 : LoRA, autre chantier ;
- #221 : MINI, autre chantier.

#590 a été fusionnée avant cette photographie finale du rapport.
Les PR d’autres pages ne sont pas fermées au nom du nettoyage global.

## 20. Blockers humains restants

Les sept items `BLOCKED_HUMAN` observés sont :
- MEL-MEM-05 ;
- GEN2-33 ;
- GEN2-34 ;
- GEN2-35 ;
- GEN2-36 ;
- MEL-CONN-03 ;
- GEN2-42.

Attention : GEN2-42 a désormais des preuves techniques et release très avancées ; son statut roadmap doit être mis à jour uniquement par la page/lot propriétaire avec l’évidence exacte requise, jamais simplement parce que le wrapper release est devenu vert.

## 21. Actions de clôture

Ordre de clôture retenu :
1. terminer la release exact-SHA avec Provider Escape release-bound ;
2. fusionner #589 pour charger l’expérience toutes-pages dans le moteur d’apprentissage ;
3. relancer la release du SHA contenant cette expérience afin que la production l’embarque ;
4. vérifier HTTP final et les preuves post-déploiement ;
5. réconcilier/fermer les PR obsolètes restantes sans toucher aux chantiers actifs ;
6. recompiler l’état roadmap et les blockers humains ;
7. seulement ensuite réactiver ShardVault et refaire ses preuves externes/reconstruction ;
8. produire le checkpoint final.

## 22. Conclusion d’audit

Les principaux problèmes rencontrés cette semaine ne provenaient pas d’un manque massif de fonctionnalités, mais de frontières de vérité :
- branche candidate divergente ;
- test obsolète par rapport au contrat réel ;
- preuve post-déploiement confondue avec déploiement ;
- snapshot historique confondu avec binding de release ;
- état Teacher ancien confondu avec blocker actif ;
- CI logicielle confondue avec preuve physique ;
- production éditoriale corrigée depuis une mauvaise base ;
- tâche automatique confondue avec état canonique du projet.

Les corrections apportées convergent vers la même architecture de gouvernance : une source canonique, des états explicites, des preuves liées au SHA, des transitions fail-closed, des lots minimaux, une provenance conservée et une XP dédupliquée réellement chargée par MEL.
