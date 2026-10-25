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


## Test réel du chat, puis correctif de routage des conseils

Le workflow production existant `mel-chat-live-selftest`, run 40221225972, a appelé le vrai chat sur bef659cf avec les cas `short,plan` (aucun prompt propriétaire). Résultat : short réussi via `pc:qwen3:8b`, premier texte après 21 898 ms et archivage confirmé ; plan échoué après 6 687 ms, HTTP 503 / CHAT_INFERENCE_FAILED. La disponibilité professionnelle du chat Cloud n'est donc pas confirmée. La cause fournisseur/budget précise n'est pas inventée.

Une erreur de routage distincte est reproduite localement : les mots « lancer » ou « créer » dans une demande de plan pouvaient ouvrir la boucle d'outils ou une demande de développement, alors que l'objet demandé était une explication ou un document. Un prédicat partagé dans la couche d'intention du chat est maintenant utilisé par la détection de développement, la préclassification sémantique et la boucle d'outils. Les conseils/plans restent des conversations ; une instruction explicite séparée (« explique puis corrige ») reste traitée comme une action. Aucun changement du moteur MAX.

Régression via le vrai handler du chat : le plan synthétique en cinq étapes sort en NDJSON avec un seul appel d'inférence en streaming, sans modèle de pré-planification ni action. Le self-test récupère aussi uniquement des codes fournisseur autorisés et lit le compteur estimé existant en SELECT, sans création de table, remise à zéro ou modification du plafond. Ce compteur n'est pas présenté comme une facture Cloudflare. La CI contractuelle du self-test n'utilise aucun secret ; les tests de production restent réservés au déclenchement manuel.

Validation locale : 111 tests ciblés réussis et syntaxe réussie. Ces changements sont préparés hors ligne : l'authentification GitHub de la session a cessé de fonctionner, API 401 et Git natif non authentifié, y compris depuis le checkout initial. Le jeton injecté est présent mais inutilisable. Aucun secret nouveau n'est requis ni demandé en clair. Publier et vérifier ce lot nécessite de renouveler l'accès de la session au dépôt, puis de réconcilier le HEAD courant.

XP MEL : NON. Aucun résultat en production n'est attribué à ce lot non publié.

Reprise : l’accès API et Git de la session a été revérifié avec succès. La PR #2686 est fusionnée en 36f1f06de6312458940840fba15be6f3677a5127 après ses contrôles verts. Le lot de conseil est réconcilié avec les développements concurrents, sans modification des boutons pris en charge par une autre page.

## Conservation des médias après échec de synthèse — reprise sur 9bb7650d

La PR #2691 est déjà fusionnée. Le main courant contient également le repli photo ajouté par une autre page (#2699). Ce repli spécifique est remplacé par le chemin commun des médias terminés : images, audio et vidéo passent par les mêmes contrôles, rendu, Council et archivage. Aucun moteur parallèle ajouté. La réponse et l’archive indiquent explicitement analysis_available=false lorsque tous les modèles échouent. Les résultats en attente ou avec une URL refusée ne deviennent pas des réussites.

Preuves : six régressions modes Conversation/Code × image/audio/vidéo échouent sur le parent initial puis passent avec le correctif ; 263 tests chat/intention réussis sur main réconcilié. Le test Chromium utilise le véritable entrypoint et sa CSP, avec médias publics simulés explicitement identifiés et audio DSP réel ; décodage et lecture après panne de synthèse vérifiés. Ce test local ne prouve pas la disponibilité des modèles ou du navigateur propriétaire en production.

Le self-test existant sait désormais lire les deux enveloppes de fin NDJSON et vérifier une photo par ses métadonnées typées, sans se satisfaire d’un texte annonçant une image. Aucun secret ni budget modifié. XP MEL : NON (conservation des artefacts déjà couverte par le corpus). Statut global IN_PROGRESS jusqu’aux vérifications production.

## Pertinence du sujet — résultat réel après publication

Release 40239596397 réussie sur bbc2d99d, avec gates post-release applicables verts. Self-test photo 40240610609 : média réel récupéré et archivé en 9379 ms malgré le quota épuisé, mais mauvaise pertinence : « photo de chat » retourne un oiseau nommé rock chat. Le OK technique de ce test ne constitue donc pas une acceptation sémantique.

Correction supplémentaire dans la recherche canonique : résoudre les titres exacts de Wikipédia francophone vers leur identité Wikidata, puis contraindre Commons par le sujet P180. Pas de premier résultat de recherche floue : wbsearchentities(chat) retourne aussi un gène CHAT. Les articles absents/ambigus et les erreurs ne fabriquent pas d’identité ; les recherches audio/vidéo et les sources officielles strictes sont préservées. La recherche publique générique conserve sa langue existante ; la recherche photo du chat francophone accepte un paramètre language explicite.

Vérification HTTPS réelle : Wikipédia Chat → Q146, label anglais cat ; Commons cat haswbstatement:P180=Q146 retourne File:Felis catus-cat on snow.jpg (JPEG). Le self-test photo exige désormais cette identité en plus du média typé ; une image d’un autre sujet échoue même si elle se charge. Ces preuves réseau locales ne valent pas déploiement de ce second lot.

XP MEL : NON. Pertinence et limites de preuve déjà couvertes par le corpus. Chat global IN_PROGRESS ; inférence réelle bloquée par le compteur estimé quotidien, sans modification de plafond.
