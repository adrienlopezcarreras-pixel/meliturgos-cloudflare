# MEL — Handoff technique canonique — semaine du 21 au 27 septembre 2026

Date de consolidation : 2026-09-27.
Base de consolidation : main e4a277a7fbbccc57f13709d4a4e50ff8c1339069.

## Portée et règle de vérité

Ce handoff consolide le travail technique réalisé sur les différentes pages/agents autour de MEL pendant la semaine. Il exclut volontairement les informations personnelles privées et sépare systématiquement :
- code présent ;
- CI/test automatisé ;
- preview ;
- déploiement production exact-SHA ;
- preuve runtime/live ;
- preuve sur appareil physique.

Un état daté ci-dessous ne doit jamais être extrapolé comme vérité actuelle sans relire main, la roadmap et les runs récents.

## 21–22 septembre — mémoire, Council, browser, Work et observabilité

- La mémoire/ChatGPT archive a été durcie contre les faux positifs de complétude : suppression des plafonds arbitraires, reçus par conversation, inventaires bidirectionnels, backfill des descripteurs/pièces jointes, retrieval unifié avec provenance et reconstruction.
- Le Model Council a été porté jusqu’à une preuve live multi-modèle : au moins deux modèles Workers AI distincts, critiques séparées, synthèse MEL et preuve zéro-coût fail-closed.
- GEN2-31 Browser a reçu une preuve Cloudflare Browser Run réelle via CapabilityBus, avec navigation + lecture texte sur example.com et audit terminal.
- Le Work DAG et le Module Lab ont progressé vers des plans persistants, reprise idempotente, Council -> inspection -> plan/spec -> génération -> validation -> tests/sandbox/sécurité.
- code.read / code.search / code.integrity et les smokes release ont été raccordés au chemin utilisateur de production.
- Observability/Audit ont été consolidés autour d’événements terminaux D1 bornés, corrélés par requestId et sans persistance d’entrée brute sensible.
- GEN2-36 a confirmé les preuves GitHub/Cloudflare ; Vercel est resté humainement bloqué faute de cible/autorisation exploitable.
- Le corpus d’expérience a été porté à un ensemble canonique dédupliqué et le principe DONE_VERIFIED = preuve du niveau réellement revendiqué a été renforcé.

## 23–24 septembre — Android et terminal MINI

- Android a progressé par versions successives avec UI native, voix, fallback SpeechRecognizer/serveur, proximité réseau, BLE direct MINI, auto-reconnexion et signature stable.
- Les pipelines Android ont séparé debug, release signée exact-SHA, vérification apksigner/zipalign, secrets de keystore et nettoyage runner.
- Le protocole MINI a été traité comme un contrat versionné : pair/manifest/heartbeat/chat/voice/download/OTA, authentification appareil distincte et récupération locale.
- Plusieurs preuves physiques ont montré qu’un firmware compilé/flashé ou un BLE connecté ne suffisait pas à certifier l’expérience utilisateur complète.
- Un rollback complet 16 MiB MINI a été utilisé comme mécanisme réel de récupération lorsqu’un firmware plus récent perturbait COM/IP.
- Les essais voix ont isolé plusieurs couches : Android recevait parfois BEGIN/END ou le flux, alors que le retour TTS/audio MINI pouvait encore bourdonner, planter ou ne produire aucune réponse intelligible.
- Le principe retenu reste : distinguer transport BLE, format audio/codec, TTS, UI et stabilité physique ; ne jamais transformer un CI vert en preuve physique inexistante.

## 25 septembre — modularisation core et auto-évolution supervisée

- Plusieurs lots atomiques ont avancé séparément : observabilité/API, Fast Path, Model Router mesuré, export mémoire vérifiable, Evolution Ledger append-only, compatibilité MCP et self-healing.
- GEN2-38 a renforcé planning DAG, Goal/Task persistence et matérialisation historique.
- Les travaux auto-évolution ont conservé Council + Teacher + exact-SHA et interdiction de mutation production autonome.
- Les règles de convergence multi-agents ont été renforcées : relire HEAD avant mutation, isoler les lots et éviter de faire annuler une validation longue par un push concurrent.

## 26 septembre — connecteurs, appareils réels et fermeture roadmap

