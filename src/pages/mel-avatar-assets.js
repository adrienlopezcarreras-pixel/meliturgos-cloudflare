const THEME_ROUTES = Object.freeze({
  classic: '/assets/avatars/mel-classic.webp',
  granada: '/assets/avatars/mel-granada.webp',
  guadix: '/assets/avatars/mel-religious-andalusian.webp',
  crusade: '/assets/avatars/mel-crusade.webp',
  aviation: '/assets/avatars/mel-aviation-1940s.webp',
  amazon: '/assets/avatars/mel-amazon-griffon.webp',
  paladin: '/assets/avatars/mel-paladin-light-full-plate.webp',
  futuristic: '/assets/avatars/mel-full.webp',
});

export function getMelAvatarRoute(theme = 'classic') {
  return THEME_ROUTES[String(theme || '')] || THEME_ROUTES.classic;
}

// Visuals are deployed as Cloudflare Static Assets from ./dist.
// Keep this compatibility helper deliberately inert so importing route metadata
// can never pull multi-megabyte base64 payloads back into the Worker bundle.
export function serveMelAvatar() {
  return null;
}
