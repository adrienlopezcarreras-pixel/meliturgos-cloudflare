# MEL Android Companion — état du dépôt (10/10/2026)

## Version effectivement présente sur `main`

`0.6.58-mini-stable-bridge`, déclarée dans `app/build.gradle.kts` et
`MelApiClient.kt`. Application native Compose, avec chat MEL, appairage,
microphone Android, TTS, statut Companion, Media/File et synchronisation.

La version `0.7.9-mini-local-fr-tts` existe sur une branche expérimentale
(`rebuild/mini-v0.6.0-audio-link-20261007`, PR #1142) mais **ne doit pas**
être confondue avec l'APK compilée depuis `main`.

## Blocage d'interopérabilité avec MINI 0.6.14

La MINI sur `main` est un serveur BLE Link V2 (`M2`, service ABF0,
ABF1/ABF2/ABF3). L'APK actuelle démarre `MelBleBridgeService` en tant
que serveur GATT Android. Il lui manque le client BLE central V2 et
l'autorisation `BLUETOOTH_SCAN` requise pour scanner sur Android 12+.

**En conséquence, compilation APK verte != liaison MINI ↔ Android validée.**
Voir `docs/MINI-ANDROID-WINDOWS-TRIAD-AUDIT-2026-10-10.md` et son
script `scripts/mini-triad-audit.mjs`.

## Sécurité

- Le téléphone ne conserve pas le mot de passe propriétaire.
- Appairage par code à usage unique et jeton local Android Keystore AES/GCM.
- Connexions API HTTPS et contrôle de révocation.
- Vérifier les permissions micro/Bluetooth au moment de l'utilisation.
- Ne jamais publier le firmware MINI ni l'installer automatiquement depuis
  l'application pendant une validation CI.

## Critères pour déclarer la liaison terminée

APK Link V2 central compilée au SHA exact, test Bluetooth complet sur
téléphone réel, reconnexions à répétition, STT, TTS français, STOP VOIX,
Wi-Fi fallback, états chat et vérification MINI physiquement présente.
Aucune preuve simulée ou statique ne remplace ces essais.
