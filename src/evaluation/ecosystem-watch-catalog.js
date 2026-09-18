export const ECOSYSTEM_WATCH_SCHEMA = 'mel.ecosystem-watch-catalog/v1';
export const ECOSYSTEM_WATCH_INTERVAL_MS = 6 * 60 * 60 * 1000;

const target = (id, label, category, query, capabilities = []) => Object.freeze({
  id,
  mode: 'observe',
  weight: 1,
  metadata: Object.freeze({
    label,
    category,
    query,
    capabilities: Object.freeze([...capabilities]),
    purpose: 'veille_multi_ia_plugins_arts',
  }),
});

export const ECOSYSTEM_WATCH_TARGETS = Object.freeze([
  target('watch_openai_chatgpt', 'ChatGPT / OpenAI', 'ai-platform',
    'OpenAI ChatGPT official latest tools connectors plugins agents computer use multimodal capabilities',
    ['tools','connectors','agents','browser','computer-use','files','image','audio','video','automation']),
  target('watch_anthropic_claude', 'Claude / Anthropic', 'ai-platform',
    'Anthropic Claude official latest tools connectors integrations agents computer use multimodal capabilities',
    ['tools','connectors','agents','computer-use','files','vision']),
  target('watch_google_gemini', 'Gemini / Google', 'ai-platform',
    'Google Gemini official latest tools extensions connectors agents multimodal audio video capabilities',
    ['tools','connectors','agents','vision','audio','video']),
  target('watch_xai_grok', 'Grok / xAI', 'ai-platform',
    'xAI Grok official latest tools integrations agents multimodal image audio capabilities',
    ['tools','integrations','agents','vision','audio']),
  target('watch_open_ecosystem', 'Écosystème modèles ouverts', 'open-ecosystem',
    'latest open source open weight AI models agents tools MCP plugins multimodal official repositories',
    ['open-models','MCP','plugins','agents','multimodal']),
  target('watch_plugins_connectors', 'Plugins, connecteurs et automatisations', 'tooling',
    'latest AI plugins connectors MCP servers automation task scheduling browser computer use capabilities',
    ['plugins','connectors','MCP','scheduling','browser','computer-use']),
  target('watch_visual_art', 'Arts visuels', 'creative',
    'latest AI visual understanding image analysis image generation design illustration art tools models',
    ['image.analyze','image.generate','design','illustration','art-history']),
  target('watch_audio_music', 'Audio et musique', 'creative',
    'latest AI audio understanding music analysis music generation composition sound design voice tools models',
    ['audio.analyze','audio.generate','music.analyze','music.generate','voice','sound-design']),
  target('watch_video_cinema', 'Vidéo et cinéma', 'creative',
    'latest AI video understanding video generation editing animation cinema audiovisual tools models',
    ['video.analyze','video.generate','video.edit','animation','cinema']),
  target('watch_culture_creation', 'Culture et création', 'creative',
    'latest AI literature storytelling comics games theatre architecture photography creative tools models',
    ['literature','storytelling','comics','games','theatre','architecture','photography']),
]);

export function getEcosystemWatchCatalog() {
  return {
    schema: ECOSYSTEM_WATCH_SCHEMA,
    interval_ms: ECOSYSTEM_WATCH_INTERVAL_MS,
    targets: ECOSYSTEM_WATCH_TARGETS.map(row => ({
      ...row,
      metadata: { ...row.metadata, capabilities: [...row.metadata.capabilities] },
    })),
  };
}
