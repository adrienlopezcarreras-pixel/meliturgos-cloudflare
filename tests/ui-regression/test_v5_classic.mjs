import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const worker = fs.readFileSync('/home/adrien_lopez/meliturgos-cloudflare/worker.js', 'utf8');
const match = worker.match(/const ROOT_PAGE_V5_CLASSIC=`([\s\S]*?)`;\s*const /);
if (!match) { console.error('ROOT_PAGE_V5_CLASSIC not found'); process.exit(1); }
const html = match[1];

const sizes = [
  ['mobile-sm', 320, 568],
  ['mobile-md', 375, 667],
  ['mobile-lg', 430, 932],
  ['tablet', 768, 1024],
  ['laptop', 1024, 768],
  ['desktop', 1366, 768],
  ['wide', 1920, 1080],
];
let fail = 0;

for (const [name, w, h] of sizes) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });
  const win = dom.window;
  win.innerWidth = w;
  win.innerHeight = h;
  const doc = win.document;
  const avatar = doc.getElementById('mel-avatar');
  const composer = doc.getElementById('form');
  const body = doc.body;
  const main = doc.querySelector('main');

  function err(msg) { console.error(`FAIL ${name} ${w}x${h}: ${msg}`); fail++; }
  function ok(msg) { console.log(`PASS ${name} ${w}x${h}: ${msg}`); }

  if (!avatar) { err('mel-avatar missing'); continue; }
  if (!composer) { err('form/composer missing'); continue; }
  if (!doc.getElementById('q')) { err('textarea missing'); continue; }
  if (!doc.getElementById('drop-zone')) { err('drop-zone missing'); continue; }
  if (!doc.querySelector('a[href="/professor"]')) { err('mode complet link missing'); continue; }
  ok('structure present');

  const avatarW = avatar.getBoundingClientRect().width;
  const composerW = composer.getBoundingClientRect().width;
  if (avatarW > w) err(`avatar width ${avatarW} > viewport ${w}`); else ok('avatar fits viewport');
  if (composerW > w) err(`composer width ${composerW} > viewport ${w}`); else ok('composer fits viewport');
  if (body.scrollWidth > w + 1) err(`body scrollWidth ${body.scrollWidth} > viewport ${w}`); else ok('no horizontal overflow');
  if (main.scrollWidth > w + 1) err(`main scrollWidth ${main.scrollWidth} > viewport ${w}`); else ok('main fits');
}

process.exit(fail ? 1 : 0);
