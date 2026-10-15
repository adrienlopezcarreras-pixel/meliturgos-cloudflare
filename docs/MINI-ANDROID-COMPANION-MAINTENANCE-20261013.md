# Companion Windows — maintenance Android par Wi-Fi

Statut : **candidat PR #1277**. Tests logiciels distincts des preuves de fonctionnement sur le téléphone réel.

## Ce que le Companion réalise

Le Companion Windows 2.3.12 dispose déjà du canal propriétaire PC-Control. La PR ajoute trois actions spécifiques, avec approbation locale du contrôle à distance :

- Android maintenance assess : détecter les appareils ADB, leur état d'autorisation et le transport Wi-Fi, sans installation.
- Android maintenance stage : copier un APK MEL depuis Téléchargements, sous un nom de fichier borné, vers le cache local MEL/android-releases. SHA-256 vérifié avant et après.
- Android maintenance install : cibler uniquement fr.veriteinterdite.mel sur une adresse Wi-Fi privée préalablement appairée. Vérifier SHA, signature Android et version. Sauvegarder le base.apk existant, comparer les certificats et refuser rétrogradations ou signatures étrangères. Installer par adb install -r, puis contrôler la version.

Les actions de copie et d'installation nécessitent l'authentification propriétaire et les accusés d'approbation explicites. La tâche GitHub en lecture seule ne peut jamais installer. L'option locale remote_access_enabled=false bloque également ces commandes. Un script PowerShell non nul produit un échec réel, pas une réussite trompeuse.

## Préparation initiale du téléphone

1. Installer officiellement Android SDK Platform Tools + Build Tools sur le PC. Définir ANDROID_SDK_ROOT ou ANDROID_HOME.
2. Sur Android 11 ou plus récent : Options développeur → Débogage sans fil → Associer avec un code.
3. Sur Windows, utiliser adb pair avec le port d'appairage et le code approuvé sur le téléphone, puis adb connect avec le port de connexion ; vérifier adb devices -l = device. PC et téléphone sur un réseau Wi-Fi privé.
4. Télécharger l'APK signé provenant du workflow CI exact-SHA, relever son SHA-256 ; demander sa mise en cache contrôlée, puis la mise à jour.

## Limites importantes

Le Bluetooth Link V2 sert à la communication et aux diagnostics entre l'APK Android et la MINI. Il ne peut pas installer silencieusement un APK sur Android. Une autre voie via PackageInstaller exigerait une validation explicite sur le téléphone.

La sauvegarde pré-installation ne copie que le paquet APK existant et **pas les données privées**. Le rollback et les tests réels de voix, BLE, caméra, permissions et 30 reconnexions restent à valider. Aucun flash MINI, effacement Android ou réinitialisation de données n'est introduit.

## Appairage guidé, livré avec Companion Windows

Le paquet Windows contient désormais `MEL-Android-WiFi-Pairing.ps1`. Sur le PC, avec le SDK Android officiel installé :

- Exécuter localement le script sans argument pour vérifier les appareils et les prérequis ADB.
- Ouvrir les paramètres Android du téléphone : **Paramètres → Paramètres supplémentaires → Options pour les développeurs → Débogage sans fil**. Sur certains Xiaomi, il faut d'abord toucher sept fois « Version MIUI » dans « À propos du téléphone » pour rendre les options développeur visibles.
- Choisir « Associer un appareil avec un code d'appairage ». Exécuter **localement** `powershell.exe -NoProfile -File .\MEL-Android-WiFi-Pairing.ps1 -Pair`.
- Entrer dans le terminal Windows l'adresse et le port **d'appairage** affichés sur Android, puis saisir le code uniquement quand ADB le demande. Ensuite entrer l'adresse et le **port de connexion** indiqués sur l'écran principal de débogage sans fil.
- Le script refuse les adresses extérieures au réseau privé et ne transmet jamais le code d'appairage à MEL, GitHub ou Cloudflare. Il ne copie ni n'installe aucun APK. Quand ADB indique `device`, la commande Companion `android.maintenance.assess` peut en apporter la preuve.

**Limites :** cette méthode d'appairage Android sans fil nécessite Android 11 ou ultérieur et le support du constructeur. Un Android plus ancien peut nécessiter un premier branchement USB pour activer ADB TCP/IP. Ne jamais activer ADB sur un réseau Wi‑Fi public ou non fiable.

## Copie et planification OTA MINI (sans flash)

- `mini.maintenance.stage` : action propriétaire via Companion Windows, nécessite `filename` (nom simple se terminant par .bin), `sha256` (64 chiffres hexadécimaux) et `ack_local_firmware_stage: true`. Le programme lit uniquement le fichier dans Téléchargements, exige un en-tête ESP32-S3 avec indicateur SHA intégré, vérifie le SHA-256, puis copie vers le cache `%LOCALAPPDATA%\\MEL\\mini-firmware\\<sha256>.bin` avec nouveau contrôle d'intégrité. Le stage vérifie désormais tous les segments, leur checksum et le SHA-256 embarqué avant copie ; il reste `flash_allowed=false` et `partition_fit_verified=false`.
- `tools/mini-updater/plan_ota_upgrade.py` : qualification **hors ligne** d'une sauvegarde créée avec succès (partition dump, otadata, ota_0.bin, status.json, verification.json), recompute le hash SHA-256 et les contrôles du binaire original, compare la version candidate et la capacité de `ota_1`. Utilisation : `python plan_ota_upgrade.py --backup-dir <chemin-sauvegarde> --firmware <chemin-bin> --expected-sha256 <empreinte>`.
- Même quand toutes les preuves hors ligne sont bonnes, le plan retourne `OFFLINE_PLAN_VERIFIED_FLASH_BLOCKED`, `flash_allowed=false`. La sélection otadata ne prouve **pas** le slot réellement exécuté. Les propriétés du bootloader, du chiffrement flash, du secure boot, du rollback et la restauration NVS restent à valider physiquement.
- La branche **ne fournit pas encore de commande de flash ou restauration exécutable à distance**. Un vieux job `STALE_CANDIDATE` ne doit pas être supprimé pour forcer un succès.

**Important :** le paquet Windows 2.3.13 contient l'assistant de connexion Android, mais pas encore un environnement Python embarqué pour exécuter le plan MINI. Ce plan est testé dans GitHub CI ; ne pas confondre avec un flash MINI automatisé.

## Précontrôle USB depuis le paquet Windows

Le ZIP `MEL-Windows-2.3.14.zip` contient désormais `MEL-MINI-USB-Preflight.ps1` et les quatre modules Python du précontrôle. Sur le PC **où la MINI est physiquement branchée**, installer Python 3 et `esptool` dans cet environnement puis ouvrir PowerShell dans le dossier décompressé. Exécuter `powershell.exe -NoProfile -File .\MEL-MINI-USB-Preflight.ps1 -Port COM4` en remplaçant COM4 par le port confirmé. Le programme demande une confirmation **saisie localement** car une connexion bootloader peut réinitialiser l'appareil ; il ne comporte aucune commande de flash et ne démarre pas automatiquement.

Les rapports sont déposés dans `%LOCALAPPDATA%\MEL\mini-usb-evidence\<identifiant>`. Une sélection OTA déduite des métadonnées ne garantit pas le slot réellement exécuté. La fenêtre PowerShell reste distincte du service Companion : il n'existe pas de bouton de flashage distant validé. En l'absence de Python/esptool, d'une table réelle, d'une sauvegarde intégrale et d'un plan de restauration vérifié, **aucun flashage n'est permis**.
