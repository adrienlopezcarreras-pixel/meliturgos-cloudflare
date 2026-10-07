# MEL MINI — architecture compagnon complet

Version cible : MINI 0.5.x Link V2 / Android 0.7.x.

## Règle fondamentale

MEL MINI est un compagnon matériel complet, mais n'est pas le stockage des médias utilisateur.

- La MINI possède les capteurs et l'interface : écran tactile, OV5640, microphone, haut-parleur.
- Android possède le stockage durable des photos, vidéos et enregistrements audio.
- Le téléphone possède aussi le moteur Web complet.
- La mémoire/flash MINI ne doit jamais devenir une photothèque, une vidéothèque ou un dictaphone.
- Les buffers caméra/audio MINI sont temporaires et libérés immédiatement après transfert.

## Transports

### BLE Link V2 — toujours disponible

BLE reste le plan de contrôle : HELLO / SESSION / horloge téléphone ; identité et appairage MINI ; heartbeat/chat/STT/TTS ; commandes courtes ; profil OK MEL ; négociation du canal média.

MINI est peripheral/GATT server. Android est central/GATT client.

### Wi-Fi local éphémère — médias et rendu Web

Pour les charges volumineuses, Android ouvre un LocalOnlyHotspot uniquement lorsque MINI le demande.

Android envoie à MINI, via BLE et uniquement en RAM : SSID, passphrase, port du récepteur média et jeton aléatoire éphémère.

MINI rejoint temporairement ce réseau en mode STA. Le serveur média tourne sur le téléphone. Après le transfert, MINI libère la connexion Wi-Fi média ; BLE reste le transport principal.

Ce réseau local ne sert pas à authentifier MEL et ne remplace pas la connexion Internet du téléphone.

## Stockage Android

Les médias venant de MINI sont publiés via MediaStore :

- photo : Pictures/MEL/*.jpg ;
- vidéo : Movies/MEL/*.avi, Motion JPEG provenant directement des frames OV5640 ;
- audio : Recordings/MEL/*.wav.

Les buffers temporaires nécessaires à l'encapsulation AVI/WAV sont sur le téléphone et supprimés après publication.

## Caméra

### Photo

OK MEL → prends une photo → capture OV5640 → JPEG en RAM → transfert au téléphone → MediaStore → libération immédiate du framebuffer et du JPEG.

### Vidéo

OK MEL → filme 10 secondes → frames JPEG successives → transfert immédiat → encapsulation AVI/MJPEG sur Android → Movies/MEL. La MINI ne conserve jamais la séquence complète.

## Microphone

### Conversation MEL

OK MEL réveille localement MINI. La commande suivante est enregistrée, transcrite via le téléphone, exécutée par MEL et la réponse revient en TTS sur le haut-parleur MINI.

### Dictaphone

OK MEL, enregistre 30 secondes → PCM 48 kHz mono par blocs de 100 ms → transfert immédiat → WAV final dans Recordings/MEL → aucune copie durable sur MINI.

## Réveil vocal

Le détecteur OK MEL est local à la MINI. Il continue de tourner lorsque le micro est disponible, la MINI est au repos et soit la session MEL est validée, soit le Link V2 Android est physiquement prêt.

Flux cible de type assistant vocal : OK MEL → OUI ? → commande → action → confirmation vocale.

## Web

MINI ne tente pas d'exécuter Chromium.

Pour afficher une vraie page : MINI transmet l'URL au téléphone par le canal média local ; Android charge la page dans WebView ; Android rend une vue 320 × 320 ; conversion en RGB565 ; transfert direct en RAM vers MINI ; affichage par mini_ui_show_rgb565().

La page rendue n'est pas persistée sur MINI.

## Horloge

La MINI doit obtenir l'heure dès le handshake BLE, même sans Wi-Fi. SESSION Android contient epoch_ms, utc_offset_seconds et timezone. MINI applique settimeofday() et TZ. SNTP reste seulement un secours lorsque le Wi-Fi Internet autonome est réellement utilisé.

## Invariants de validation

Une version ne peut être déclarée physiquement prête que si elle passe : heure correcte après démarrage BLE sans Wi-Fi ; 30 cycles de reconnexion BLE ; 10 commandes OK MEL ; 10 STT + réponses TTS ; 10 photos visibles dans Pictures/MEL ; 3 vidéos de 10 s lisibles depuis Movies/MEL ; 3 enregistrements WAV visibles dans Recordings/MEL ; 10 pages Web affichées sur MINI ; aucune photo/vidéo/audio persistante laissée sur le stockage MINI ; perte du téléphone avec retour propre au fallback réseau prévu.