- OAuth multi-fournisseurs a été étendu ; la distinction required / optional / authorization_only a corrigé les rejets de scopes comme offline_access/openid tout en restant fail-closed sur les permissions métier.
- Gmail/Google, Outlook/Microsoft, OneDrive/SharePoint et les fournisseurs mail supplémentaires ont progressé côté backend, mais les autorisations/secrets réels restant humains sont conservés en BLOCKED_HUMAN lorsqu’ils ne sont pas prouvés.
- Windows Companion a reçu une validation réelle de commandes et sécurité : stress live 42/42 commandes terminales, 39 succès attendus, 3 refus de sécurité attendus, 26 captures et zéro échec d’invariant.
- Android/MINI a poursuivi les stress tests : plusieurs versions APK, bridge Internet/BLE, réponse chat mesurée, puis diagnostic du bourdonnement/crash audio. Ces symptômes physiques restent des faits historiques de test, pas une preuve qu’ils sont tous résolus.
- La roadmap a été progressivement convertie de DONE vers DONE_VERIFIED à mesure que les preuves réelles étaient obtenues.

## 27 septembre — Android 0.6.43, promotion ciblée, release et GEN2-42

### Android / GEN2-58

- PR #557 a reconstruit Android 0.6.43 sur la candidate sans importer aveuglément son historique divergent.
- SHA candidat fusionné : 091d71ec1c3e6489dec20d10a4c87b9c78dd419d.
- android-apk-build run 36301542616 : contrats source/API, unit tests, APK debug, package, signature persistante, release et upload verts.
- Artifact APK : 10926251419, digest sha256:6939b3731e9b1f360d0935dde5680660e9efad5543fa8f95f9a46163ea4461e8.
- android-emulator-ui-test run 36301542629 : émulateur, tests Compose instrumentés et captures UI verts.
- Les preuves appareil réel déjà acquises dépassent la baseline 0.6.5 (app 0.6.40 / status 0.6.42). GEN2-58 est donc éligible à DONE_VERIFIED lorsque la PR roadmap correspondante est fusionnée.

### Candidate / branches / promotion

- La candidate historique a été mesurée fortement divergente de main ; elle n’a pas été fusionnée en bloc.
- Une promotion ciblée a été reconstruite depuis le main courant via PR #566, avec conservation des durcissements plus récents de native-chat/current-fact.
- canonical-branch-unicity a été corrigé pour représenter les vraies branches actives via PR ouvertes plutôt que toutes les refs historiques.
- Les anciennes PR Android #237 et #532 ont été fermées comme supersédées.
- Le dépôt conserve de nombreuses branches historiques ; les branches LoRA, MINI et labs matériels actifs restent hors périmètre de nettoyage de cette page.

### Release / backup / Provider Escape

- Les workflows ont confirmé qu’un workflow global rouge peut contenir un déploiement production exact-SHA réellement réussi : mutation production et post-proof sont des vérités distinctes.
- Provider Escape provoquait un dépassement CPU Cloudflare 1102 en revérifiant lourdement une sauvegarde R2 déjà vérifiée. PR #572 a remplacé cette répétition par une preuve persistée stricte : verified + restoreVerified + SHA déployé + intégrité concordante.
- PR #577 a réconcilié les optimisations CPU backup sur le main courant : tri D1 déterministe délégué à SQLite ORDER BY rowid et réutilisation des chaînes canoniques durant l’auto-vérification.
- L’ancienne PR #571 a été fermée comme supersédée par #577.

### GEN2-42 Teacher / Capability Watch

- Le live a révélé quatre handoffs historiques : deux TEACHER_APPROVED (vision, image) et deux anciens FAILED retryable sur image.generate/video.generate avec CODE_HEAD_PIN_MISMATCH.
- PR #573 a épinglé la planification au SHA approuvé par Teacher ; PR #575 a sélectionné le premier candidat de qualité conforme ; PR #579 a ajouté un repair pass borné de qualité.
- PR #574 a distingué état réellement idle et handoff bloqué.
- PR #576 a distingué progression post-Teacher et blocage réel.
- PR #578 aligne la preuve de release sur la sémantique déjà utilisée par le planner : FAILED + retryable est libéré pour retry, reste visible dans les diagnostics, mais ne doit pas bloquer indéfiniment une release ; QUEUED/FAILED non retryable ou sans provenance Teacher reste bloquant.
- Le workflow GEN2-42 a reçu un déclencheur PR et des tests ciblés afin que cette logique ne soit plus modifiable sans CI.


## 21–27 septembre — magazine et production éditoriale

