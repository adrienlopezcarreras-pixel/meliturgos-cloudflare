export const CHATGPT_PLUGIN_CATALOG = Object.freeze({
  updated_at: '2026-09-11',
  rule: 'Ce catalogue décrit les outils/connecteurs actuellement disponibles côté ChatGPT/Teacher. Leur présence dans ce fichier ne donne pas automatiquement à MEL un accès direct, des identifiants ou des permissions. MEL doit vérifier un bridge/capability réel avant de dire qu’elle peut les utiliser.',
  plugin_connectors: [
    { name: 'Apollo.io', purpose: 'Prospection B2B, comptes, contacts, enrichissement et outbound.' },
    { name: 'Breakreach', purpose: 'Création, planification et publication sur plusieurs réseaux sociaux.' },
    { name: 'Fal', purpose: 'Génération/édition image, vidéo, audio, 3D et workflows créatifs.' },
    { name: 'GitHub', purpose: 'Dépôts, fichiers, code, issues, pull requests et opérations de développement autorisées.' },
    { name: 'Gmail', purpose: 'Recherche, lecture, brouillons, envoi, transfert, archivage et labels selon permissions.' },
    { name: 'Google Calendar', purpose: 'Recherche, disponibilité, création et modification d’événements.' },
    { name: 'Google Contacts', purpose: 'Recherche de contacts et lecture de coordonnées autorisées.' },
    { name: 'Google Drive', purpose: 'Recherche et travail avec Drive, Docs, Sheets et Slides.' },
    { name: 'HubSpot', purpose: 'CRM : contacts, entreprises, deals, tickets et engagements.' },
    { name: 'Interactive Brokers (IBKR)', purpose: 'Portefeuille, positions, soldes, P&L, ordres, cotations et historique selon autorisation.' },
    { name: 'MCP Server For WordPress', purpose: 'Actions exposées par le site WordPress via son API d’abilities.' },
    { name: 'Magnific', purpose: 'Workflows génératifs image, audio, vidéo, 3D, upscale et relighting.' },
    { name: 'Metricool for Social Media', purpose: 'Analytics sociaux, performance des posts et stratégie de contenu.' },
    { name: 'Microsoft Outlook Email', purpose: 'Recherche et consultation d’e-mails Outlook.' },
    { name: 'Microsoft SharePoint', purpose: 'Recherche, lecture et modification de contenu SharePoint/OneDrive selon permissions.' },
    { name: 'OpenArt', purpose: 'Création d’images et vidéos avec plusieurs modèles génératifs.' },
    { name: 'Plugin Management', purpose: 'Découverte, installation, connexion, permissions et gestion des plugins.' },
    { name: 'TinyFish', purpose: 'Recherche web et navigation interactive dans un navigateur distant.' },
    { name: 'Vercel', purpose: 'Construction et déploiement d’applications et agents.' },
    { name: 'Files', purpose: 'Recherche, lecture, matérialisation, partage et gestion de fichiers de conversation/Library selon permissions.' }
  ],
  builtin_teacher_tools: [
    { name: 'Web', purpose: 'Recherche web publique, sources récentes, entreprises, produits, disponibilité et navigation de pages.' },
    { name: 'Automations', purpose: 'Rappels, tâches planifiées et surveillances conditionnelles futures.' },
    { name: 'Image generation', purpose: 'Génération et édition d’images.' },
    { name: 'Python', purpose: 'Calcul, analyse et génération d’artefacts dans l’environnement de travail.' },
    { name: 'Artifact tools', purpose: 'Création de documents, PDF, feuilles de calcul et présentations quand disponibles.' },
    { name: 'Personal context', purpose: 'Récupération de contexte personnel antérieur lorsque nécessaire et autorisé.' }
  ],
  integration_rules: [
    'Un outil ChatGPT/Teacher n’est pas une capacité native de MEL tant qu’un connecteur, bridge ou CapabilityBus correspondant n’existe pas et n’a pas été vérifié.',
    'Ne jamais copier de token, mot de passe, cookie, OTP ou clé API dans le dépôt ou la mémoire.',
    'Pour intégrer un outil à MEL : définir contrat, permissions/scopes, test santé, gestion d’erreur, provenance, audit et possibilité de désactivation.',
    'Favoriser les connecteurs déjà disponibles et autorisés plutôt que de recréer un scraper ou un client fragile.',
    'Toute action externe avec effet réel doit respecter les permissions du propriétaire et les confirmations nécessaires.'
  ]
});

export function buildTeacherToolCatalogPrompt() {
  const c = CHATGPT_PLUGIN_CATALOG;
  return [
    'CATALOGUE OUTILS CHATGPT/TEACHER — information de disponibilité, pas permission automatique.',
    c.rule,
    'CONNECTEURS: ' + c.plugin_connectors.map(x => x.name + ' — ' + x.purpose).join(' | '),
    'OUTILS NATIFS: ' + c.builtin_teacher_tools.map(x => x.name + ' — ' + x.purpose).join(' | '),
    'RÈGLES D’INTÉGRATION: ' + c.integration_rules.join(' ')
  ].join('\n');
}
