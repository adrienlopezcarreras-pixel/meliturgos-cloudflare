# MINI — Roadmap compagnon total MEL

## Objectif canonique
Faire de la Waveshare ESP32-S3 Touch LCD 3.5 un terminal compagnon MEL complet, centré voix, relié prioritairement au téléphone Android par Bluetooth, avec accès indirect aux capacités Internet et aux services du téléphone. La MINI ne doit pas dupliquer Android : le téléphone réalise les traitements lourds, la MINI reste un terminal rapide, vocal et visuel.

## Architecture de référence
- [DONE] Android est la passerelle Internet principale lorsque la MINI est reliée en Bluetooth.
- [DONE] GATT BLE transporte commandes, état, authentification, heure, heartbeat, STT/chat/TTS et petits contenus.
- [NEXT] L2CAP CoC transporte les gros flux : images, captures de pages, fichiers et audio volumineux.
- [NEXT] CompanionDeviceManager / CompanionDeviceService gèrent la présence et la reconnexion système Android.
- [DONE] Les réponses GATT sont fragmentées sous la limite de valeur caractéristique BLE.
- [DONE] Les gros uploads MINI -> Android sont fragmentés et contrôlés.
- [DONE] Android garde la connexion Internet ; aucune dépendance au Wi-Fi direct de la MINI n'est requise.
- [NEXT] Pour web/image/vidéo, Android rend ou adapte le contenu ; la MINI affiche une représentation légère.

## Interface MINI
- [DONE] Avatar canonique Mode Complet.
- [DONE] Écran principal minimal avec avatar, heure, état, réglages et Parler.
- [DONE] Pas de chat texte permanent ni d'espace multimédia au repos.
- [DONE] Push-to-talk : pression = enregistrement, relâchement = arrêt + envoi.
- [NEXT] Vue multimédia contextuelle plein écran avec retour accueil.
- [NEXT] Gestes simples : retour, défilement, précédent/suivant.

## Heure / présence / réseau
- [DONE] Heure envoyée par Android dans le bridge BLE.
- [DONE] MINI sait régler son horloge système depuis epoch + offset téléphone.
- [DONE] Resynchronisation heure/profil prévue à chaque reconnexion physique BLE.
- [PARTIAL] Stabilité BLE : reconnexion automatique fonctionne, mais boucle NimBLE observée à auditer sur matériel.
- [DONE] Heartbeat Internet via Android observé en HTTP 200.
- [DONE] Micro-coupures courtes masquées côté UI.

## Voix
- [DONE] Capture micro.
- [DONE] STT serveur via Bluetooth Android.
- [DONE] Chat MEL.
- [DONE] TTS + lecture haut-parleur.
- [DONE] Heartbeat suspendu pendant la chaîne voix.
- [DONE] Intégrité des writes BLE contrôlée.
- [NEXT] Validation matérielle répétée : 10 appels voix consécutifs sans perte BLE.

## Réveil « OK MEL »
- [DONE] Enrôlement Android prévu sur 6 prises.
- [DONE] Profil compact 48 caractéristiques, aucun audio brut envoyé à la MINI.
- [DONE] Persistance Android corrigée : stockage synchrone/atomique et compteur final conservé.
- [DONE] Détecteur Android silencieux basé sur AudioRecord, sans SpeechRecognizer en boucle.
- [DONE] Synchronisation du profil vers MINI via BLE.
- [DONE] Détecteur local MINI par similarité acoustique.
- [NEXT] Recalibrer seuil / faux positifs sur essais réels.
- [NOTE] Ce profil 6x est un wake-word personnalisé, pas une authentification biométrique et pas un modèle WakeNet entraîné.
- [FUTURE] WakeNet ESP-SR officiel si un modèle personnalisé entraîné devient disponible.

## Android compagnon
- [DONE] Foreground service connectedDevice pour le bridge BLE.
- [DONE] Permissions Bluetooth modernes.
- [DONE] Socle CompanionDeviceService ajouté pour présence système Android compatible.
- [NEXT] Association système CompanionDeviceManager dans l'UI, avec confirmation utilisateur Android.
- [NEXT] Observation de présence associée et suppression progressive des boucles de reconnexion applicatives.
- [NEXT] L2CAP CoC Android pour gros transferts.

## Internet visuel MINI
### Texte / recherche
- [DONE] La MINI peut déjà appeler MEL/chat via Android et obtenir des réponses Internet.
- [PARTIAL] Les réponses vocales MEL peuvent désormais exposer des cartes web sourcées sur la MINI ; les commandes explicites « cherche », « ouvre », « montre » restent à finaliser.
- [DONE] Vue résultats web : titre + extrait + compteur WEB x/y + navigation tactile (tap suivant, appui long précédent).

