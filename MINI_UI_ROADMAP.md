# MINI — Roadmap UI MEL + voix

## Objectif canonique
Construire une interface MINI stable, visuellement cohérente avec MEL Mode Complet, légère pour LVGL 8.4 / ESP32-S3, et utilisable principalement à la voix.

## Règles UI
- [ ] Avatar EXACT du Mode Complet : `dist/assets/avatars/mel-full.webp`
- [ ] Pas de titre "MEL // MINI" en haut
- [ ] Écran principal minimal : avatar + heure + état Wi-Fi + bouton Réglages + bouton Parler
- [ ] Pas de chat texte visible
- [ ] Pas de barre de raccourcis visible
- [ ] Pas d'espace multimédia visible au repos
- [ ] Multimédia affiché UNIQUEMENT sur commande directe (web/audio/vidéo/contrôle distant)
- [ ] Retour automatique à l'écran principal après fermeture/fin d'usage multimédia

## Réglages
- [ ] Connexion Wi-Fi / état réseau
- [ ] État appairage MEL
- [ ] Test micro
- [ ] Test haut-parleur
- [ ] Test caméra
- [ ] Test Wi-Fi
- [ ] Test session MEL/backend
- [ ] Informations version / diagnostic
- [ ] Aucun réglage destructif par défaut

## Voix — chaîne fonctionnelle
- [ ] Bouton Parler déclenche l'enregistrement
- [ ] Capture audio propre
- [ ] Diagnostic niveau/clip/silence
- [ ] Upload audio correctement formaté
- [ ] Transcription française réelle
- [ ] Texte transcrit visible temporairement en diagnostic
- [ ] Envoi au chat MEL
- [ ] Réponse texte reçue
- [ ] TTS
- [ ] Lecture haut-parleur
- [ ] États UI : écoute / réflexion / réponse / erreur
- [ ] Reconnexion automatique sans réappairage

## Multimédia à la demande
- [ ] Mode WEB
- [ ] Mode AUDIO
- [ ] Mode VIDÉO
- [ ] Mode CONTRÔLE DISTANT
- [ ] Espace multimédia caché au repos
- [ ] Ouverture uniquement après intention explicite reconnue
- [ ] Bouton/commande de fermeture vers accueil
- [ ] Garde-fous et états "non disponible" propres si fonction non implémentable matériellement

## Performance / stabilité
- [ ] Pas de watchdog LVGL
- [ ] Pas d'écran blanc
- [ ] Pas de fuite mémoire visible
- [ ] Caméra + audio + Wi-Fi coexistants
- [ ] UI fluide
- [ ] Redémarrage propre
- [ ] Wi-Fi mémorisé
- [ ] Appairage mémorisé

## Plan d'exécution
### Phase 1 — Avatar natif stable
- [ ] Convertir l'avatar Mode Complet en RGB565 optimisé
- [ ] L'embarquer comme ressource C
- [ ] Remplacer le visage synthétique par l'image
- [ ] Supprimer le titre supérieur
- [ ] Conserver UI légère
- [ ] Compiler / flasher / test watchdog

### Phase 2 — Accueil + réglages
- [ ] Heure
- [ ] Wi-Fi
- [ ] bouton réglages
- [ ] panneau réglages
- [ ] tests matériels

### Phase 3 — Voix bout en bout
- [ ] logs HTTP précis
- [ ] corriger STT si nécessaire
- [ ] corriger chat si nécessaire
- [ ] corriger TTS/lecture si nécessaire
- [ ] test phrase complète réelle

### Phase 4 — Multimédia contextuel
- [ ] machine d'état multimédia cachée
- [ ] web
- [ ] audio
- [ ] vidéo
- [ ] contrôle distant
- [ ] fermeture/retour accueil

### Phase 5 — Audit final
- [ ] 10 redémarrages
- [ ] 10 appels voix
- [ ] tests réglages
- [ ] tests Wi-Fi coupé/rétabli
- [ ] test backend indisponible
- [ ] test absence watchdog
- [ ] build release + artifact final

## État actuel
- Firmware stable installé : e615c1f
- Wi-Fi mémorisé : OK
- Appairage/token mémorisé : OK
- MEL ONLINE : OK
- Micro signal brut : OK
- Avatar Mode Complet identifié : OK
- UI actuelle : stable mais à remplacer
