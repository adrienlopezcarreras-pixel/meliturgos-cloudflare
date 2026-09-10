import classic from './avatar-data-classic.js';
import crusade from './avatar-data-crusade.js';
import religious from './avatar-data-religious.js';

// Theme-specific routes are stable interface contracts. Until dedicated portrait
// assets are produced, Granada reuses the Andalusian mantilla portrait,
// Aviation 1940s reuses classic MEL, and Paladin Light Full Plate reuses the
// medieval MEL portrait. The route contract lets those assets be replaced later
// without changing the UI or stored theme preference.
const AVATAR_BASE64 = Object.freeze({
  classic,
  crusade,
  religious,
  granada: religious,
  aviation: classic,
  paladin: crusade,
});

const ROUTES = Object.freeze({
  '/assets/avatars/mel-classic.webp': 'classic',
  '/assets/avatars/mel-crusade.webp': 'crusade',
  '/assets/avatars/mel-religious-andalusian.webp': 'religious',
  '/assets/avatars/mel-granada.webp': 'granada',
  '/assets/avatars/mel-aviation-1940s.webp': 'aviation',
  '/assets/avatars/mel-paladin-light-full-plate.webp': 'paladin',
});

const THEME_ROUTES = Object.freeze({
  classic: '/assets/avatars/mel-classic.webp',
  crusade: '/assets/avatars/mel-crusade.webp',
  religious: '/assets/avatars/mel-religious-andalusian.webp',
  granada: '/assets/avatars/mel-granada.webp',
  aviation: '/assets/avatars/mel-aviation-1940s.webp',
  paladin: '/assets/avatars/mel-paladin-light-full-plate.webp',
});

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function getMelAvatarRoute(theme = 'classic') {
  return THEME_ROUTES[String(theme || '')] || THEME_ROUTES.classic;
}

export function serveMelAvatar(pathname) {
  const key = ROUTES[String(pathname || '')];
  if (!key) return null;
  return new Response(decodeBase64(AVATAR_BASE64[key]), {
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'public,max-age=31536000,immutable',
      'x-mel-avatar': key,
      'x-mel-avatar-fallback': key === 'aviation' ? 'classic' : key === 'paladin' ? 'crusade' : key === 'granada' ? 'religious' : 'none',
    },
  });
}
