import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HD_BACKGROUNDS,
  HD_BACKGROUND_MEDIA,
} from '../src/assets/generated/hd-backgrounds.js';
import { enhanceThemeAvatars } from '../src/pages/theme-avatar-enhancer.js';

const THEMES = ['classic', 'crusade', 'religious', 'granada', 'aviation', 'paladin', 'amazon'];

const EXPECTED = Object.freeze({
  classic: { id: 555, filename: 'mel-bg-classic-hd-scaled.jpg', width: 1707, height: 2560 },
  crusade: { id: 556, filename: 'mel-bg-crusade-hd.jpg', width: 2560, height: 1920 },
  religious: { id: 557, filename: 'mel-bg-religious-hd-scaled.jpg', width: 2560, height: 1700 },
  granada: { id: 558, filename: 'mel-bg-granada-hd-scaled.jpg', width: 2560, height: 1087 },
  aviation: { id: 560, filename: 'mel-bg-aviation-hd-1-scaled.jpg', width: 2560, height: 1714 },
  paladin: { id: 561, filename: 'mel-bg-paladin-hd-scaled.jpg', width: 2560, height: 1920 },
  amazon: { id: 562, filename: 'mel-bg-amazon-hd.jpg', width: 1400, height: 2100 },
});

test('canonical HD background metadata matches the verified WordPress media entries', () => {
  for (const theme of THEMES) {
    assert.deepEqual(HD_BACKGROUND_MEDIA[theme], EXPECTED[theme]);
    assert.equal(
      HD_BACKGROUNDS[theme],
      `https://verite-interdite.fr/wp-content/uploads/2026/09/${EXPECTED[theme].filename}`,
    );
    assert.ok(Math.min(EXPECTED[theme].width, EXPECTED[theme].height) >= 1080);
  }
});

test('theme enhancer injects the canonical HD background URLs', async () => {
  const input = '<!doctype html><html data-theme="classic"><body><button data-theme-choice="classic">Classic</button><div id="avatar" class="avatar"><img src=""></div></body></html>';
  const response = new Response(input, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const enhanced = await enhanceThemeAvatars(response);
  const html = await enhanced.text();

  for (const theme of THEMES) {
    assert.ok(html.includes(`url('${HD_BACKGROUNDS[theme]}')`), `${theme} must use its canonical HD background`);
  }

  for (const stale of [
    'mel-classic-hd.png',
    'mel-croise-hd-1.jpg',
    'mel-religieux-hd-1.jpg',
    'mel-grenade-hd.jpg',
    'mel-aviation-hd.jpg',
    'mel-paladin-hd.jpg',
    'mel-amazon-hd.jpg',
  ]) {
    assert.equal(html.includes(stale), false, `stale background reference must stay removed: ${stale}`);
  }
});
