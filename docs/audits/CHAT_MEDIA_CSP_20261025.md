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
