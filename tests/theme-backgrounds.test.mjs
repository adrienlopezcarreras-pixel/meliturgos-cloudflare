import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HD_BACKGROUNDS,
  HD_BACKGROUND_MEDIA,
} from '../src/assets/generated/hd-backgrounds.js';
import { onRequestGet as renderNormalMode } from '../src/pages/mvp-interface.js';
import { finalizeVisualResponse } from '../src/visual-final-entry.js';

const LEGACY_THEMES = ['classic', 'crusade', 'religious', 'granada', 'aviation', 'paladin', 'amazon'];

const EXPECTED = Object.freeze({
  classic: { id: 555, filename: 'mel-bg-classic-hd-scaled.jpg', width: 1707, height: 2560 },
  crusade: { id: 556, filename: 'mel-bg-crusade-hd.jpg', width: 2560, height: 1920 },
  religious: { id: 557, filename: 'mel-bg-religious-hd-scaled.jpg', width: 2560, height: 1700 },
  granada: { id: 558, filename: 'mel-bg-granada-hd-scaled.jpg', width: 2560, height: 1087 },
  aviation: { id: 560, filename: 'mel-bg-aviation-hd-1-scaled.jpg', width: 2560, height: 1714 },
  paladin: { id: 561, filename: 'mel-bg-paladin-hd-scaled.jpg', width: 2560, height: 1920 },
  amazon: { id: 562, filename: 'mel-bg-amazon-hd.jpg', width: 1400, height: 2100 },
});

const FINAL_BACKGROUNDS = Object.freeze([
  '13-11-02-olb-by-RalfR-03-scaled.jpg',
  'mel-bg-granada-capilla-mayor-real-hd-scaled.jpg',
  'mel-bg-guadix-nuestra-senora-gracia-real-hd-scaled.jpg',
  'mel-bg-crusade-jerusalem-citadel-real-hd-scaled.jpg',
  'mel-bg-aviation-bf109-vaernes-1940-real.jpg',
  'mel-bg-amazon-hd.jpg',
  'mel-bg-paladin-hd-scaled.jpg',
  'mel-bg-futuristic-project-816-control-room-hd-scaled.jpg',
]);

test('legacy HD background metadata remains available for compatibility', () => {
  for (const theme of LEGACY_THEMES) {
    assert.deepEqual(HD_BACKGROUND_MEDIA[theme], EXPECTED[theme]);
    assert.equal(
      HD_BACKGROUNDS[theme],
      `https://verite-interdite.fr/wp-content/uploads/2026/09/${EXPECTED[theme].filename}`,
    );
    assert.ok(Math.min(EXPECTED[theme].width, EXPECTED[theme].height) >= 1080);
  }
});

test('final normal response uses the approved eight backgrounds without a second visual runtime', async () => {
  const canonical = await renderNormalMode();
  const response = await finalizeVisualResponse(canonical, '/');
  const html = await response.text();

  for (const filename of FINAL_BACKGROUNDS) {
    assert.ok(html.includes(filename), `final normal response must contain ${filename}`);
  }

  assert.match(html, /data-visual-owner="mel-normal-v3"/);
  assert.match(html, /id="mel-normal-v3-runtime"/);
  assert.doesNotMatch(html, /id="mel-normal-canonical-runtime"/);
  assert.doesNotMatch(html, /id="mel-normal-canonical-visuals"/);
  assert.doesNotMatch(html, /mel-theme-avatar-runtime/);
  assert.doesNotMatch(html, /mel-theme-decor-style/);
  assert.match(html, /avatar:'\/assets\/avatars\/mel-full\.webp'/);
});
