import classic from './avatar-data-classic.js';
import crusade from './avatar-data-crusade.js';
import religious from './avatar-data-religious.js';
import aviation from './avatar-data-aviation.js';
import paladin from './avatar-data-paladin.js';
import amazon from './avatar-data-amazon.js';
import fullAvatar from '../assets/generated/full-avatar.js';
import bgCrusade from '../assets/generated/mel-bg-crusade.js';
import bgReligious from '../assets/generated/mel-bg-religious.js';
import bgGranada from '../assets/generated/mel-bg-granada.js';
import bgAviation from '../assets/generated/mel-bg-aviation.js';
import bgPaladin from '../assets/generated/mel-bg-paladin.js';
import bgAmazon from '../assets/generated/mel-bg-amazon.js';

// Normal-mode portraits stay exactly as approved. Only the full-mode portrait
// and generated theme backgrounds are served from the newly generated assets.
const ASSET_BASE64 = Object.freeze({
  classic,
  crusade,
  religious,
  granada: religious,
  aviation,
  paladin,
  amazon,
  fullAvatar,
  bgCrusade,
  bgReligious,
  bgGranada,
  bgAviation,
  bgPaladin,
  bgAmazon,
});

const ROUTES = Object.freeze({
  '/assets/avatars/mel-classic.webp': 'classic',
  '/assets/avatars/mel-crusade.webp': 'crusade',
  '/assets/avatars/mel-religious-andalusian.webp': 'religious',
  '/assets/avatars/mel-granada.webp': 'granada',
  '/assets/avatars/mel-aviation-1940s.webp': 'aviation',
  '/assets/avatars/mel-paladin-light-full-plate.webp': 'paladin',
  '/assets/avatars/mel-amazon-griffon.webp': 'amazon',
  '/assets/avatars/mel-full.webp': 'fullAvatar',
  '/assets/backgrounds/mel-bg-crusade.webp': 'bgCrusade',
  '/assets/backgrounds/mel-bg-religious.webp': 'bgReligious',
  '/assets/backgrounds/mel-bg-granada.webp': 'bgGranada',
  '/assets/backgrounds/mel-bg-aviation.webp': 'bgAviation',
  '/assets/backgrounds/mel-bg-paladin.webp': 'bgPaladin',
  '/assets/backgrounds/mel-bg-amazon.webp': 'bgAmazon',
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
  return new Response(decodeBase64(ASSET_BASE64[key]), {
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'public,max-age=300,must-revalidate',
      'x-mel-asset': key,
      'x-mel-avatar-fallback': key === 'granada' ? 'religious' : 'none',
    },
  });
}
