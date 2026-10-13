# MEL Android — architecture MINI Link V2 (candidat 0.7.10)

L'APK de la branche de correction `fix/mini-linkv2-android-main-20261010`
emploie Android en **central GATT** et la MINI en **périphérique GATT**
(service ABF0 ; RX ABF1, event TX ABF2, bulk RX ABF3).
Elle conserve la navigation actuelle Compose, le chat, les médias,
les tâches Android et les fonctions de son interface principale.

La branche `main` et les anciens APK `0.6.58-mini-stable-bridge`
employaient un serveur GATT Android incompatible avec la nouvelle MINI.
Ce système ancien est désormais désactivé dans le manifeste du candidat.

## Sécurité et appairage

L'application demande `BLUETOOTH_SCAN` et `BLUETOOTH_CONNECT` sur
Android 12+, découvre le service ABF0, demande l'appairage système
avant le MTU et attend ensuite la souscription GATT. Les écritures
vers la MINI doivent être **chiffrées**. Le code préserve Android Keystore
pour ses tokens et refuse les transferts hors session.

HELLO ne suffit pas : Android attend maintenant une confirmation
`ACK / SESSION_OK` envoyée après la validation de la SESSION par la
MINI. Une attente de plus de dix secondes est diagnostiquée comme
`SESSION_ACK_TIMEOUT` et déclenche la reconnexion.

L'appairage Bluetooth *Just Works* protège contre l'écoute passive,
pas contre toutes les attaques de type homme-du-milieu. Ne pas diffuser
d'APK stable avant preuve physique et décision de sécurité sur
l'authentification renforcée.

## Voix

STT : ES8311 / 48 kHz -> décimation 16 kHz -> ADPCM -> BLE ->
Android WAV16k -> serveur MEL.
TTS : Android voix française locale -> PCM48 -> ADPCM -> BLE -> ES8311.
Secours vocal Android : voix système française, PCM48 et MP3.
STOP VOIX et déconnexion doivent interrompre les transferts proprement.
Les réponses HTTP sont lues avec un plafond de 512 Kio (STT) ou
8 Mio (API générale), et les échantillons ADPCM reçus ne peuvent pas
dépasser la longueur annoncée.

## Tests avant publication

CI : compilation `:app:assembleDebug`, tests Kotlin, tests
d'interface émulateur, fuzzing 10 000 trames, 1 000 blocs ADPCM,
contrats croisés et paquet Companion Windows.
Physique : 30 connexions/reconnexions, 10 STT, 10 TTS, BLE/wi-fi
simultanés, caméra, arrêt de voix, réveil, perte réseau et récupération.

**Statut : candidat, NON DONE_VERIFIED matériellement.**
Voir `docs/MINI-ANDROID-WINDOWS-TRIAD-AUDIT-2026-10-10.md`.
