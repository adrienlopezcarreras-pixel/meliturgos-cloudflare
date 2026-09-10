import classic from './avatar-data-classic.js';
import crusade from './avatar-data-crusade.js';
import religious from './avatar-data-religious.js';
import aviation from './avatar-data-aviation.js';
import paladin from './avatar-data-paladin.js';
import amazon from './avatar-data-amazon.js';

// Stable theme routes are interface contracts. Granada currently reuses the
// approved Andalusian religious portrait; Aviation, Paladin and Amazon now use
// their dedicated owner-approved embedded portraits.
const AVATAR_BASE64 = Object.freeze({
  classic,
  crusade,
  religious,
  granada: religious,
  aviation,
  paladin,
  amazon,
});

const ROUTES = Object.freeze({
  '/assets/avatars/mel-classic.webp': 'classic',
  '/assets/avatars/mel-crusade.webp': 'crusade',
  '/assets/avatars/mel-religious-andalusian.webp': 'religious',
  '/assets/avatars/mel-granada.webp': 'granada',
  '/assets/avatars/mel-aviation-1940s.webp': 'aviation',
  '/assets/avatars/mel-paladin-light-full-plate.webp': 'paladin',
  '/assets/avatars/mel-amazon-griffon.webp': 'amazon',
});

const THEME_ROUTES = Object.freeze({
  classic: '/assets/avatars/mel-classic.webp',
  crusade: '/assets/avatars/mel-crusade.webp',
  religious: '/assets/avatars/mel-religious-andalusian.webp',
  granada: '/assets/avatars/mel-granada.webp',
  aviation: '/assets/avatars/mel-aviation-1940s.webp',
  paladin: '/assets/avatars/mel-paladin-light-full-plate.webp',
  amazon: '/assets/avatars/mel-amazon-griffon.webp',
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
      'x-mel-avatar-fallback': key === 'granada' ? 'religious' : 'none',
    },
  });
}
