import classic from './avatar-data-classic.js';
import crusade from './avatar-data-crusade.js';
import religious from './avatar-data-religious.js';

const AVATAR_BASE64 = Object.freeze({ classic, crusade, religious });
const ROUTES = Object.freeze({
  '/assets/avatars/mel-classic.webp': 'classic',
  '/assets/avatars/mel-crusade.webp': 'crusade',
  '/assets/avatars/mel-religious-andalusian.webp': 'religious',
});

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function getMelAvatarRoute(theme = 'classic') {
  return theme === 'crusade'
    ? '/assets/avatars/mel-crusade.webp'
    : theme === 'religious'
      ? '/assets/avatars/mel-religious-andalusian.webp'
      : '/assets/avatars/mel-classic.webp';
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
