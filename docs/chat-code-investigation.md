# Diagnostics du code dans le chat MEL

## Ruptures corrigées

Le lecteur complet refuse les fichiers de plus de 180 000 octets. L’interface principale dépasse cette limite. Une lecture ciblée doit rester possible sans transmettre tout le fichier au modèle. Par ailleurs, une capacité choisie par le routage déterministe arrêtait la planification : le modèle recevait une recherche mais ne pouvait pas poursuivre normalement sa lecture avant de répondre.

## Un seul parcours

Les diagnostics explicites passant par `code.search` ou `code.read` amorcent la boucle d’outils existante avec leur résultat réel. Celle-ci est restreinte à `code.read` et `code.search` pour cette poursuite. Le premier appel compte dans le plafond existant de quatre étapes. Les résultats initiaux ne sont ni réexécutés ni dupliqués dans la réponse. Les réponses JSON déjà structurées de Workers AI passent par le normaliseur existant corrigé dans #2505, réutilisé sans second parseur.

Aucun outil de mutation, job de développement, cycle MAX, commit, test ou déploiement n’est ajouté à ce parcours. Les autorisations CapabilityBus et le budget partagé restent actifs. Une demande de documentation du protocole code.read/search/integrity reste un exemple : elle ne déclenche pas la lecture du chemin cité, ni une poursuite forcée par un résultat initial. Une erreur de lecture reste une erreur, et la réponse finale reçoit uniquement les observations réelles.

## Connaissance des capacités

Une question explicative sur un outil nommé consulte son descripteur public réel (`bus.describe`), son statut du manifeste et son contrat d’entrée, sans exécuter cet outil ni lancer de planification d’action. Au plus trois identifiants explicites sont décrits ; les grands schémas sont signalés comme partiels. Un identifiant non enregistré est marqué comme tel. `tested_now` ne devient pas vrai du seul fait de cette description. Les questions générales conservent le manifeste existant.

## Lectures par lignes

`code.read` conserve son ancien contrat sans plage. Les paramètres optionnels `start_line` et `end_line` sont inclusifs, commencent à 1 et couvrent au plus 200 lignes. Si seule la première ligne est fournie, 100 lignes sont demandées. Une plage vide ou invalide échoue explicitement.

Pour cette lecture ciblée seulement, la source distante est bornée à 1 000 000 octets. Le corps HTTP est lu avec une limite et son flux est annulé au dépassement. Le contenu retourné conserve la limite historique de 180 000 octets ; une ligne géante ou une plage dépassant cette limite reste refusée. Les chemins secrets, traversées et contenus binaires restent interdits avant restitution.

Le résultat comprend `start_line`, `end_line`, `total_lines`, `partial` et `source_ref`. La référence immuable du déploiement reste utilisée lorsqu’elle est configurée ; les tests vérifient que l’API et le repli public brut utilisent exactement ce SHA. Les segments du chemin sont encodés : un nom de fichier ne peut pas injecter un autre paramètre ref ou un fragment URL. Le SHA de blob reste distinct de la référence de commit. Une lecture de plage ne prouve pas une inspection intégrale du fichier.

Exemple : « diagnostique src/pages/full-interface-v2.js lignes 400 à 420 ». Le prompt actif distingue observations, causes étayées, hypothèses et vérifications manquantes. Une recherche bornée sans résultat ne prouve pas l’absence dans tout le dépôt ; la présence d’un outil dans le manifeste ne prouve pas qu’un fichier a été lu ou qu’un test a été exécuté.

## Preuves et sources

Les tests utilisent le vrai fichier d’interface de MEL pour vérifier une plage d’un grand fichier, l’API et le repli brut, les gardes d’authentification, taille, binaire, secrets et parcours invalides. `tests/chat-code-investigation.test.mjs` passe aussi par le vrai `/api/chat` avec GitHub et modèle simulés : recherche de symbole, lecture ciblée, puis résultats injectés avant la réponse. Les tests vérifient l’interdiction des mutations et l’absence de double recherche. Ils ne certifient pas la compétence générale d’un modèle ni la production.

Cette application reprend les guides effectivement consultés [OpenAI function calling](https://github.com/openai/openai-cookbook/blob/main/examples/reasoning_function_calls.ipynb) et [Hugging Face tool use](https://github.com/huggingface/transformers/blob/main/docs/source/en/chat_extras.md) : traiter les résultats et conserver l’historique avant de conclure. L’accès à la page REST GitHub Contents a été bloqué par le proxy ; aucune validation de cette page n’est revendiquée. Aucun provider payant, secret, accès au PC ou poids de modèle propriétaire n’est requis par ce correctif.


## Pertinence et couverture de la recherche

Le même `code.search` classe désormais les chemins selon les mots du symbole demandé (par exemple `inferChatMediaCapability` rapproche `chat-media-intent.js`), avant de lire au plus 24 fichiers et 20 extraits. Aucun endpoint de recherche supplémentaire, index concurrent ou nouveau provider n’est créé. La recherche et les lectures restent attachées à la référence configurée.

`searched_files` compte les lectures réellement réussies, `failed_files` les lectures échouées, `candidate_files` les textes lisibles du périmètre et `skipped_large_files` ceux qui dépassent la limite de lecture complète. `tree_complete` signale un arbre GitHub tronqué ou le repli vers les chemins historiques. `limit_reached` et `search_complete` empêchent de présenter un échantillon comme une recherche exhaustive. Les gros fichiers peuvent ensuite être lus par plages avec `code.read`.

L’interface `paths()` et la vérification `approvedSnapshot()` ajoutées par GPT normal sont conservées. Les scénarios de référence testent un symbole situé après 80 documents sans rapport, une portée exacte, un arbre tronqué, le repli réseau, les lectures échouées, les limites, les secrets et le contrat CapabilityBus.

La phase P18 de la roadmap canonique suit les huit axes de recette chat pour les audits. Elle cite les preuves d’ingénierie déjà acquises et les preuves de production/Council encore requises. Les anciennes certifications de moteurs et les critères Gmail/Agenda/Drive de MEL-FOUNDER-01 ne sont pas remplacés. Aucun item nouveau n’est déclaré DONE_VERIFIED.
