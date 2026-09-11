import classic from './avatar-data-classic.js';
import crusade from './avatar-data-crusade.js';
import religious from './avatar-data-religious.js';

// Granada currently uses the same mantilla portrait as the Andalusian religious
// theme, but it has its own stable route so the visual mode can evolve later
// without changing the interface contract.
const AVATAR_BASE64 = Object.freeze({ classic, crusade, religious, granada: religious });
const ROUTES = Object.freeze({
  '/assets/avatars/mel-classic.webp': 'classic',
  '/assets/avatars/mel-crusade.webp': 'crusade',
  '/assets/avatars/mel-religious-andalusian.webp': 'religious',
  '/assets/avatars/mel-granada.webp': 'granada',
});

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function getMelAvatarRoute(theme = 'classic') {
  if (theme === 'crusade') return '/assets/avatars/mel-crusade.webp';
  if (theme === 'religious') return '/assets/avatars/mel-religious-andalusian.webp';
  if (theme === 'granada') return '/assets/avatars/mel-granada.webp';
  return '/assets/avatars/mel-classic.webp';
}

export function serveMelAvatar(pathname) {
  const key = ROUTES[String(pathname || '')];
  if (!key) return null;
  return new Response(decodeBase64(AVATAR_BASE64[key]), {
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'public,max-age=31536000,immutable',
      'x-mel-avatar': key,
    },
  });
}
