export const MEL_VISUAL_IDENTITY_SCHEMA = 'mel.visual-identity.v1';

export const MEL_VISUAL_IDENTITY = Object.freeze({
  id: 'mel-canonical',
  name: 'MEL',
  presentation: 'feminine-adult',
  continuity: Object.freeze({
    face: 'canonical-mel',
    voice: 'calm-french',
    personality: 'same-mel-across-themes',
  }),
  defaults: Object.freeze({
    theme: 'futuristic',
    avatar: '/assets/avatars/mel-full.webp',
  }),
});

export const MEL_THEME_PRESENTATIONS = Object.freeze({
  classic: Object.freeze({ outfit: 'library', context: 'classic' }),
  granada: Object.freeze({ outfit: 'granada', context: 'cathedral' }),
  guadix: Object.freeze({ outfit: 'religious-andalusian', context: 'guadix' }),
  crusade: Object.freeze({ outfit: 'crusade', context: 'jerusalem' }),
  aviation: Object.freeze({ outfit: 'aviation-1940s', context: 'aviation' }),
  amazon: Object.freeze({ outfit: 'amazon', context: 'act-i' }),
  paladin: Object.freeze({ outfit: 'paladin', context: 'act-iv' }),
  futuristic: Object.freeze({ outfit: 'modern-neutral', context: 'futuristic' }),
});

export function getMelVisualIdentity(theme = MEL_VISUAL_IDENTITY.defaults.theme) {
  const key = String(theme || '').trim();
  const presentation = MEL_THEME_PRESENTATIONS[key] || MEL_THEME_PRESENTATIONS[MEL_VISUAL_IDENTITY.defaults.theme];
  return Object.freeze({
    schema: MEL_VISUAL_IDENTITY_SCHEMA,
    identity_id: MEL_VISUAL_IDENTITY.id,
    name: MEL_VISUAL_IDENTITY.name,
    presentation,
    theme: MEL_THEME_PRESENTATIONS[key] ? key : MEL_VISUAL_IDENTITY.defaults.theme,
  });
}
