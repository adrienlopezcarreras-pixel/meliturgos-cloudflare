import { describeWorkshopSkills, workshopSkillSummary } from '../workshop/workshop-skills.js';

export const WORKSHOP_MODE_SWITCH_CSS = `
.brand .mel-mode-switch{width:100%;position:relative;z-index:40}
.brand .mel-mode-switch summary{display:flex;gap:11px;align-items:center;cursor:pointer;list-style:none;border-radius:12px;padding:0 5px 3px}
.brand .mel-mode-switch summary::-webkit-details-marker{display:none}
.brand .mel-mode-switch summary:focus-visible{outline:2px solid #60a5fa;outline-offset:3px}
.brand .mel-mode-chevron{margin-left:auto;color:#9ab3d1}
.brand .mel-mode-menu{position:absolute;left:0;right:0;top:calc(100% + 9px);display:grid;gap:5px;border:1px solid #405674;border-radius:13px;background:#101f33;box-shadow:0 15px 30px rgba(0,0,0,.5);padding:8px}
.brand .mel-mode-menu a{display:block;padding:12px;border-radius:9px;color:#e6f4ff;text-decoration:none}
.brand .mel-mode-menu a:hover,.brand .mel-mode-menu a:focus-visible{background:#28415f;outline:2px solid #91d7ff}
@media(min-width:1201px){#mobileMoreMenu .mobile-mode-link{display:none}}
`;

const sections = [
  { title: 'ÉDITEUR', surfaces: ['ÉDITEUR'], description: 'Magazines, romans et contenus narratifs.' },
  { title: 'MÉDIA', surfaces: ['MÉDIA · vidéo', 'MÉDIA · audio'], description: 'Vidéo, audio, scènes et rendus.' },
  { title: 'PROMOTION', surfaces: ['PROMOTION'], description: 'Réseaux, site et communication.' },
  { title: 'MEL Companion', surfaces: ['MEL Companion'], description: 'Connexion Windows et opérations autorisées.' },
];

export function renderWorkshopLanding() {
  // This deployment has no authenticated VIA snapshot. Reuse the catalog's
  // fail-closed projection to keep the displayed status and counts consistent.
  const catalog = workshopSkillSummary(describeWorkshopSkills());
  const cards = sections.map(({ title, surfaces, description }) => {
    const related = catalog.sections.filter(section => surfaces.includes(section.section));
    const total = related.reduce((count, section) => count + section.total, 0);
    return `
    <section class="card">
      <h2>${title}</h2>
      <p class="status">Moteur non connecté à cette interface Web</p>
      <p>${description}</p>
      <p>${total} fonctions prévues</p>
    </section>`;
  }).join('');
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>MEL · Mode Workshop</title>
<style>
:root{color-scheme:dark;font:16px system-ui,sans-serif;background:#07111f;color:#f8fafc}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;background:radial-gradient(circle at 20% 0%,#14334b,transparent 40%),#07111f}
main{max-width:1080px;margin:auto;padding:clamp(20px,4vw,52px)}
header{display:flex;align-items:center;gap:14px;margin-bottom:30px}
header img{width:52px;height:52px;border-radius:50%}
header small{display:block;color:#9bb4c9}
h1{font-size:clamp(27px,4vw,42px);margin:0 0 8px}
p{line-height:1.55;color:#bdcad8}
nav{display:flex;gap:12px;flex-wrap:wrap;margin:25px 0}
a{color:#c5e6ff;border:1px solid #496883;padding:11px 16px;border-radius:12px;text-decoration:none}
a:hover,a:focus-visible{background:#203c55;outline:2px solid #91d7ff}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.card{border:1px solid #364a62;background:#111f32;padding:18px;border-radius:16px}
.card h2{margin:0 0 8px;font-size:19px}
.card p{margin:0;font-size:14px}
.card .status{font-size:13px;color:#facc7e}
.notice{background:#18283c;border-left:3px solid #60a5fa;padding:16px;border-radius:8px;margin:22px 0}
</style>
</head>
<body>
<main>
<header>
  <img src="/assets/avatars/mel-full.webp" alt="">
  <div><strong>MEL</strong><small>Vérité Interdite — Atelier</small></div>
</header>
<h1>Mode Workshop</h1>
<nav aria-label="Changer de mode MEL">
  <a href="/">Mode normal</a>
  <a href="/professor">Mode complet</a>
</nav>
<div class="notice" role="status">
  <strong>Intégration en cours.</strong>
  <p>Les commandes seront disponibles ici après le raccordement des moteurs et la validation des permissions.</p>
</div>
<div class="grid">${cards}</div>
</main>
</body>
</html>`;
  return new Response(html, { headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  } });
}
