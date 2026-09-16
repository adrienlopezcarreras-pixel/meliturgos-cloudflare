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
 * Single source of truth for MEL backgrounds.
 * To replace one theme, update only the corresponding URL after uploading the
 * new owner-provided image. The UI layout and theme logic do not need editing.
 */
export const MEL_THEME_BACKGROUNDS = Object.freeze({
  classic: MEL_THEME_BACKGROUND_LEGACY.classic,
  crusade: MEL_THEME_BACKGROUND_LEGACY.crusade,
  religious: MEL_THEME_BACKGROUND_LEGACY.religious,
  granada: MEL_THEME_BACKGROUND_LEGACY.granada,
  aviation: MEL_THEME_BACKGROUND_LEGACY.aviation,
  paladin: MEL_THEME_BACKGROUND_LEGACY.paladin,
  amazon: MEL_THEME_BACKGROUND_LEGACY.amazon,
});

export function rewriteMelThemeBackgrounds(html, backgrounds = MEL_THEME_BACKGROUNDS) {
  let output = String(html ?? '');
  for (const [theme, legacyUrl] of Object.entries(MEL_THEME_BACKGROUND_LEGACY)) {
    const replacement = String(backgrounds?.[theme] || legacyUrl).trim() || legacyUrl;
    if (replacement !== legacyUrl && output.includes(legacyUrl)) {
      output = output.split(legacyUrl).join(replacement);
    }
  }
  return output;
}

export async function applyMelThemeBackgrounds(response, backgrounds = MEL_THEME_BACKGROUNDS) {
  if (!(response instanceof Response)) return response;
  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html/i.test(contentType)) return response;

  const hasOverride = Object.entries(MEL_THEME_BACKGROUND_LEGACY)
    .some(([theme, legacyUrl]) => String(backgrounds?.[theme] || legacyUrl).trim() !== legacyUrl);
  if (!hasOverride) return response;

  const source = await response.text();
  const rewritten = rewriteMelThemeBackgrounds(source, backgrounds);
  if (rewritten === source) {
    return new Response(source, response);
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
