# MEL — contrat d'intégration MINI + APK Android + Companion Windows

Statut: développement intégré en cours, **pas** DONE_VERIFIED. Ce document décrit les comportements que les trois exécutables doivent réaliser ensemble, sans assimiler CI et essai matériel.

## Répartition et prévention des conflits

- MINI ESP32-S3: périphérique BLE Link V2, audio, affichage, caméra, bouton physique et état de session.
- APK Android: central BLE, identification de la phrase « OK MEL », STT/TTS français, routage de conversation, médiation sécurisée des commandes et médias.
- Companion Windows: opérations PC explicitement autorisées, remontée de résultat d'exécution, installation Android Wi-Fi uniquement après approbation locale et appairage ADB établi.
- Backend: authentification, capacités, Council/LoRA, journalisation et réponse structurée. Il ne peut jamais prétendre avoir contrôlé un PC ou flashé une MINI sans accusé provenant du périphérique réel.
- Les branches de travail Companion/flash MINI restent propriétaires de leurs équipes. La branche d'intégration ne réécrit pas leurs fichiers.

## Parcours unifié à développer avant recette

1. **Découverte**: APK affiche trois états séparés: MINI GATT connectée; MINI SESSION_OK vérifié; MEL backend authentifié. Ne jamais confondre BLE et Internet.
2. **Activation vocale**: consentement microphone explicite; wake « OK MEL » local, avec interruption, arrêt et reprise. Android applique ses restrictions sur micro en arrière-plan. Le chemin notification n'est PAS équivalent à une conversation automatique sur téléphone verrouillé.
3. **Tour de conversation**: un seul propriétaire de microphone à un instant donné (wake APK, capture STT, audio MINI). Lors d'un match, suspendre le détecteur, ouvrir la capture autorisée, terminer le tour, puis réarmer sans boucle ni écoute concurrente.
4. **Réponse**: une réponse backend authentifiée produit l'affichage synchronisé APK/MINI, une voix FR locale Android vers ES8311 via Link V2 et un STOP VOIX prioritaire. Dédupliquer les acquittements et borner les tailles.
5. **Contrôle PC**: seule une demande explicitement consentie, encore valide et associée à l'appareil autorisé atteint Companion. HALT, expiration et révocation doivent empêcher la récupération et l'exécution. L'APK et la MINI présentent le résultat vrai, jamais un simple ACK de file d'attente comme une exécution réussie.
6. **Rupture**: perte BLE, Android en arrière-plan, verrouillage, retrait de permission, crash Companion, absence Internet et redémarrage MINI -> états lisibles, annulation sécurisée des opérations en cours, reprise sans double exécution.
7. **Mises à jour**: paquet APK vérifié par SHA et signature; flash MINI seulement via le chemin explicite avec sauvegarde et accord opérateur. Aucun workflow CI ne flashe du matériel.
8. **Ergonomie**: avatar animé piloté par états vrais (repos, attente de wake, écoute, réflexion, parole, erreur), contrastes et tailles tactiles accessibles; mêmes termes et codes d'état sur MINI, Android et Windows.

## Contrat minimal des événements

Tous les événements de la chaîne de conversation devraient porter un identifiant de tour opaque, un identifiant de périphérique autorisé, un horodatage/expiration et un état terminal unique.

Etats du tour: IDLE -> WAKE_DETECTED -> CAPTURING -> TRANSCRIBING -> THINKING -> RESPONDING -> IDLE.
Transitions interruptives depuis tout état actif: HALTED, PERMISSION_REVOKED, LINK_LOST, EXPIRED, ERROR.
Ces états sont un **contrat cible**, non la prétention que chaque client les implémente déjà.

Les preuves à conserver comprennent: transition émise, ACK protocole, résultat réellement appliqué, raison d'échec. Ne pas confondre un ACK de transport avec un succès utilisateur.

## Séquence de livraison

1. Réconcilier les branches MINI/APK/Companion et garder une seule source de vérité des contrats.
2. Compléter les comportements de wake, STT, TTS, affichage et sécurité de commande.
3. Raccorder les états et accusés sur chacun des trois clients, avec annulation et reprise.
4. Finaliser interfaces et graphismes, puis geler un SHA intégrant les trois.
5. **Seulement après complétude du code**, lancer la recette logicielle (compilation Android/Windows/firmware, contrats, émulateur et stress).
6. Faire la recette physique avec l'opérateur: Redmi 10 5G, MINI réelle et PC Windows; la CI seule ne suffit pas.

## Références existantes

- `docs/MINI-ANDROID-WINDOWS-TRIAD-AUDIT-2026-10-10.md`
- `docs/MINI-ANDROID-COMPANION-MAINTENANCE-20261013.md`
- `scripts/mini-triad-audit.mjs`
- `firmware/waveshare-terminal/main/mel_link_v2_server.cpp`
- `android-companion/app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt`
- `windows-companion/MEL-Companion.cs`

Ce document est un point de coordination. Les capacités non démontrées restent **à développer**, pas « terminées ».

## Module de réduction d'état livré dans cette PR

`src/devices/triad-conversation-state.js` implémente une machine à états **pure et réutilisable** avec contrôle des transitions, source, identifiant de tour/appareil, expiration de cinq minutes maximum, anti-régression temporelle et interruptions fermées. Aucun I/O : ce module ne pilote pas lui-même le BLE, le microphone ou le PC. Chaque client doit encore y raccorder ses événements réels et traduire ses états dans son langage natif. Les preuves d'exécution matérielle demeurent à obtenir.

## États d'interface et animation livrés comme contrat

`src/devices/triad-presentation-contract.js` expose des libellés français, un état d'animation d'avatar et un indicateur d'affichage du microphone pour chaque état conversationnel. `triadReadinessPresentation()` distingue explicitement **connecté** de **vérifié**. Ce module est pur : aucun appel réseau, BLE ni commande PC. Il reste à le raccorder aux trois moteurs d'interface natifs.

## Projection commune en lecture seule

Le module `src/devices/triad-snapshot-projection.js` transforme un état conversationnel et les trois états d'appareil en un instantané `mel.triad.presentation.v1` commun. La projection refuse les appareils absents/dupliqués et les déclarations « vérifié » sans preuve de session MINI ou autorisation Companion. L'expiration rend la conversation inactive; un simple ACK BLE ne suffit pas. Ce modèle ne publie pas de messages et n'ouvre ni microphone ni canal PC : les adaptateurs natifs doivent encore l'utiliser.
