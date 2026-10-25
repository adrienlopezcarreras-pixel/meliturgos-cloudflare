# Chat MEL : médias et compréhension — 25 octobre 2026

Statut : correction locale testée, publication et validation production à suivre. Aucun succès de fournisseur de production n'est déduit de fixtures locales.

## Ruptures reproduites

1. Le véritable point d'entrée (`wrangler.jsonc` → `visual-final-entry.js`) ajoutait `img-src 'self' data: blob:` et `media-src 'self' data: blob:` à toutes les réponses. Ces directives sont également observées par HTTPS sur la production. Elles bloquaient les URLs HTTPS publiques que le renderer du chat préparait correctement. Les tests DOM n'appliquent pas la CSP ; le précédent test Chromium servait sa page de preuve sans les en-têtes canoniques et appelait `src/index.js` directement.
2. Le classificateur média ignorait des formulations ordinaires comme « Tu peux me montrer une photo de Rome ? » et « Je voudrais deux images de Montréal ». Les requêtes reconnues transmettaient parfois toute la consigne à Commons ; son nettoyage supprimait ensuite des mots partout dans le titre, au lieu de retirer uniquement la commande.

## Correction canonique

- La CSP autorise les corps d'images/audio/vidéos HTTPS. Les scripts et connexions restent limités comme auparavant ; objets intégrés et framing de MEL restent interdits. Les frames conservent `self` et ajoutent seulement les lecteurs YouTube sans cookies et Vimeo. Le renderer conserve ses contrôles d'URL, de réseau privé, de MIME, de SVG et de provenance.
- Le classificateur existant normalise les demandes conversationnelles, distingue toujours demande de média / explication / pièce jointe / négation, puis extrait uniquement le sujet et la quantité. La recherche réutilise ce même classificateur et ne supprime plus des mots au milieu d'un titre. Aucun nouveau moteur d'exécution.
- Le test navigateur existant appelle maintenant l'entrée déployable et sert la vraie CSP. Il vérifie aussi des médias HTTPS externes (interceptés localement), les deux lecteurs intégrés autorisés, et le blocage d'un script, d'une connexion et d'une frame arbitraires. La CI se déclenche également lors d'une modification de l'entrée CSP.

## Preuves et limites

- Reproduction sur le parent avec la CSP canonique : Chromium ne peut pas lire les médias externes (`The element has no supported sources`).
- 150 tests locaux réussis : routage en modes Normal/Code, JSON d'outil non affiché, flux/historique, médias et protections voisines. Contrat CSP retesté après ajout explicite de `self` aux frames.
- Chromium réel : image externe décodée, audio et vidéo externes réellement lus ; lecture et recherche privée via réponses Range 206 ; iframes YouTube/Vimeo autorisées, script externe non exécuté, connect-src et frame-src arbitraires bloqués. Les images/vidéos sont des fixtures déclarées ; le son privé est produit par le vrai DSP gratuit. Aucune IA payante ni ressource Cloudflare de production dans ce test.
- Reçu local : `/tmp/mel-chat-browser-final.json`, capture locale `/workspace/MEL_CHAT_MEDIA_BROWSER_20261025.png`.
- L'accès direct à Commons depuis cet environnement reçoit un refus CONNECT 403, y compris après tentative hors sandbox autorisée. Ceci ne prouve pas une panne du fournisseur depuis le Worker. La recherche publique réelle et l'interface de production authentifiée restent à vérifier ; aucun identifiant propriétaire n'est affiché ou demandé dans le code.
- Aucun état DONE_VERIFIED modifié. Aucun reset, aucune modification D1 ou copie R2. Les développements concurrents de main sont préservés.

XP MEL : NON. Chantier global IN_PROGRESS.

## Synthèse des questions explicatives après lecture d'état

Le parcours réel `/api/chat` présente une seconde rupture distincte : une lecture `autonomy.status` renvoie immédiatement une réponse déterministe pour toute demande, même « explique pourquoi MAX est bloqué et pourquoi les images ne sont pas affichées ». Reproduction avec SQLite réel : lecture réussie, zéro appel au modèle, seconde partie ignorée.

Le chat conserve le chemin rapide factuel pour une simple demande de statut et pour les commandes. Une lecture réussie demandant une explication ou une analyse devient désormais un contexte de l'inférence existante : la réponse traite la question, puis conserve les faits vérifiés du runtime. Les résultats restent soumis aux filtres de preuves et aux gardes existants. Une lecture échouée est décrite comme une lecture échouée, jamais comme un cycle qui aurait été lancé.

Validation locale : 110 tests ciblés réussis et syntaxe réussie. Le nouveau test SQLite passe en modes Conversation et Code, vérifie la présence de la réponse aux deux parties, l'absence de mission créée et l'identité inchangée du contrôle propriétaire. Un appel autonomy.tick proposé en JSON par le modèle n'est pas exécuté. Les tests existants de commandes non bloquantes et d'ancrage sur les preuves restent verts. Aucun fichier du moteur MAX ni de sa persistance n'est modifié.

En complément du premier lot, le contrôle public depuis GitHub Actions 40218851366 / job 121245811898 a réellement récupéré image, audio et vidéo depuis Commons : trois HTTP 200, reçus non vides. Ce test ne certifie pas la session propriétaire ni les modèles de production. La PR #2684 a été fusionnée dans bef659cf ; sa release canonique 40219569562 est en cours au moment de ce checkpoint. Aucune réussite de déploiement final n'est déduite de la fusion.

XP MEL : NON. Chat IN_PROGRESS.

Le chemin de réponse factuelle est partagé par le statut rapide et le repli après échec des modèles. Le reçu expose alors analysis_available=false et analysis_error=CHAT_INFERENCE_FAILED ; le texte conserve la lecture réussie et annonce que l’explication manque. La régression vérifie aussi qu’aucun corps d’erreur fournisseur n’est recopié dans la réponse et que le contrôle propriétaire reste intact.
