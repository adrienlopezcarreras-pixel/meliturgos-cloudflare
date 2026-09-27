# MEL — Handoff technique canonique — semaine du 21 au 27 septembre 2026

Date de consolidation : 2026-09-27.
Base de réconciliation avant fusion de l’audit : main a342834729c11f4f2c083f0ed36ff6ea62d1500a.

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


## 27 septembre — recovery drill et chiffrement

- Le recovery drill production a révélé un faux échec `BACKUP_ENCRYPTION_CODEC_REQUIRED` : le backup/restore canonique utilisait correctement le codec d encryption, mais la capacité secondaire `resilience.recovery.drill.latest` reconstruisait le storage sans ce codec.
- Correction : résolution des secrets d encryption identique au chemin canonique, config partielle fail-closed, storage du drill construit avec `createEnvBackupEncryptionCodec(env)`, tout en conservant le drill sandboxé, sans accès/mutation production.
- Leçon : le chiffrement est un contrat transversal des consommateurs de storage ; un outil de preuve ne doit pas utiliser une configuration de lecture différente du système qu il prétend auditer.

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

Après certification GEN2-58, clôture des connecteurs externes côté développement et mise à jour du 27/09 au soir, la lecture canonique donne 125 items :
- 117 DONE_VERIFIED ;
- 7 DONE ;
- 1 BLOCKED_HUMAN : GEN2-42.

Les 7 DONE encore à vérifier avant DONE_VERIFIED sont : MEL-MEM-05, MEL-EVOL-06, GEN2-33, GEN2-34, GEN2-35, GEN2-36 et MEL-CONN-03.

MEL-MEM-05 est considéré développement/traitement terminé sur la source réellement disponible : 2 808/2 808 messages éligibles synchronisés, remaining_eligible_messages=0 et remaining_conversations=0. La source primaire disponible reste toutefois incomplète pour les pièces jointes (0 descripteur, 81 conversations partielles et 59 sous-remplies) et aucune source plus complète ne sera obtenue ; cette limite doit rester explicite et interdit DONE_VERIFIED sans nouvelle source primaire.

GEN2-33/34/35/36 et MEL-CONN-03 sont également développement terminé, avec vérifications externes réelles encore dues : credentials/consentements Google et Microsoft, cible Vercel réelle, credentials Yahoo et configuration Roundcube IMAP/SMTP.

MEL-EVOL-06 reste la propriété de son chantier LoRA et attend checkpoint final + benchmark canonique. GEN2-42 reste le seul BLOCKED_HUMAN de la roadmap.

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

## 27 septembre au soir — connecteurs externes, mémoire et preuve production

- PR #629 a été réconciliée sur le main courant, ses 11 CI sont passées, puis elle a été fusionnée. Le SHA ffc4312be3ebe1f3184d12f15243c1a176b60c9b a été déployé par le run 36350142056 avec sécurité, syntaxe, full suite, bundle R2, preuve Workers AI, déploiement exact-SHA, preuve d autonomie et HTTP final verts.
- Le centre Vercel chiffré est donc présent en production ; la connexion Vercel reste à vérifier réellement car le compte connecté expose 0 équipe et 0 projet.
- Les workflows de preuve Google et Microsoft ont été exécutés en production : runs 36350478390 et 36350480385. Contrats et preuves sont verts ; le vault chiffré et sa table sont présents, mais les identifiants d application Google/Microsoft et les tokens correspondants sont absents.
- PR #634 a ajouté un workflow de preuve MEL-CONN-03 pour Yahoo/Ymail et Roundcube/IMAP-SMTP. Le run production 36350717992 est entièrement vert ; verdict : vault sain, credentials Yahoo absents, token Yahoo absent et configuration Roundcube absente.
- PR #622, ancienne implémentation du centre de connexions, a été fermée comme supersédée plutôt que réinjectée au-dessus du main plus récent.
- MEL-MEM-05 a épuisé les données réellement disponibles : 2 808/2 808 messages éligibles synchronisés. La complétude des pièces jointes ne peut pas être certifiée faute de source primaire plus complète ; cette limite est désormais considérée comme un plafond documentaire permanent, pas comme un développement restant.
- La règle de preuve n est pas affaiblie : DONE signifie ici développement/traitement terminé avec vérification réelle ultérieure ; DONE_VERIFIED reste réservé à une preuve E2E ou primaire correspondant exactement au niveau revendiqué.
- ShardVault reste volontairement PAUSED_FOR_ROADMAP. GEN2-42 doit être traité avant sa réactivation finale.

## Chargement dans MEL

Les règles généralisables validées sont dans src/learning/development-experience-pack.js, agrégées par BOOTSTRAP_CORRECTIONS et exposées par LearningEngine.corrections()/trainingBundle().
Ce handoff conserve la chronologie et les références datées. MEL doit traiter ce document comme une photographie technique de la semaine du 21 au 27 septembre 2026, puis relire main/roadmap/runs pour toute question sur l’état actuel.


## Clôture production et recovery — 27 septembre 2026

- La PR #595 `fix(recovery): honor verified release backup binding` a été fusionnée sur `main`.
- Le SHA exact `f3d75ea94af8df09a4b797b65adba52537d9294e` a été promu via la branche canonique `release/mel-hardware-v0.1.0`.
- Le run production `36325378964` est intégralement vert : approbation, identité exact-SHA, sécurité, syntaxe, full suite, bundle critique R2, preuve Workers AI zéro-coût, déploiement, preuve post-déploiement/autonomie et HTTP final.
- Le recovery drill accepte désormais un snapshot vérifié historiquement seulement si un binding de release vérifié relie exactement le SHA courant, l'identité du snapshot, son intégrité et son SHA d'origine. Toute incohérence reste fail-closed.
- La PR #596 a ensuite supprimé la fenêtre arbitraire des 100 snapshots pour le recovery release-bound : le snapshot lié est retrouvé par identifiant exact et ses métadonnées SHA/intégrité restent vérifiées.
- La PR #592 a fusionné le scaffold qualité déterministe GEN2-42 après réparations IA bornées, sans activation production automatique.
- ShardVault reste volontairement `PAUSED_FOR_ROADMAP` et doit être réactivé/testé en dernier, après nettoyage et audit.
