# MEL MINI — Waveshare ESP32-S3-Touch-LCD-3.5-C

## Référence logicielle

La branche `main` embarque le firmware de récupération
`0.6.14-pa-ctrl` : base Waveshare officielle épinglée au commit
`283ec84c566c096f8c30493b93dcd4b0bb608de7`, ESP-IDF 5.4.2.
Matériel visé : écran 320 × 480, tactile FT6336, caméra OV5640,
codec ES8311, PMIC AXP2101.

MINI agit en **périphérique/serveur BLE Link V2** (M2, ABF0-ABF3).
L'APK Android compatible doit agir comme **central/client BLE**, valider
l'appairage et le protocole, puis assurer STT/TTS et la connexion MEL.
Le code APK actuellement dans `main` n'est **pas encore compatible** :
voir `docs/MINI-ANDROID-WINDOWS-TRIAD-AUDIT-2026-10-10.md`.

La caméra, le Wi-Fi, le microphone, la sortie ES8311, l'écran,
le stockage FAT interne et l'OTA sont intégrés au firmware, mais leur
fonctionnement combiné sur l'appareil réel reste à vérifier pour cette
version exacte. Des preuves matérielles obtenues avec une version
précédente ne valident pas automatiquement cette image.

## Mise à jour et sécurité

- Les resets restent manuels. Aucune tâche planifiée ni diagnostic
  Github Actions ne doit redémarrer physiquement la MINI.
- Les builds CI ne publient que des artefacts `candidate` non activables.
- Firmware OTA et image USB ont des SHA-256 distincts ; l'image USB complète
  ne doit **jamais** être flashée sur une MINI déjà appairée sans sauvegarde
  des partitions/NVS et opérateur présent.
- La présence de `ota_0` et `ota_1` ne démontre pas le rollback
  automatique : voir `docs/mini-firmware-safe-update-rollback.md`.

## Stress et preuves attendues

Le test `tests/mini-triad-protocol-stress.cpp` exerce les vrais codecs
Link V2 / ADPCM en boucle **sur un runner**, sans prétendre faire
parler le haut-parleur physique. Sur la vraie MINI : 30 reconnexions
BLE, 10 transcriptions successives, 10 réponses vocales, camera,
USB/récupération, Wi-Fi, sommeil, charge, UI/tactile et journaux
doivent encore être validés avant `DONE_VERIFIED`.
