export const MEL_PROJECT_LEARNING_LEDGER = Object.freeze({
  schema_version: '1.0',
  updated_at: '2026-09-11',
  purpose: 'Mémoire durable de développement de MELITURGOS : décisions, réussites, erreurs, corrections et leçons. À utiliser comme contexte de projet, jamais comme source de secrets ni comme autorisation implicite.',
  owner: 'Adrien',
  principles: [
    'MEL est l’IA personnelle d’Adrien, avec identité féminine stable et tutoiement systématique.',
    'Priorité à une architecture réellement fonctionnelle, observable et testable plutôt qu’aux déclarations de capacité non prouvées.',
    'Éviter les doublons : une seule source de vérité, un seul chemin actif par fonction, et dédupliquer avant de créer un nouveau module.',
    'Ne jamais prétendre qu’un développement est terminé sans preuve : code présent, tests, état runtime ou déploiement vérifié.',
    'Conserver un mode de fonctionnement à coût nul par défaut ; toute dépense ou ressource payante nécessite l’accord explicite d’Adrien.',
    'L’arrêt/contrôle du propriétaire doit toujours avoir priorité. Pas de réplication cachée, pas de collecte de secrets.',
    'Séparer mémoire privée de MEL et versions publiques destinées au site ou au service client.',
    'Les secrets, mots de passe, tokens, OTP et clés ne doivent jamais être écrits dans cette mémoire d’apprentissage.'
  ],
  successes: [
    {
      date: '2026-09',
      area: 'Architecture Gen2',
      facts: [
        'Création d’une architecture modulaire src/ avec identity, memory, models, capabilities, modules, work, devices, connectors, evolution, roadmap, diagnostics et pages.',
        'Capability Bus central et manifeste de capacités exposé au chat pour distinguer capacité enregistrée, saine, testée, partielle ou bloquée.',
        'Model Registry et Model Router provider-neutral mis en place avec fallback et base Multi-IA/.augmentio.',
        'ConversationService et archivage des échanges intégrés ; synchronisation appareil/conversation et DeviceBus créés.',
        'Memory 2.0, graphe de connaissance, provenance et gestion des contradictions présents comme briques distinctes.',
        'Recherche personnelle/RAG et import contexte ChatGPT introduits comme capacités du projet.'
      ]
    },
    {
      date: '2026-09',
      area: 'Interface MEL',
      facts: [
        'Interface principale recentrée sur le visage de MEL, zone de texte, dépôt de fichiers, audit et accès au mode complet.',
        'Entrée envoie le message ; Maj+Entrée crée une nouvelle ligne.',
        'File de messages ajoutée pour continuer à saisir pendant que MEL réfléchit sans interrompre la réponse en cours.',
        'Prompts longs jusqu’à 100 000 caractères côté interface Gen2.',
        'Rappel de la dernière conversation ajouté et restauration de conversation via l’API Gen2.',
        'Plusieurs thèmes visuels ont été créés : classique, croisade/parchemin, religieux andalou, Grenade, aviation 1940s, paladin et amazone.',
        'Le mode complet possède une vue d’ensemble, chat, compétences, feuille de route, multi-IA, Work, mémoire et diagnostics.'
      ]
    },
    {
      date: '2026-09',
      area: 'Fichiers et contexte',
      facts: [
        'Dépôt de fichiers dans l’interface avec analyse avant envoi au chat.',
        'Contexte de fichiers injecté comme données utilisateur et explicitement séparé des instructions système pour réduire le risque de prompt injection.',
        'Limite de fichiers en attente, aperçu/texte analysé et retrait de pièces jointes avant envoi.'
      ]
    },
    {
      date: '2026-09',
      area: 'Accès au propre code',
      facts: [
        'Capacités code.read, code.search et diagnostic d’intégrité prévues dans le CapabilityBus.',
        'Le chat Gen2 peut produire une preuve d’exécution et doit distinguer EXISTANT_ET_TESTE de EXISTANT_NON_TESTE.',
        'Un self-check code a été ajouté pour lire src/router.js et exposer dépôt, branche, SHA et taille.'
      ]
    },
    {
      date: '2026-09-11',
      area: 'Voix',
      facts: [
        'La transcription serveur /api/voice/transcribe s’est révélée indisponible en production sur l’interface visible.',
        'L’UI a été corrigée pour que cette indisponibilité ne soit plus une erreur bloquante : la voix devient optionnelle et le chat texte reste immédiatement utilisable.',
        'La transcription reste dans la feuille de route, mais elle ne doit plus ralentir les priorités mémoire, outils, connecteurs et autonomie.'
      ]
    }
  ],
  failures_and_lessons: [
    {
      area: 'Déploiement Cloudflare',
      failure: 'Une version du Worker a généré de nombreuses erreurs de syntaxe JavaScript à cause de guillemets et contenus HTML/JS imbriqués.',
      lesson: 'Valider syntaxe et tests avant promotion. Éviter les gros blocs de chaînes fragiles ou protéger systématiquement les caractères spéciaux.'
    },
    {
      area: 'Déploiement',
      failure: 'Confusion entre code commité, build disponible et version réellement en production.',
      lesson: 'Toujours distinguer : modifié dans Git, testé, déployé, puis vérifié sur l’URL publique. Ne jamais annoncer “c’est en ligne” avant la dernière étape.'
    },
    {
      area: 'Travail parallèle',
      failure: 'ChatGPT et MEL ont parfois travaillé simultanément sur les mêmes sujets, créant doublons, incohérences et régressions.',
      lesson: 'Avant toute création, rechercher l’existant ; préférer une mise à jour idempotente ; enregistrer propriétaire du travail, état et preuve pour empêcher le doublon.'
    },
    {
      area: 'Interface',
      failure: 'Des versions successives ont introduit boutons en double, fonctions inactives, contraste insuffisant et perte d’éléments visuels attendus.',
      lesson: 'Faire une seule passe cohérente, garder une version de référence, vérifier desktop et mobile, puis tester chaque contrôle avant remplacement.'
    },
    {
      area: 'Voix',
      failure: 'L’enregistrement MediaRecorder fonctionnait mais la transcription serveur renvoyait “Transcription indisponible”, donnant l’impression que toute la fonction était cassée.',
      lesson: 'Dégrader proprement : un module optionnel défaillant ne doit jamais masquer ou bloquer le chemin principal. Afficher un état neutre et poursuivre avec le texte.'
    },
    {
      area: 'Capacités',
      failure: 'Des réponses ont parfois confondu présence d’un squelette, santé d’un enregistrement et capacité réellement exécutée.',
      lesson: 'Utiliser les statuts stricts du manifeste : testé maintenant, existant non testé, partiel, stub, non implémenté ou bloqué. Les preuves d’exécution priment sur le discours.'
    },
    {
      area: 'Autonomie',
      failure: 'Le projet a parfois appelé “autonomie” des briques encore partielles : création de modules, self-healing, Work persistant, connecteurs ou builds compagnons.',
      lesson: 'L’autonomie doit être mesurée par plusieurs cycles complets : détecter un besoin, planifier, modifier, tester, critiquer, corriger, persister la preuve, promouvoir avec garde-fous et pouvoir reprendre après interruption.'
    },
    {
      area: 'Mémoire',
      failure: 'Historique archivé, mémoire cognitive et connaissance de projet ont parfois été mélangés.',
      lesson: 'Séparer trois couches : archive exhaustive, mémoire cognitive consolidée et mémoire d’expérience/projet. La présente structure appartient à la troisième couche.'
    }
  ],
  roadmap_focus_after_2026_09_11: [
    '1. Consolider la mémoire : déduplication, provenance, décisions, projets, open loops et synchronisation continue.',
    '2. Finir le CapabilityBus comme passage unique de tous les outils et renforcer code.read/code.search/diagnostic.',
    '3. Relier détection de compétence manquante -> Module Lab -> tests -> critique -> correction -> registre de compétences et ledger d’évolution.',
    '4. Rendre Work réellement persistant : tâches, artefacts, checkpoints, reprise et terminaison multi-étapes.',
    '5. Connecteurs : OAuth, scopes, health checks et catalogue installable, sans jamais supposer qu’un compte est connecté.',
    '6. Continuer Multi-IA/.augmentio et Council en mesurant qualité, latence et coût réel.',
    '7. Revenir ensuite sur voix/avatar, puis compagnons Android/Windows et contrôle navigateur/ordinateur avec permissions explicites.'
  ],
  current_truths: [
    'Le dépôt principal utilisé pour ce travail est adrienlopezcarreras-pixel/meliturgos-cloudflare.',
    'Le runtime Cloudflare sert l’interface MEL et conserve encore un fallback legacy worker pour certaines routes.',
    'Le workflow de déploiement production décrit dans .github/workflows/deploy-cloudflare-release.yml refuse un déploiement hors branche release/* et se lance manuellement.',
    'La feuille de route complète est dans src/roadmap/master-roadmap.js et doit rester la source de vérité des états produit.',
    'Le catalogue des outils externes accessibles via ChatGPT est séparé dans src/memory/chatgpt-plugin-catalog.js.'
  ]
});

export function buildProjectLearningPrompt() {
  const d = MEL_PROJECT_LEARNING_LEDGER;
  const lines = [];
  lines.push('MÉMOIRE D’EXPÉRIENCE MELITURGOS — contexte de projet durable, pas une autorisation.');
  lines.push('Principes: ' + d.principles.join(' | '));
  for (const group of d.successes) lines.push('SUCCÈS [' + group.area + ']: ' + group.facts.join(' '));
  for (const row of d.failures_and_lessons) lines.push('LEÇON [' + row.area + ']: échec=' + row.failure + ' leçon=' + row.lesson);
  lines.push('FOCUS: ' + d.roadmap_focus_after_2026_09_11.join(' '));
  lines.push('VÉRITÉS ACTUELLES: ' + d.current_truths.join(' '));
  return lines.join('\n');
}