### Pages web
- [NEXT] Android WebView charge la page.
- [NEXT] Android extrait texte lisible + titre + URL.
- [NEXT] Android peut générer une capture adaptée à l'écran MINI.
- [NEXT] MINI affiche texte paginé ou capture avec défilement.

### Images
- [PARTIAL] Android sait déjà streamer les assets Internet vers la MINI ; la conversion automatique d’images web arbitraires en MIMG reste à brancher.
- [DONE] Format visuel MINI MIMG/RGB565 pris en charge jusqu’à 320x320 avec buffer PSRAM.
- [PARTIAL] Transport bulk fonctionnel en GATT fragmenté/streamé via Android ; migration L2CAP CoC conservée pour les gros débits.
- [DONE] Affichage direct LVGL RGB565 depuis asset MIMG streamé, tap pour revenir à MEL.

### Vidéo
- [NEXT] MINI affiche vignette, titre, durée et commandes.
- [NEXT] Lecture principale déportée sur Android.
- [FUTURE] Flux léger MJPEG/frames réduites seulement si les mesures débit/RAM le permettent.
- [BLOCKED] Pas de navigateur Chromium ni décodage vidéo généraliste natif sur ESP32-S3.

## Accès aux capacités Android / PC
- [DONE] Android : heure, réseau, micro, TTS, caméra, fichiers, intents et web déjà disponibles à différents niveaux.
- [NEXT] Exposer à la MINI un registre de capacités Android explicite et versionné.
- [NEXT] Commandes MINI -> Android : ouvrir app/page, lancer média, photo, navigation, fichier, etc.
- [NEXT] PC : relais MEL autorisé par capacités, jamais accès brut au disque/applications.
- [NEXT] Même modèle de permissions pour fichiers, navigateur, médias et outils PC.

## Transport gros flux — L2CAP CoC
- [NEXT] Activer CONFIG_BT_NIMBLE_L2CAP_COC_MAX_NUM=1 sur MINI.
- [NEXT] Dimensionner MSYS/SDU buffers après mesure mémoire réelle.
- [NEXT] Canal CoC authentifié si possible, sinon contrôle d'intégrité applicatif + session MEL.
- [NEXT] Protocole de trames : type, longueur, id, checksum, reprise.
- [NEXT] Mesure débit réel 50/100/250/500 Ko.
- [NEXT] Fallback automatique vers GATT fragmenté pour petits contenus.

## Stabilité / validation
- [NEXT] 10 redémarrages MINI.
- [NEXT] 10 reconnexions Android/MINI.
- [NEXT] 10 réveils OK MEL Android.
- [NEXT] 10 réveils OK MEL MINI.
- [NEXT] 10 appels voix consécutifs.
- [NEXT] Heure correcte après boot, reconnexion et changement timezone.
- [NEXT] Test Bluetooth coupé/rétabli.
- [NEXT] Test Android fermé/réouvert.
- [NEXT] Test backend indisponible.
- [NEXT] Mesure heap/PSRAM pendant wake + voix + image.
- [NEXT] Absence watchdog / écran blanc / fuite mémoire.

## État actuel — 26/09/2026
- Firmware MINI installé : bb5655b2.
- Firmware MINI candidat reconnexion/resync : 488a1361 en CI.
- Android installé chez l'utilisateur avant nouveau lot : 0.6.34-motion-no-mouth.
- Android candidat : 0.6.35-wake-live en CI.
- Internet MINI via Bluetooth Android : VALIDÉ sur heartbeat HTTP 200.
- Heure téléphone -> MINI : code présent, validation live à refaire avec Android 0.6.35.
- OK MEL : ancien lot non fiable ; correctifs persistance + écoute silencieuse intégrés dans 0.6.35.
- BLE : boucle NimBLE controller observée après essais ; redémarrage + nouveau firmware à valider.

## Priorité d'exécution
1. Fermer 0.6.35 Android + 488a1361 MINI et valider heure / profil / wake-word.
2. Stabiliser définitivement la reconnexion BLE.
3. Associer MINI via CompanionDeviceManager.
4. Activer L2CAP CoC et mesurer le débit.
5. Livrer image RGB565 sur MINI.
6. Livrer page web lisible/capture.
7. Livrer vidéo compagnon (vignette + contrôle Android).
8. Étendre le même registre de capacités vers le PC.
9. Audit final complet.
