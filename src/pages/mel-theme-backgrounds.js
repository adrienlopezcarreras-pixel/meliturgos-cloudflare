export const MEL_THEME_BACKGROUND_LEGACY = Object.freeze({
  classic: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-classic-hd-scaled.jpg',
  crusade: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-crusade-hd.jpg',
  religious: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-religious-hd-scaled.jpg',
  granada: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-granada-hd-scaled.jpg',
  aviation: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-aviation-hd-1-scaled.jpg',
  paladin: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-paladin-hd-scaled.jpg',
  amazon: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-amazon-hd.jpg',
});

/**
 * Legacy diagnostic mapping retained for compatibility only.
 * The canonical normal-mode page owns its own visual assets directly.
 */
export const MEL_THEME_BACKGROUNDS = Object.freeze({ ...MEL_THEME_BACKGROUND_LEGACY });

export function rewriteMelThemeBackgrounds(html) {
  return String(html ?? '');
}

/** Transparent compatibility shim: never post-process page HTML. */
export async function applyMelThemeBackgrounds(response) {
  return response;
}