- Le magazine a adopté une source graphique canonique stricte : repartir du fichier source d origine, utiliser la page 02 « Note au lecteur » comme référence visuelle absolue, et ne jamais dériver une page depuis la page précédemment corrigée.
- Quand un header/footer existe déjà dans la source canonique, il doit être conservé à l identique : aucune régénération, aucun déplacement, aucun redimensionnement ni remplacement. Les corrections portent alors uniquement sur le corps de page.
- Les pages sont traitées une par une : GENERATE/FIX sur la page courante, audit indépendant, validation explicite, puis seulement passage à la suivante. Une page rejetée ne devient jamais la base de la suivante.
- Les vraies photographies et archives sont privilégiées lorsqu elles sont disponibles et utilisables ; aucune photo ne doit être répétée silencieusement ; chaque image historique passe un reality/historical check. Une image générée doit rester identifiable comme reconstitution et ne jamais être présentée comme document authentique.
- La fidélité éditoriale est mesurée séparément de la conformité visuelle : texte/script canonique, image, format, fond, marges, header/footer et pagination sont des dimensions de contrôle distinctes.
- Le registre d audit doit conserver le texte correspondant à chaque page validée afin que rendu visuel et contenu éditorial restent réconciliables.

## 21–27 septembre — écriture longue, corpus et tâches

- Les projets de livres sont gérés comme un corpus canonique avec états explicites : planifié, en rédaction, en audit/révision, puis CLOSED_VERIFIED. Un projet, un manuscrit et une révision ne doivent jamais être confondus.
- Les cycles automatiques et manuels utilisent le même état canonique et le même compteur ; une reprise doit continuer depuis cet état réel, sans double comptage ni boucle artificielle.
- Après fermeture vérifiée d un manuscrit, les tâches disponibles sont réallouées au prochain chantier prioritaire plutôt que de continuer à réécrire le projet fermé.
- La semaine a confirmé une règle de rédaction longue : densifier sans remplissage ni invention, conserver les incertitudes, séparer fait documenté, interprétation et hypothèse, et vérifier structure/doublons/provenance après chaque gros lot.
- Les audits spécialisés peuvent être parallèles en rôle mais doivent converger sur un seul manuscrit canonique ; leurs findings sont fermés explicitement avant CLOSED_VERIFIED.
- Les jeux ont conservé leur état canonique et leurs preuves acquises ; lorsqu ils ont été temporairement dépriorisés au profit des livres, le changement de priorité a porté sur les slots de travail, pas sur la vérité de leur dernier état validé.

## État roadmap au cours de la consolidation

Avant la certification GEN2-58, la lecture canonique donnait 125 items :
- 116 DONE_VERIFIED ;
- 7 BLOCKED_HUMAN ;
- 2 DONE : GEN2-58 Android et MEL-EVOL-06 LoRA.

Les 7 BLOCKED_HUMAN étaient : MEL-MEM-05, GEN2-33, GEN2-34, GEN2-35, GEN2-36, MEL-CONN-03 et GEN2-42.
MEL-EVOL-06 reste la propriété d’un autre chantier/page et ne doit pas être modifié par cette consolidation.

## ShardVault

ShardVault reste volontairement PAUSED_FOR_ROADMAP. Les workflows respectent cet état et ne doivent pas le réactiver implicitement. Sa remise en service et son audit externe final sont la dernière étape, après nettoyage/réconciliation/audit des autres surfaces.

## Leçons opérationnelles de la semaine

1. Une candidate validée ne doit jamais être fusionnée en bloc si son historique est fortement divergent.
2. Préserver les durcissements récents de main sur les fichiers transverses et réappliquer seulement le delta nécessaire.
3. Distinguer mutation production réussie, post-proof et HTTP final.
4. Une preuve release bornée doit réutiliser des preuves persistées cryptographiquement liées quand refaire le calcul complet excède le budget Worker.
5. Un handoff FAILED retryable libéré par le planner reste observable mais ne doit pas être compté comme travail actif bloquant.
6. Un changement de contrat de preuve doit avoir un workflow CI qui écoute réellement ses chemins.
7. CI Android signé, émulateur et appareil réel sont trois niveaux de preuve distincts.
8. Les autorisations humaines réelles doivent rester BLOCKED_HUMAN ; aucun test backend ne les remplace.
9. Les chantiers actifs appartenant à d’autres pages ne doivent pas être nettoyés au nom de la convergence.
10. Toute clôture passe par nettoyage, unification, réconciliation, adaptation et checkpoint XP.

## Chargement dans MEL

Les règles généralisables validées sont dans src/learning/development-experience-pack.js, agrégées par BOOTSTRAP_CORRECTIONS et exposées par LearningEngine.corrections()/trainingBundle().
Ce handoff conserve la chronologie et les références datées. MEL doit traiter ce document comme une photographie technique de la semaine du 21 au 27 septembre 2026, puis relire main/roadmap/runs pour toute question sur l’état actuel.
