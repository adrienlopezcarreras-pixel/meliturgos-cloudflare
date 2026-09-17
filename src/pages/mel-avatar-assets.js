import avatarClassic from '../assets/mel-themes-20260917/generated/avatarClassic.js';
import avatarGranada from '../assets/mel-themes-20260917/generated/avatarGranada.js';
import avatarGuadix from '../assets/mel-themes-20260917/generated/avatarGuadix.js';
import avatarCrusade from '../assets/mel-themes-20260917/generated/avatarCrusade.js';
import avatarAviation from '../assets/mel-themes-20260917/generated/avatarAviation.js';
import avatarAmazon from '../assets/mel-themes-20260917/generated/avatarAmazon.js';
import avatarPaladin from '../assets/mel-themes-20260917/generated/avatarPaladin.js';
import avatarFuturistic from '../assets/mel-themes-20260917/generated/avatarFuturistic.js';

import bgLibrary from '../assets/mel-themes-20260917/generated/bgLibrary.js';
import bgGranada from '../assets/mel-themes-20260917/generated/bgGranada.js';
import bgGuadix from '../assets/mel-themes-20260917/generated/bgGuadix.js';
import bgCrusade from '../assets/mel-themes-20260917/generated/bgCrusade.js';
import bgAviation from '../assets/mel-themes-20260917/generated/bgAviation.js';
import bgAmazon from '../assets/mel-themes-20260917/generated/bgAmazon.js';
import bgPaladin from '../assets/mel-themes-20260917/generated/bgPaladin.js';
import bgFuturistic from '../assets/mel-themes-20260917/generated/bgFuturistic.js';

const ASSETS = Object.freeze({
  avatarClassic,
  avatarGranada,
  avatarGuadix,
  avatarCrusade,
  avatarAviation,
  avatarAmazon,
  avatarPaladin,
  avatarFuturistic,
  bgLibrary,
  bgGranada,
  bgGuadix,
  bgCrusade,
  bgAviation,
  bgAmazon,
  bgPaladin,
  bgFuturistic,
});

const ROUTES = Object.freeze({
  '/assets/avatars/mel-classic.webp': 'avatarClassic',
  '/assets/avatars/mel-granada.webp': 'avatarGranada',
  '/assets/avatars/mel-religious-andalusian.webp': 'avatarGuadix',
  '/assets/avatars/mel-crusade.webp': 'avatarCrusade',
  '/assets/avatars/mel-aviation-1940s.webp': 'avatarAviation',
  '/assets/avatars/mel-amazon-griffon.webp': 'avatarAmazon',
  '/assets/avatars/mel-paladin-light-full-plate.webp': 'avatarPaladin',
  '/assets/avatars/mel-full.webp': 'avatarFuturistic',

  '/assets/backgrounds/mel-bg-library-hd.jpg': 'bgLibrary',
  '/assets/backgrounds/mel-bg-granada-cathedral-hd.jpg': 'bgGranada',
  '/assets/backgrounds/mel-bg-guadix-virgen-gracia-hd.jpg': 'bgGuadix',
  '/assets/backgrounds/mel-bg-crusade-jerusalem-hd.jpg': 'bgCrusade',
  '/assets/backgrounds/mel-bg-aviation-1940-hd.jpg': 'bgAviation',
  '/assets/backgrounds/mel-bg-amazon-act1-hd.jpg': 'bgAmazon',
  '/assets/backgrounds/mel-bg-paladin-act4-hd.jpg': 'bgPaladin',
  '/assets/backgrounds/mel-bg-futuristic-hd.jpg': 'bgFuturistic',
});

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

function decodeBase64(value) {
  let normalized = String(value || '')
    .replace(/[^A-Za-z0-9+/_=-]/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/=/g, '');

  const remainder = normalized.length % 4;
  if (remainder) normalized += '='.repeat(4 - remainder);

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function decodeAsset(value) {
  const source = String(value || '');

  if (!/^data:/i.test(source)) {
    throw new Error('MEL visual asset must be a data URI');
  }

  const comma = source.indexOf(',');
  if (comma < 0) throw new Error('Invalid embedded MEL asset');

  const meta = source.slice(5, comma);
  const contentType = meta.split(';')[0] || 'application/octet-stream';

  return {
    bytes: decodeBase64(source.slice(comma + 1)),
    contentType,
  };
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
    },
  });
}
