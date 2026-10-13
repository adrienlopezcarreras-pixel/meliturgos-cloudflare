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
