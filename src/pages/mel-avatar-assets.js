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
import bgCrusadeFinal from '../assets/theme-bg-croise-final.js';
import bgDiabloFinal from '../assets/theme-bg-diablo-final.js';

// Normal-mode portraits stay exactly as approved. The full-mode portrait and
// theme backgrounds are served from repository-owned assets so the canonical UI
// never depends on a second visual layer.
const ASSETS = Object.freeze({
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
  bgCrusadeFinal,
  bgDiabloFinal,
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
  '/assets/backgrounds/mel-bg-crusade-final.jpg': 'bgCrusadeFinal',
  '/assets/backgrounds/mel-bg-diablo-final.jpg': 'bgDiabloFinal',
});

const THEME_ROUTES = Object.freeze({
  classic: '/assets/avatars/mel-classic.webp',
  crusade: '/assets/avatars/mel-crusade.webp',
  religious: '/assets/avatars/mel-religious-andalusian.webp',
  granada: '/assets/avatars/mel-granada.webp',
  aviation: '/assets/avatars/mel-aviation-1940s.webp',
  paladin: '/assets/avatars/mel-paladin-light-full-plate.webp',
  amazon: '/assets/avatars/mel-amazon-griffon.webp',
  futuristic: '/assets/avatars/mel-full.webp',
});

function decodeBase64(value) {
  let normalized = String(value || '')
    .replace(/[^A-Za-z0-9+/_=-]/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/=/g, '');
  const remainder = normalized.length % 4;
  if (remainder === 1) throw new Error('Invalid embedded image payload');
  if (remainder) normalized += '='.repeat(4 - remainder);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeAsset(value) {
  const source = String(value || '');
  if (/^data:/i.test(source)) {
    const comma = source.indexOf(',');
    if (comma < 0) throw new Error('Invalid embedded image data URI');
    const meta = source.slice(5, comma);
    if (!/(?:^|;)base64(?:;|$)/i.test(meta)) throw new Error('Embedded image must use base64 encoding');
    const contentType = meta.split(';')[0] || 'application/octet-stream';
    return { bytes: decodeBase64(source.slice(comma + 1)), contentType };
  }
  return { bytes: decodeBase64(source), contentType: 'image/webp' };
}

export function getMelAvatarRoute(theme = 'classic') {
  return THEME_ROUTES[String(theme || '')] || THEME_ROUTES.classic;
}

export function serveMelAvatar(pathname) {
  const key = ROUTES[String(pathname || '')];
  if (!key) return null;
  const asset = decodeAsset(ASSETS[key]);
  return new Response(asset.bytes, {
    headers: {
      'content-type': asset.contentType,
      'cache-control': 'public,max-age=300,must-revalidate',
      'x-mel-asset': key,
      'x-mel-avatar': key,
      'x-mel-avatar-fallback': key === 'granada' ? 'religious' : 'none',
    },
  });
}
