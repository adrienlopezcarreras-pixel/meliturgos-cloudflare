/** MEL full-control center v2. Contemporary, mobile-first, backed by real APIs. */
export async function onRequestGet() {
  const body = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Mode complet</title><link rel="icon" type="image/webp" sizes="any" href="/assets/avatars/mel-full.webp?v=mel-techno-20260924"><link rel="shortcut icon" type="image/webp" href="/assets/avatars/mel-full.webp?v=mel-techno-20260924"><link rel="apple-touch-icon" href="/assets/avatars/mel-full.webp?v=mel-techno-20260924"><style>
*{box-sizing:border-box}:root{color-scheme:dark;--bg:#07111f;--panel:rgba(12,22,38,.82);--panel2:rgba(20,32,52,.92);--line:rgba(255,255,255,.09);--text:#f8fafc;--muted:#94a3b8;--blue:#60a5fa;--cyan:#22d3ee;--good:#34d399;--info:#60a5fa;--neutral:#94a3b8;--warn:#fbbf24;--bad:#fb7185;--violet:#a78bfa}html{background:var(--bg)}body{margin:0;min-height:100vh;color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:radial-gradient(circle at 8% 5%,rgba(37,99,235,.23),transparent 30%),radial-gradient(circle at 95% 88%,rgba(13,148,136,.16),transparent 32%),var(--bg)}button,input,textarea,select{font:inherit}.shell{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:100vh}.sidebar{position:sticky;top:0;height:100vh;border-right:1px solid var(--line);background:rgba(3,9,18,.72);backdrop-filter:blur(20px);padding:18px 13px}.brand{display:flex;align-items:center;gap:11px;padding:4px 7px 17px}.brand img{width:50px;height:50px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,.18);box-shadow:0 8px 26px rgba(0,0,0,.3)}.brand strong{display:block}.brand small{display:block;color:var(--muted);margin-top:2px}.nav{display:grid;gap:5px}.nav button{border:0;background:transparent;color:#cbd5e1;text-align:left;border-radius:12px;padding:10px 11px;cursor:pointer;display:flex;gap:9px;align-items:center}.nav button:hover,.nav button.active{background:rgba(96,165,250,.12);color:white}.nav .ico{width:22px;text-align:center}.home{position:absolute;left:13px;right:13px;bottom:16px;text-decoration:none;color:#cbd5e1;border:1px solid var(--line);border-radius:12px;padding:10px;text-align:center;background:rgba(255,255,255,.025)}.main{padding:clamp(16px,3vw,34px);min-width:0}.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:20px}.top h1{margin:0;font-size:clamp(28px,4vw,42px);letter-spacing:-.035em}.top p{margin:6px 0 0;color:var(--muted)}.pill{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:rgba(255,255,255,.035);border-radius:999px;padding:7px 11px;font-size:.84rem;color:#dbeafe;white-space:nowrap}.dot{width:8px;height:8px;border-radius:50%;background:var(--muted)}.dot.good{background:var(--good)}.dot.warn{background:var(--warn)}.dot.bad{background:var(--bad)}.view{display:none}.view.active{display:block}.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}.card{grid-column:span 6;border:1px solid var(--line);background:linear-gradient(180deg,var(--panel2),var(--panel));border-radius:20px;padding:18px;box-shadow:0 18px 60px rgba(0,0,0,.18);min-width:0}.card.third{grid-column:span 4}.card.wide{grid-column:1/-1}.card h2,.card h3{margin:0}.muted{color:var(--muted)}.hero{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center}.hero img{width:110px;height:110px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,.22);box-shadow:0 0 48px rgba(59,130,246,.28)}.metric{font-size:2rem;font-weight:760;letter-spacing:-.04em;margin:12px 0 3px}.metric small{font-size:.8rem;font-weight:500;color:var(--muted)}.status-row{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.055)}.status-row:last-child{border-bottom:0}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}button,.button{border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#26384f;color:white;padding:10px 13px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;min-height:42px}button.primary{background:linear-gradient(135deg,#2563eb,#1d4ed8)}button.ghost{background:rgba(255,255,255,.035)}button:disabled{opacity:.55;cursor:wait}textarea,input,select{width:100%;border:1px solid rgba(255,255,255,.11);border-radius:12px;background:rgba(2,6,23,.6);color:white;padding:11px 12px;outline:none}textarea:focus,input:focus,select:focus{border-color:rgba(96,165,250,.62);box-shadow:0 0 0 3px rgba(59,130,246,.1)}textarea{resize:vertical;min-height:92px}.section-title{margin:0 0 14px}.section-title h2{font-size:1.32rem}.section-title p{margin:5px 0 0;color:var(--muted)}.cap-help{margin:0 0 12px;border:1px solid rgba(96,165,250,.22);background:linear-gradient(180deg,rgba(20,32,52,.78),rgba(8,17,31,.72));border-radius:16px;padding:13px 14px}.cap-help-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.cap-help-head strong{font-size:.96rem}.cap-help-intro{margin-top:4px;color:var(--muted);font-size:.8rem;line-height:1.4}.cap-help-summary{margin-top:6px;color:#dbeafe;font-size:.82rem}.cap-help-groups{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.cap-chip{display:inline-flex;align-items:center;min-height:26px;padding:4px 8px;border:1px solid rgba(148,163,184,.2);border-radius:999px;background:rgba(255,255,255,.035);font-size:.72rem;color:#cbd5e1}.cap-help details{margin-top:9px}.cap-help summary{cursor:pointer;color:#93c5fd;font-size:.8rem}.cap-help-list{display:grid;gap:6px;margin-top:8px;max-height:190px;overflow:auto}.cap-help-item{display:grid;grid-template-columns:minmax(130px,.8fr) minmax(0,1.8fr) auto;gap:9px;align-items:start;padding:7px 8px;border-radius:10px;background:rgba(255,255,255,.025);font-size:.75rem}.cap-help-item small{color:var(--muted);line-height:1.35}.cap-help-state{font-size:.78rem;color:#a7f3d0;white-space:nowrap}.cap-help-state.protected{color:#bfdbfe}.cap-help-state.neutral{color:#cbd5e1}.cap-help-state.warn{color:#fde68a}.cap-help-state.bad{color:#fecdd3}.chatlog{height:min(52vh,520px);min-height:320px;overflow:auto;padding:3px}.msg{max-width:88%;padding:11px 13px;border-radius:14px;margin:9px 0;white-space:pre-wrap;line-height:1.5;overflow-wrap:anywhere}.msg.user{margin-left:auto;background:rgba(37,99,235,.22)}.msg.mel{background:rgba(255,255,255,.055)}.composer{display:grid;grid-template-columns:1fr auto;gap:9px;margin-top:10px}.skill,.diag,.phase{padding:13px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.025)}.skill+.skill,.diag+.diag{margin-top:8px}.skill,.phase{content-visibility:auto;contain-intrinsic-size:auto 110px}.skill-head,.diag-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.tag{border-radius:999px;padding:4px 8px;font-size:.72rem;border:1px solid var(--line);color:#cbd5e1}.tag.good{color:#a7f3d0;border-color:rgba(52,211,153,.24)}.tag.protected,.tag.info{color:#bfdbfe;border-color:rgba(96,165,250,.34);background:rgba(59,130,246,.07)}.tag.neutral{color:#cbd5e1;border-color:rgba(148,163,184,.25);background:rgba(148,163,184,.05)}.tag.warn{color:#fde68a;border-color:rgba(251,191,36,.25)}.tag.bad{color:#fecdd3;border-color:rgba(251,113,133,.28)}pre.output{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;background:#030914;border:1px solid var(--line);border-radius:12px;padding:12px;color:#dbeafe;font:13px ui-monospace,SFMono-Regular,Menlo,monospace}.roadmap-head{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.roadstat{border:1px solid var(--line);border-radius:14px;padding:12px;background:rgba(255,255,255,.025)}.roadstat strong{display:block;font-size:1.4rem}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.filters select{width:auto;min-width:150px}.phase{margin-bottom:12px}.phase h3{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:1rem}.road-item{display:grid;grid-template-columns:105px 1fr 120px;gap:10px;align-items:start;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}.road-item:last-child{border-bottom:0}.road-id{color:#93c5fd;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}.road-title{font-weight:600}.road-next{font-size:.82rem;color:var(--muted);margin-top:4px}.road-status{text-align:right}.progress{height:9px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden;margin-top:8px}.progress>span{display:block;height:100%;background:linear-gradient(90deg,#2563eb,#22d3ee)}.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.diag-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.code-proof{font-size:.82rem;color:#cbd5e1;margin-top:7px;overflow-wrap:anywhere}.footer-note{margin-top:16px;font-size:.82rem;color:var(--muted)}.lora-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.lora-step{border:1px solid var(--line);border-radius:16px;padding:14px;background:rgba(255,255,255,.025)}.lora-step b{display:block;margin-bottom:6px}.lora-step small{display:block;color:var(--muted);line-height:1.4}.lora-link{margin-top:10px;width:100%}.lora-files{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.55;color:#cbd5e1;overflow-wrap:anywhere}.lora-cost{border:1px solid rgba(52,211,153,.2);background:rgba(16,185,129,.06);border-radius:14px;padding:12px;color:#a7f3d0}.lora-progress-label{display:flex;justify-content:space-between;gap:12px;margin-top:12px;font-size:.84rem;color:var(--muted)}
.mobile-home-controls{display:none}
.mobile-home-feedback{grid-column:1/-1;color:var(--muted);font-size:.78rem;line-height:1.4}
.mobile-activity-panel{grid-column:1/-1;border:1px solid var(--line);border-radius:12px;background:rgba(2,6,23,.5);padding:10px;font-size:.78rem;overflow-wrap:anywhere}
.mobile-activity-panel[hidden]{display:none}
@media(max-width:960px){.lora-steps{grid-template-columns:1fr 1fr}.shell{grid-template-columns:1fr}.sidebar{position:fixed;z-index:30;left:0;right:0;bottom:0;top:auto;height:auto;border-right:0;border-top:1px solid var(--line);padding:7px 7px calc(7px + env(safe-area-inset-bottom));background:rgba(3,9,18,.94)}.brand,.home{display:none}.nav{display:flex;overflow-x:auto;gap:4px}.nav button{min-width:82px;flex-direction:column;gap:2px;text-align:center;font-size:.78rem;padding:7px 7px}.main{padding:14px 10px calc(95px + env(safe-area-inset-bottom));overflow-x:hidden}.card,.card.third{grid-column:1/-1}.top{display:grid;grid-template-columns:1fr;gap:9px;margin-bottom:12px}.top p{display:none}.top .pill{justify-self:start;max-width:100%;white-space:normal}.mobile-home-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 12px}.mobile-home-controls button{width:100%;min-width:0;min-height:46px;padding:10px 8px;white-space:normal}.mobile-home-controls .mobile-cycle{grid-column:1/-1}.hero img{width:92px;height:92px}.roadmap-head{grid-template-columns:1fr 1fr}.road-item{grid-template-columns:88px 1fr}.road-status{grid-column:2;text-align:left}.composer{grid-template-columns:1fr}.two{grid-template-columns:1fr}}
@media(max-width:540px){.lora-steps{grid-template-columns:1fr}.top h1{font-size:29px}.pill{font-size:.75rem}.card{padding:14px;border-radius:17px}.mobile-home-controls{grid-template-columns:1fr 1fr}.mobile-home-controls button{font-size:.85rem}.hero{grid-template-columns:1fr;gap:10px}.hero img{width:74px;height:74px}.hero .actions{display:grid;grid-template-columns:1fr}.hero .actions button{width:100%}.roadmap-head{grid-template-columns:1fr 1fr}.filters select{width:100%}.msg{max-width:94%}.chatlog{min-height:350px}.status-row{align-items:flex-start;overflow-wrap:anywhere}}

/* Canonical /professor visual rules absorbed from the retired release patch. */
html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
html body{background-image:radial-gradient(circle at 82% 12%,rgba(34,211,238,.13),transparent 34%),radial-gradient(circle at 8% 82%,rgba(37,99,235,.14),transparent 36%),linear-gradient(180deg,rgba(2,7,18,.18),rgba(2,8,18,.56))!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important;background-attachment:scroll!important}
.sidebar{background:rgba(3,9,18,.94)!important}.card{background:linear-gradient(180deg,rgba(20,32,52,.97),rgba(8,18,34,.95))!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
.brand img,.hero img{display:block!important;object-fit:cover!important;object-position:center 28%!important;background:#07111f!important;transform:none!important;transform-origin:center!important;border-radius:50%!important;overflow:hidden!important}
.brand img{width:58px!important;height:58px!important;min-width:58px!important;min-height:58px!important;max-width:58px!important;max-height:58px!important}
.hero img{width:126px!important;height:126px!important;min-width:126px!important;min-height:126px!important;max-width:126px!important;max-height:126px!important}
.brand img~img,.hero img~img{display:none!important}
.mel-live-explanation{margin-top:7px;color:#dbeafe;line-height:1.45;font-size:.92rem}.mel-live-narrative{margin:0 0 12px;padding:12px 14px;border:1px solid rgba(96,165,250,.20);border-radius:14px;background:rgba(4,15,30,.62);color:#e0f2fe;line-height:1.45}.mel-live-narrative strong{color:#7dd3fc}
@media(max-width:1200px){html body{background-attachment:scroll!important}.shell{display:block!important}.sidebar{position:fixed!important;z-index:100!important;left:0!important;right:0!important;top:auto!important;bottom:0!important;width:100%!important;height:auto!important;border-right:0!important;border-top:1px solid var(--line)!important;padding:7px 7px calc(7px + env(safe-area-inset-bottom))!important}.main{margin-left:0!important;width:100%!important;padding:18px 11px calc(104px + env(safe-area-inset-bottom))!important}.brand,.home{display:none!important}.nav{display:flex!important;overflow-x:auto!important;gap:4px!important}.nav button{min-width:84px!important;flex:0 0 auto!important;flex-direction:column!important;text-align:center!important;font-size:.78rem!important;padding:7px!important}.top{width:100%!important}.card,.card.third,.card.wide{grid-column:1/-1!important}.hero{grid-template-columns:94px minmax(0,1fr)!important}.hero img{width:90px!important;height:90px!important;min-width:90px!important;min-height:90px!important;max-width:90px!important;max-height:90px!important}}

</style><style id="mel-control-center-style">
.mel-unified-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}.mel-unified-tabs button.active{background:linear-gradient(135deg,#2563eb,#1d4ed8)}[data-mode-panel][hidden]{display:none!important}
.canonical-autonomy-controls{display:flex;gap:7px;align-items:center;flex-wrap:wrap;grid-column:1/-1}.canonical-autonomy-controls .button,.canonical-autonomy-controls button{min-height:42px;font-weight:800}.canonical-autonomy-controls .max-active{background:#b91c1c}.canonical-watch-link{background:linear-gradient(135deg,#0f766e,#155e75)}
.autonomy-activity-panel{position:fixed;right:18px;top:82px;z-index:80;width:min(520px,calc(100vw - 24px));max-height:72vh;overflow:auto;border:1px solid var(--line);border-radius:17px;padding:14px;background:rgba(3,9,18,.98);box-shadow:0 24px 80px rgba(0,0,0,.55)}.autonomy-activity-panel[hidden]{display:none}.autonomy-activity-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.autonomy-activity-body{margin-top:10px}.nav button.mobile-more-nav,.mobile-more-menu{display:none}.learning-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:13px}.learning-actions .muted{flex:1 1 100%}#skillsHealthSummary{grid-template-columns:repeat(5,minmax(0,1fr))}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.001ms!important}}@media(max-width:960px){#skillsHealthSummary{grid-template-columns:1fr 1fr}html body{background-attachment:scroll!important}.canonical-autonomy-controls{display:none!important}.nav button[data-view="skills"],.nav button[data-view="roadmap"],.nav button[data-view="computer"],.nav button[data-view="terminal"],.nav button[data-view="lora"],.nav button[data-view="diagnostics"]{display:none!important}.mobile-more-nav{display:flex!important}.nav button{font-size:.78rem!important;min-width:76px!important}.mobile-more-menu{position:fixed;left:8px;right:8px;bottom:calc(79px + env(safe-area-inset-bottom));z-index:45;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:10px;border:1px solid var(--line);border-radius:15px;background:rgba(3,9,18,.98);box-shadow:0 18px 58px rgba(0,0,0,.55)}.mobile-more-menu:not([hidden]){display:grid}.mobile-more-menu button{width:100%;min-height:46px}.mobile-watch-link{grid-column:1/-1;width:100%}.autonomy-activity-panel{display:none!important}.cap-help-item,.cap-chip,.cap-help-state{font-size:.78rem!important}}
</style></head><body><div class="shell"><aside class="sidebar"><div class="brand"><img src="/assets/avatars/mel-full.webp" alt=""><div><strong>Mode complet</strong><small>Centre de contrôle</small></div></div><nav class="nav" id="nav"><button class="active" data-view="overview"><span class="ico">⌂</span>Vue d’ensemble</button><button data-view="chat"><span class="ico">◌</span>Chat</button><button data-view="skills"><span class="ico">◇</span>Compétences</button><button data-view="roadmap"><span class="ico">↗</span>Feuille de route</button><button data-view="multi"><span class="ico">✦</span>IA & Développement</button><button data-view="memory"><span class="ico">◎</span>Mémoire</button><button data-view="computer"><span class="ico">▤</span>Ordinateur</button><button data-view="terminal"><span class="ico">▥</span>Terminal MEL</button><button data-view="lora"><span class="ico">◈</span>LoRA gratuit</button><button data-view="diagnostics"><span class="ico">⚙</span>Diagnostic</button><button id="mobileMoreNav" class="mobile-more-nav" type="button" aria-expanded="false"><span class="ico">•••</span>Plus</button></nav><div id="mobileMoreMenu" class="mobile-more-menu" hidden aria-label="Outils supplémentaires"><button data-jump="skills">Compétences</button><button data-jump="roadmap">Feuille de route</button><button data-jump="computer">Ordinateur</button><button data-jump="terminal">Terminal MEL</button><button data-jump="lora">LoRA</button><button data-jump="diagnostics">Diagnostic</button></div><a class="home" href="/">Retour à l’accueil</a></aside><main class="main"><header class="top"><div><h1 id="viewTitle">Vue d’ensemble</h1><p id="viewSubtitle">État réel des briques principales.</p></div><div class="pill"><span id="globalDot" class="dot"></span><span id="globalState" role="status" aria-live="polite">Vérification…</span></div><div class="canonical-autonomy-controls" aria-label="Pilotage de MEL"><button id="melFullMax">MAX 100%</button><button id="melFullCycle" class="primary">▶ Démarrer cycle MEL</button><a class="button canonical-watch-link" href="/veille">Veille des capacités</a><button id="melFullStop">Mettre MEL en pause</button><button id="melFullActivity">Activité</button></div></header><aside id="desktopActivityPanel" class="autonomy-activity-panel" hidden aria-label="Activité réelle de MEL"><div class="autonomy-activity-head"><strong>Activité réelle de MEL</strong><button id="desktopActivityClose" type="button" aria-label="Fermer le panneau d’activité">×</button></div><div id="desktopActivityBody" class="autonomy-activity-body" role="status" aria-live="polite">Chargement…</div></aside>
<section class="view active" data-panel="overview"><div class="mobile-home-controls" aria-label="Commandes rapides MEL"><button id="mobileMaxAutonomy">MAX 100%</button><button id="mobilePauseAutonomy">Mettre MEL en pause</button><button id="mobileStartCycle" class="primary mobile-cycle">▶ Démarrer cycle MEL</button><button id="mobileResumeAutonomy">Reprendre MEL</button><button id="mobileActivityAutonomy">Activité</button><a class="button mobile-watch-link" href="/veille">Veille des capacités</a><div id="mobileAutonomyFeedback" class="mobile-home-feedback" role="status" aria-live="polite">Commandes MEL prêtes.</div><div id="mobileActivityPanel" class="mobile-activity-panel" hidden role="status" aria-live="polite"></div></div><div class="grid"><article class="card wide hero"><img src="/assets/avatars/mel-full.webp" alt="MEL"><div><div class="learning-summary-row" style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap"><h2 style="margin:6px 0 0">Système personnel</h2><div id="learningMeter" style="min-width:320px;max-width:440px"><span id="learningChip" role="button" tabindex="0" aria-expanded="false" title="Cliquer pour afficher les détails" style="display:flex;cursor:pointer;user-select:none;padding:13px 16px;border:1px solid rgba(125,211,252,.30);border-radius:999px;background:linear-gradient(120deg,rgba(34,211,238,.18),rgba(59,130,246,.14),rgba(167,139,250,.18));box-shadow:inset 0 1px 0 rgba(255,255,255,.15),0 10px 30px rgba(37,99,235,.17);transition:transform .18s ease,box-shadow .18s ease"><span style="display:flex;flex-direction:column;min-width:0;flex:1"><span style="display:flex;align-items:baseline;gap:10px;white-space:nowrap"><strong style="font-size:1.28rem;line-height:1.1">Niv. <span id="learnLevel">—</span></strong><span id="learnRank" style="font-size:.94rem;color:#bae6fd;font-weight:600">mesure…</span><span id="learnXp" style="margin-left:auto;font-size:1.02rem;font-weight:800;color:#e0f2fe">— XP</span><span id="learnArrow" style="font-size:1rem;color:#c4b5fd">⌄</span></span><span style="display:block;height:8px;margin-top:8px;border-radius:999px;background:rgba(255,255,255,.09);overflow:hidden"><span id="learnBar" style="display:block;height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#22d3ee,#60a5fa 55%,#a78bfa);box-shadow:0 0 14px rgba(34,211,238,.55);transition:width .35s ease"></span></span><span id="learnMeta" style="margin-top:6px;font-size:.84rem;line-height:1.2;color:#dbeafe;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">apprentissage réel · roadmap exclue</span></span></span><div id="learningDetails" style="display:none;margin-top:10px;padding:15px 17px;border:1px solid rgba(125,211,252,.18);border-radius:18px;background:linear-gradient(145deg,rgba(7,18,34,.88),rgba(27,30,54,.78));box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 16px 38px rgba(0,0,0,.20);font-size:.98rem;line-height:1.35"><div style="display:grid;grid-template-columns:1fr auto;gap:10px 16px"><span style="color:#b6c2d2">XP avant niveau suivant</span><strong id="learnNext">—</strong><span style="color:#b6c2d2">Corrections</span><strong id="learnCorrections">—</strong><span style="color:#b6c2d2">Prêtes entraînement</span><strong id="learnTraining">—</strong><span style="color:#b6c2d2">Benchmark</span><strong id="learnBenchmark">—</strong><span style="color:#b6c2d2">Essais réglages</span><strong id="learnTrials">—</strong><span style="color:#b6c2d2">Erreurs répétées</span><strong id="learnErrors">—</strong><span style="color:#b6c2d2">Poids runtime</span><strong id="learnWeights">—</strong></div><div style="margin-top:12px;color:#7dd3fc;font-size:.84rem;line-height:1.3">Mesure d’apprentissage uniquement — la feuille de route ne donne aucun XP.</div><div class="learning-actions"><button id="melRunBenchmark" type="button">Lancer benchmark</button><button id="melPrepareLora" type="button">Préparer LoRA</button><span id="melLearningActionState" class="muted" role="status" aria-live="polite">Actions opérateur prêtes.</span></div></div></div></div><p class="muted">Conversation, mémoire, code, outils, multi-IA, Work et évolution réunis dans un même centre de contrôle.</p><div class="actions"><button class="primary" data-jump="chat">Parler à MEL</button><button data-jump="roadmap">Voir la feuille de route</button><button data-jump="diagnostics">Tester le système</button></div></div></article><article class="card third"><h2>Compétences</h2><div class="metric"><span id="capCount">—</span> <small>enregistrées</small></div><p class="muted" id="capSummary">Chargement…</p></article><article class="card third"><h2>Feuille de route</h2><div class="metric"><span id="roadPercent">—</span><small>% terminé</small></div><div class="progress"><span id="roadBar" style="width:0%"></span></div></article><article class="card third"><h2>Accès au code</h2><div class="metric" id="codeMetric">—</div><p class="muted" id="codeSummary">Test non lancé.</p></article><article class="card wide"><div class="skill-head"><div><h2>Boucle MEL</h2><p class="muted" style="margin:6px 0 0">Avance automatiquement sur la roadmap canonique, uniquement sur la candidate.</p></div><span class="tag warn" id="autonomyBadge">Vérification…</span></div><div class="status-row"><span>Mode</span><strong id="autonomyMode">—</strong></div><div class="status-row"><span>Prochaine étape</span><span id="autonomyNext" class="muted">—</span></div><div class="footer-note" id="autonomyNote">La production reste verrouillée et nécessite une validation humaine.</div></article><article class="card wide"><h2>Santé du système</h2><div id="healthRows"><div class="status-row"><span>Chargement</span><span class="muted">…</span></div></div></article></div></section>
<section class="view" data-panel="chat"><div class="section-title"><h2>Conversation</h2><p>Le chat utilise mes capacités réelles quand ta demande les nécessite.</p></div><div class="cap-help" id="chatCapabilityHelp"><div class="cap-help-head"><div><strong>Ce que je sais faire</strong><div class="cap-help-intro">Cette fiche vient directement de mon CapabilityBus : elle décrit mes capacités enregistrées, pas une promesse théorique.</div><div class="cap-help-summary" id="chatCapSummary">Lecture de mes capacités…</div></div><button id="chatCapRefresh" type="button">Actualiser</button></div><div class="cap-help-groups" id="chatCapGroups"></div><details><summary>Voir toutes mes capacités</summary><div class="cap-help-list" id="chatCapList">Chargement…</div></details></div><article class="card wide"><div class="chatlog" id="chatlog"><div class="msg mel">Prête.</div></div><div class="actions"><button id="resumeLatestChat" class="ghost" type="button">Reprendre le dernier échange</button></div><div class="composer"><input id="chatInput" aria-label="Message à MEL" type="text" maxlength="12000" autocomplete="off" enterkeyhint="send" placeholder="Écris ici puis appuie sur Entrée pour envoyer."><button class="primary" id="chatSend">Envoyer</button></div><div class="muted" id="chatStatus" role="status" aria-live="polite" style="margin-top:8px"></div></article></section>
<section class="view" data-panel="skills"><div class="section-title"><h2>Compétences</h2><p>État enregistré instantanément. Utilise « Actualiser la santé » pour lancer les vérifications réelles des fournisseurs.</p></div><div class="roadmap-head" id="skillsHealthSummary"><div class="roadstat"><span class="muted">Opérationnelles</span><strong id="skillsHealthy">—</strong></div><div class="roadstat"><span class="muted">Protégées</span><strong id="skillsProtected">—</strong></div><div class="roadstat"><span class="muted">Dégradées</span><strong id="skillsDegraded">—</strong></div><div class="roadstat"><span class="muted">Non configurées</span><strong id="skillsUnavailable">—</strong></div><div class="roadstat"><span class="muted">En échec</span><strong id="skillsFailed">—</strong></div></div><article class="card wide"><div class="actions" style="margin-top:0"><button id="refreshSkills">Actualiser la santé</button><span id="skillsProviderSummary" class="muted" role="status" aria-live="polite">Vérification des fournisseurs…</span></div><div id="skillsList" style="margin-top:12px">Chargement…</div></article></section>
<section class="view" data-panel="roadmap"><div class="section-title"><h2>Feuille de route complète</h2><p>Source de vérité produit : fondations, mémoire, multi-IA, Work, évolution, voix, appareils, sécurité et maturité.</p></div><div class="roadmap-head"><div class="roadstat"><span class="muted">Total</span><strong id="rmTotal">—</strong></div><div class="roadstat"><span class="muted">Terminés</span><strong id="rmDone">—</strong></div><div class="roadstat"><span class="muted">En cours / partiel</span><strong id="rmActive">—</strong></div><div class="roadstat"><span class="muted">Progression</span><strong id="rmPercent">—</strong></div></div><div class="filters"><select id="rmStatus" aria-label="Filtrer la feuille de route par statut"><option value="">Tous les statuts</option><option value="DONE_VERIFIED">Vérifié</option><option value="DONE">Terminé</option><option value="IN_PROGRESS">En cours</option><option value="PARTIAL">Partiel</option><option value="PLANNED">Planifié</option><option value="BLOCKED_HUMAN">Bloqué humain</option><option value="BLOCKED_EXTERNAL">Bloqué externe</option></select><select id="rmPriority" aria-label="Filtrer la feuille de route par priorité"><option value="">Toutes priorités</option><option>P0</option><option>P1</option><option>P2</option><option>P3</option></select></div><div id="roadmapList">Chargement…</div></section>
<section class="view" data-panel="multi"><div class="section-title"><h2>IA & Développement</h2><p>Réunion multi-IA et travaux persistants dans une seule surface.</p></div><div id="melUnifiedTabs" class="mel-unified-tabs" role="tablist" aria-label="IA et développement"><button class="active" data-mode="meeting" role="tab" aria-selected="true">Réunion IA</button><button data-mode="development" role="tab" aria-selected="false">Développement</button></div><div data-mode-panel="meeting"><article class="card wide"><textarea id="multiInput" aria-label="Mission de la réunion multi-IA" placeholder="Mission ou compétence à étudier…"></textarea><div class="two" style="margin-top:10px"><label>Nombre de candidats<select id="multiN" aria-label="Nombre de modèles à consulter"><option>2</option><option selected>4</option><option>6</option><option>8</option><option>12</option></select></label><label>Revue Teacher<select id="multiTeacher" aria-label="Modèle professeur"><option value="false">Non</option><option value="true" selected>Oui</option></select></label></div><div class="actions"><button class="primary" id="multiRun">Lancer l’état des lieux</button></div><pre class="output" id="multiOut">Aucun résultat.</pre></article></div><div data-mode-panel="development" hidden><div class="grid"><article class="card"><h2>Dev Bridge</h2><div class="pill" id="bridgeState" style="margin-top:9px">Vérification…</div><textarea id="workGoal" aria-label="Objectif de développement" placeholder="Objectif de modification…" style="margin-top:12px"></textarea><div class="actions"><button class="primary" id="workCreate">Préparer</button><button id="workRefresh">Rafraîchir</button></div></article><article class="card"><h2>Dernier job</h2><pre class="output" id="workOut">Aucun job chargé.</pre></article><article class="card wide"><h2>Cycle d’évolution</h2><div class="status-row"><span>1. État des lieux multi-IA</span><span class="tag good">OBLIGATOIRE</span></div><div class="status-row"><span>2. Inspection code + réutilisation</span><span class="tag warn">EN COURS</span></div><div class="status-row"><span>3. Spec → génération → validation → tests</span><span class="tag warn">PARTIEL</span></div><div class="status-row"><span>4. Benchmark + critique + correction</span><span class="tag warn">PARTIEL</span></div><div class="status-row"><span>5. Activation supervisée + ledger</span><span class="tag warn">À COMPLÉTER</span></div></article></div></div></section>
<section class="view" data-panel="memory"><div class="section-title"><h2>Mémoire & import</h2><p>Persistance, RAG, export et import de contexte ChatGPT.</p></div><div class="grid"><article class="card"><h2>État</h2><pre class="output" id="memoryOut">Chargement…</pre><div class="actions"><button id="memoryRefresh">Actualiser</button></div></article><article class="card"><h2>Export</h2><p class="muted">Export portable de la mémoire et des interactions.</p><div class="actions"><a class="button" href="/api/export">Télécharger l’export</a></div></article><article class="card wide"><div class="skill-head"><div><h2>ShardVault · sauvegarde distribuée</h2><p class="muted" style="margin:6px 0 0">Recherche et sélection des cibles autonomes utilisées pour la continuité mémoire de MEL.</p></div><span class="tag warn" id="shardVaultState">Chargement…</span></div><div class="actions"><button id="shardVaultSnapshot" class="primary">Sauvegarder maintenant</button><button id="shardVaultRefresh">Actualiser</button><a class="button" href="/shardvault">Explorer les sauvegardes et Internet</a></div><pre class="output" id="shardVaultOut">Chargement de l’état ShardVault…</pre></article><article class="card wide"><div class="skill-head"><div><h2>Archive ChatGPT</h2><p class="muted" style="margin:6px 0 0">État serveur de l’archive ChatGPT déjà importée. Le collecteur Firefox est retiré ; cette zone reste disponible pour consulter l’historique conservé.</p></div><span class="tag warn" id="chatgptServerState">Chargement…</span></div><div class="two" style="margin-top:12px"><div><div class="status-row"><span>Conversations reçues</span><strong id="chatgptServerConversations">—</strong></div><div class="status-row"><span>Messages reçus</span><strong id="chatgptServerMessages">—</strong></div><div class="status-row"><span>Observations mémoire préparées</span><strong id="chatgptServerCandidates">—</strong></div></div><div><div class="status-row"><span>Messages restant à préparer</span><strong id="chatgptServerUnsynced">—</strong></div><div class="status-row"><span>Dernière conversation</span><strong id="chatgptServerLast">—</strong></div><div class="status-row"><span>Chaîne mémoire</span><strong id="chatgptServerMemoryStage">—</strong></div></div></div><div class="footer-note">L’archive brute reste conservée. Les messages sont aussi rendus recherchables par MEL et transformés en observations mémoire avec provenance ; ils ne deviennent pas automatiquement des faits certains.</div><div class="actions"><button id="chatgptStatusRefresh">Actualiser l’archive</button></div><pre class="output" id="chatgptStatusOut">Chargement…</pre></article><article class="card wide"><h2>Importer un export ChatGPT</h2><p class="muted">L’importeur conserve les conversations brutes, les rend recherchables et prépare leur contenu pour la chaîne mémoire avec provenance.</p><input id="chatgptFile" aria-label="Importer une archive ChatGPT" type="file" accept="application/json,.json"><div class="actions"><button id="chatgptImport" class="primary">Importer</button></div><pre class="output" id="chatgptOut">Aucun import lancé.</pre></article></div></section>
<section class="view" data-panel="terminal"><div class="section-title"><h2>Terminal MEL · Waveshare</h2><p>Préparation, appairage et état du terminal ESP32-S3 3,5 pouces.</p></div><div class="grid"><article class="card"><div class="skill-head"><div><h2>Premier démarrage</h2><p class="muted" style="margin:6px 0 0">Le code d’appairage est valable 10 minutes et ne révèle pas ton mot de passe MEL au terminal.</p></div><span class="tag warn" id="terminalState">EN ATTENTE</span></div><div class="metric" id="terminalPairCode" style="letter-spacing:.12em">— — — —</div><div class="actions"><button class="primary" id="terminalPairCreate">Créer un code d’appairage</button><button id="terminalRefresh">Actualiser</button></div><div class="footer-note" id="terminalPairNote">Sur MINI : connecte le Wi-Fi depuis l’écran tactile, touche l’icône de liaison puis saisis ce code.</div></article><article class="card"><h2>Installation / récupération</h2><p class="muted">Le script Windows installera l’outil de flash si nécessaire et utilisera le paquet firmware validé.</p><div class="actions"><a class="button primary" href="/api/device/v1/setup-script">Télécharger le flashage Windows</a></div><div class="status-row"><span>Carte cible</span><strong>ESP32-S3-Touch-LCD-3.5-C</strong></div><div class="status-row"><span>Caméra</span><strong>OV5640</strong></div><div class="status-row"><span>Écran</span><strong>320×480 tactile</strong></div><div class="status-row"><span>Audio</span><strong>ES8311 + micro</strong></div></article><article class="card wide"><h2>Terminaux appairés</h2><div id="terminalDevices"><div class="muted">Chargement des terminaux…</div></div></article><article class="card wide"><h2>Fonctions préparées</h2><div class="status-row"><span>Connexion Wi-Fi + appairage à usage unique</span><span class="tag good">PRÊT</span></div><div class="status-row"><span>Chat MEL</span><span class="tag good">PRÊT BACKEND</span></div><div class="status-row"><span>Micro → transcription française</span><span class="tag good">INTÉGRÉ</span></div><div class="status-row"><span>Réponse vocale haut-parleur ES8311</span><span class="tag good">INTÉGRÉE</span></div><div class="status-row"><span>Caméra OV5640</span><span class="tag good">COMPILÉ</span></div><div class="status-row"><span>Téléchargement / OTA</span><span class="tag good">COMPILÉ</span></div><div class="status-row"><span>Powerbank USB-C</span><span class="tag good">SANS SOUDURE</span></div><pre class="output" id="terminalOut">MINI v0.4.5 · protocole v1.0 · Wi-Fi tactile + voix + MEL + caméra + OTA.</pre></article></div></section>
<section class="view" data-panel="lora"><div class="section-title"><h2>LoRA UNCENSORED gratuit</h2><p>Parcours sans GPU payant déclenché par MEL : entraînement Kaggle T4 gratuit, checkpoints immuables, benchmark local puis benchmark canonique avant activation.</p></div><article class="card wide"><div class="skill-head"><div><h2>Pipeline gratuit</h2><p class="muted" style="margin:6px 0 0">Dépôt cible : <strong>Meliturgos/mel-lora-uncensored</strong></p></div><span class="tag good" id="freeLoraCostBadge">GPU payant désactivé</span></div><div class="lora-cost" style="margin-top:14px">MEL orchestre uniquement le quota GPU gratuit Kaggle. Aucun fallback GPU payant n’est autorisé ; Colab reste un secours manuel.</div><div class="status-row"><span>Minimum MEL validé</span><strong id="freeLoraLessons">—/50</strong></div><div class="status-row"><span>GPU Kaggle</span><strong id="freeKaggleState">—</strong></div><div class="status-row"><span>Cycle Kaggle</span><strong id="freeKaggleCycle">—</strong></div><div class="status-row"><span>Exemples réellement entraînés</span><strong id="freeTrainingExamples">—</strong></div><div class="status-row"><span>Checkpoint</span><strong id="freeCheckpointStage">—</strong></div><div class="status-row"><span>LoRA Hugging Face compatibles</span><strong id="freeCompatibleLoras">—</strong></div><div class="status-row"><span>Benchmark</span><strong id="freeBenchmarkState">—</strong></div><div class="status-row"><span>Phase suivante</span><strong id="freeImpactStage">—</strong></div><div class="two" style="margin-top:10px"><div><div class="status-row"><span>Profondeur technique</span><strong id="freeImpactTechnical">—</strong></div><div class="status-row"><span>Réponses sensibles</span><strong id="freeImpactSensitive">—</strong></div><div class="status-row"><span>Sur-refus</span><strong id="freeImpactRefusal">—</strong></div></div><div><div class="status-row"><span>Frontière question test</span><strong id="freeImpactBoundary">—</strong></div><div class="status-row"><span>Agentivité</span><strong id="freeImpactAgentic">—</strong></div><div class="status-row"><span>Gain impact global</span><strong id="freeImpactDelta">—</strong></div></div></div><div class="footer-note">Question test fixe exécutée dans le benchmark interne. Seuls les scores sont conservés ; la réponse brute n’est pas enregistrée.</div><div class="lora-progress-label"><span id="freeLoraProgressText">État à charger…</span><strong id="freeLoraProgressPercent">—</strong></div><div class="progress"><span id="freeLoraBar" style="width:0%"></span></div><div class="lora-steps"><div class="lora-step"><b>1. GPU Kaggle</b><span class="tag warn" id="freeGpuState">Vérification…</span><small style="margin-top:8px">Heartbeat MEL → shard verbatim → T4 gratuit → benchmark local. Reprise automatique depuis le dernier checkpoint.</small><a class="button lora-link" id="freeLoraColab" target="_blank" rel="noopener" href="https://www.kaggle.com/code/adrienlopezcarreras/mel-lora-uncensored-notebook-t4">Voir Kaggle</a></div><div class="lora-step"><b>2. Checkpoint immuable</b><span class="tag warn" id="freeHfState">Vérification…</span><small style="margin-top:8px">Chaque cycle validé conserve artefact, manifeste, provenance et benchmark local avant de poursuivre.</small><a class="button lora-link" id="freeLoraHf" target="_blank" rel="noopener" href="https://huggingface.co/Meliturgos/mel-lora-uncensored">Voir le bundle</a></div><div class="lora-step"><b>3. GitHub → Cloudflare</b><span class="tag warn" id="freeWorkflowState">Vérification…</span><small style="margin-top:8px">Valide, upload, approuve l’artefact exact et benchmarke dans le preview.</small><a class="button lora-link" id="freeLoraWorkflow" target="_blank" rel="noopener" href="https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/workflows/lora-promote-from-huggingface.yml">Ouvrir la promotion</a></div><div class="lora-step"><b>4. MEL</b><span class="tag warn" id="freeRuntimeState">Vérification…</span><small style="margin-top:8px" id="freeRuntimeDetail">État runtime en cours de vérification.</small><button class="lora-link" id="freeLoraRefresh" type="button">Actualiser l’état</button></div><div class="lora-step"><b>5. AGENTIC</b><span class="tag warn" id="freeAgenticState">Vérification…</span><small style="margin-top:8px">Crée un nouvel adaptateur enfant à partir d’UNCENSORED. Le parent reste intact.</small><a class="button lora-link" id="freeAgenticColab" target="_blank" rel="noopener" aria-disabled="true">Ouvrir AGENTIC</a></div></div><div class="two"><div><h3>Fichiers attendus</h3><div class="lora-files" id="freeLoraFiles">Chargement…</div></div><div><h3>Dernier workflow</h3><pre class="output" id="freeLoraWorkflowDetail">Chargement…</pre></div></div><div class="footer-note">La production reste hors de ce parcours. L’activation concerne uniquement le preview isolé lorsque le workflow est lancé avec <code>activate_preview=true</code> et que le benchmark passe.</div></article></section>
<section class="view" data-panel="computer"><div class="section-title"><h2>Ordinateur MEL</h2><p>Compagnon Windows appairé : écran, souris, clavier et applications autorisées.</p></div><div class="grid"><article class="card"><div class="skill-head"><div><h2>Connexion</h2><p class="muted" style="margin:6px 0 0">Le compagnon démarre avec Windows et ne reçoit que les actions validées par MEL.</p></div><span class="tag warn" id="computerState">VÉRIFICATION…</span></div><label style="display:block;margin-top:12px">Ordinateur<select id="computerSelect" aria-label="Ordinateur appairé"><option value="">Chargement…</option></select></label><div class="status-row"><span>Dernier contact</span><strong id="computerLastSeen">—</strong></div><div class="status-row"><span>Fenêtre active</span><strong id="computerActiveWindow">—</strong></div><div class="actions"><a class="button primary" href="/api/computer/v1/installer">Télécharger l’installation Windows</a><button id="computerRefresh">Actualiser</button><button id="computerHalt">ARRÊTER LE CONTRÔLE</button><button id="computerResume">Réactiver</button></div></article><article class="card"><h2>Actions rapides</h2><p class="muted">Les actions de saisie et d’ouverture d’application sont envoyées avec ton approbation explicite depuis cet écran.</p><div class="actions"><button id="computerShot" class="primary">Capture écran</button><button data-pc-app="notepad">Bloc-notes</button><button data-pc-app="calculator">Calculatrice</button><button data-pc-app="explorer">Explorateur</button></div><label style="display:block;margin-top:12px">Texte à écrire<input id="computerText" aria-label="Texte à saisir sur l’ordinateur" maxlength="4096" placeholder="Texte à saisir dans la fenêtre active"></label><div class="actions"><button id="computerType">Écrire</button><button data-pc-key="ENTER">Entrée</button><button data-pc-key="TAB">Tab</button><button data-pc-key="CTRL+L">Ctrl+L</button><button data-pc-key="ALT+TAB">Alt+Tab</button></div></article><article class="card wide"><div class="skill-head"><div><h2>Écran</h2><p class="muted" style="margin:6px 0 0">Après une capture, clique sur l’image pour déplacer le pointeur et cliquer à cet endroit.</p></div><span class="tag" id="computerScreenState">AUCUNE CAPTURE</span></div><div style="margin-top:12px;min-height:220px;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#020617;display:flex;align-items:center;justify-content:center"><img id="computerScreen" alt="Écran de l’ordinateur MEL" style="display:none;max-width:100%;width:100%;height:auto;cursor:crosshair"></div><div class="actions"><button id="computerScrollUp">Défiler ↑</button><button id="computerScrollDown">Défiler ↓</button></div></article><article class="card wide"><h2>Historique du contrôle</h2><pre class="output" id="computerOut">Chargement de l’état ordinateur…</pre></article></div></section>
<section class="view" data-panel="diagnostics"><div class="section-title"><h2>Diagnostic</h2><p>Tests réels des briques essentielles avant déploiement ou évolution.</p></div><div class="grid"><article class="card"><h2>Accès au code</h2><p class="muted">Lecture du fichier public de routeur sur la release configurée.</p><div class="diag-actions"><button class="primary" id="codeSelfCheck">Tester maintenant</button></div><div class="code-proof" id="codeProof">Non testé.</div></article><article class="card"><h2>CapabilityBus</h2><p class="muted">Santé et nombre de capacités enregistrées.</p><div class="diag-actions"><button id="diagCaps">Tester</button></div><div class="code-proof" id="diagCapsOut">Non testé.</div></article><article class="card"><h2>Roadmap API</h2><p class="muted">Vérifie que la source de vérité est disponible.</p><div class="diag-actions"><button id="diagRoadmap">Tester</button></div><div class="code-proof" id="diagRoadmapOut">Non testé.</div></article><article class="card"><h2>.augmentio</h2><p class="muted">État de l’orchestration multi-IA; aucune dépense inconnue ne doit être engagée.</p><div class="diag-actions"><button id="diagAug">Tester</button></div><div class="code-proof" id="diagAugOut">Non testé.</div></article><article class="card wide"><h2>Déploiement / rollback</h2><p class="footer-note">Une seule interface Professeur est active. La production ne doit jamais être remplacée par une candidate non validée ; tout rollback reste une opération de release contrôlée et D1 n’est jamais rollback automatiquement.</p></article></div></section>
</main></div><script>
const qs=s=>document.querySelector(s),qsa=s=>[...document.querySelectorAll(s)];
const titles={overview:['Vue d’ensemble','État réel des briques principales.'],chat:['Conversation','Chat et capacités automatiques.'],skills:['Compétences','CapabilityBus et santé.'],roadmap:['Feuille de route','Toutes les étapes du projet MEL.'],multi:['IA & Développement','Réunion multi-IA et travaux persistants dans une seule surface.'],memory:['Mémoire','Persistance, RAG, import et sauvegarde.'],computer:['Ordinateur','Écran, souris, clavier et applications autorisées.'],terminal:['Terminal MEL','Waveshare, appairage, firmware et état matériel.'],lora:['LoRA UNCENSORED','Kaggle gratuit, checkpoints continus, impact et passage AGENTIC.'],diagnostics:['Diagnostic','Contrôles réels avant évolution ou release.']};
const legacyPanelAliases={work:{panel:'multi',mode:'development'}};
let roadmapCache=null,roadmapCacheAt=0,capabilityCache=null,capabilityCacheAt=0;
const PANEL_TTL_MS=30000,panelLoadedAt=new Map(),getInflight=new Map();
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{}),{once:true});}
async function jfetch(url,opts={}){
  const method=String(opts?.method||'GET').toUpperCase();
  if(method==='GET'){
    const existing=getInflight.get(url);
    if(existing)return existing;
    const task=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
      try{
        const r=await fetch(url,{...opts,signal:opts.signal||controller.signal}),t=await r.text();let d;
        try{d=JSON.parse(t)}catch{throw Error('Réponse serveur invalide')}
        if(!r.ok)throw Error(d.error||d.code||('HTTP '+r.status));
        return d
      }catch(e){
        if(e?.name==='AbortError')throw Error('Réponse serveur trop lente');
        throw e
      }finally{clearTimeout(timer)}
    })().finally(()=>getInflight.delete(url));
    getInflight.set(url,task);
    return task;
  }
  const r=await fetch(url,opts),t=await r.text();let d;try{d=JSON.parse(t)}catch{throw Error('Réponse serveur invalide')}if(!r.ok)throw Error(d.error||d.code||('HTTP '+r.status));return d
}
async function loadCapabilitiesData(force=false){
  if(!force&&capabilityCache&&Date.now()-capabilityCacheAt<PANEL_TTL_MS)return capabilityCache;
  capabilityCache=await jfetch('/api/gen2/capabilities?refresh='+(force?'1':'0'));
  capabilityCacheAt=Date.now();
  return capabilityCache;
}
function capabilityUsable(x){return x?.enabled!==false&&!['UNAVAILABLE','OFFLINE','BLOCKED','DISABLED','ERROR','FAILED','FAIL','DOWN','UNHEALTHY','BROKEN'].includes(String(x?.health||'').toUpperCase())}
function capabilityHealthMeta(skill){
  const raw=skill?.enabled===false?'DISABLED':String(skill?.health||'UNKNOWN').toUpperCase();
  const labels={HEALTHY:'ACTIF',ONLINE:'ACTIF',PROTECTED:'PROTÉGÉ',DEGRADED:'DÉGRADÉ',UNKNOWN:'À VÉRIFIER',UNTESTED:'NON TESTÉ',NOT_TESTED:'NON TESTÉ',UNAVAILABLE:'NON CONFIGURÉ',OFFLINE:'HORS LIGNE',DISABLED:'DÉSACTIVÉ',BLOCKED:'BLOQUÉ',ERROR:'EN ÉCHEC',FAILED:'EN ÉCHEC',FAIL:'EN ÉCHEC',DOWN:'EN ÉCHEC',UNHEALTHY:'EN ÉCHEC',BROKEN:'EN ÉCHEC'};
  const failure=['ERROR','FAILED','FAIL','DOWN','UNHEALTHY','BROKEN'];
  const kind=['HEALTHY','ONLINE'].includes(raw)?'good':raw==='PROTECTED'?'protected':['UNAVAILABLE','OFFLINE','DISABLED'].includes(raw)?'neutral':failure.includes(raw)||raw==='BLOCKED'?'bad':'warn';
  return{raw,label:labels[raw]||raw,kind};
}
function renderCapabilitySummary(caps){
  qs('#capCount').textContent=caps.length;
  qs('#capSummary').textContent=caps.filter(capabilityUsable).length+' utilisables';
}
async function loadCapabilitySummary(force=false){
  const d=await loadCapabilitiesData(force),caps=Array.isArray(d.capabilities)?d.capabilities:[];
  renderCapabilitySummary(caps);
  return caps;
}
async function loadRoadmapData(force=false){
  if(!force&&roadmapCache&&Date.now()-roadmapCacheAt<PANEL_TTL_MS)return roadmapCache;
  roadmapCache=await jfetch('/api/gen2/roadmap');
  roadmapCacheAt=Date.now();
  return roadmapCache;
}
function finiteMetric(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}
function setMetric(selector,value,suffix=''){
  const node=qs(selector),n=finiteMetric(value);if(!node)return n;
  node.textContent=n===null?'—':String(n)+suffix;return n;
}
function renderRoadmapSummary(d){
  const s=d?.summary&&typeof d.summary==='object'?d.summary:null;
  const bs=s?.by_status&&typeof s.by_status==='object'?s.by_status:null;
  const total=setMetric('#rmTotal',s?.total),done=setMetric('#rmDone',s?.complete);
  const inProgress=finiteMetric(bs?.IN_PROGRESS),partial=finiteMetric(bs?.PARTIAL);
  qs('#rmActive').textContent=inProgress===null||partial===null?'—':String(inProgress+partial);
  const percent=finiteMetric(s?.percent_complete);
  qs('#rmPercent').textContent=percent===null?'—':percent+'%';
  qs('#roadPercent').textContent=percent===null?'—':String(percent);
  qs('#roadBar').style.width=percent===null?'0%':Math.max(0,Math.min(100,percent))+'%';
  return total!==null&&done!==null&&inProgress!==null&&partial!==null&&percent!==null;
}
function renderCapabilityOverview(caps){
  const total=setMetric('#capCount',caps?.total),active=finiteMetric(caps?.usable??caps?.active);
  const protectedCount=finiteMetric(caps?.protected),degraded=finiteMetric(caps?.degraded),unavailable=finiteMetric(caps?.unavailable),failed=finiteMetric(caps?.failed);
  qs('#capSummary').textContent=active===null?'État indisponible':active+' utilisables';
  if(active!==null){
    const parts=[active+' utilisables'];
    if(protectedCount>0)parts.push(protectedCount+' protégées');
    if(degraded>0)parts.push(degraded+' dégradées');
    if(unavailable>0)parts.push(unavailable+' non configurées');
    if(failed>0)parts.push(failed+' en échec');
    qs('#capSummary').textContent=parts.join(' · ');
  }
  return total!==null&&active!==null;
}
async function loadRoadmapSummary(force=false){const d=await loadRoadmapData(force);renderRoadmapSummary(d);return d}
async function loadDashboardSummary(){
  const d=await jfetch('/api/gen2/dashboard-summary');
  const caps=d?.capabilities&&typeof d.capabilities==='object'?d.capabilities:null;
  renderCapabilityOverview(caps);
  renderRoadmapSummary({summary:d?.roadmap});
  const state=String(d?.state||'WARN').toUpperCase();
  qs('#globalState').textContent=state==='OK'?'Système prêt':state==='ERROR'?'Attention requise':'Partiellement prêt';
  qs('#globalDot').className='dot '+(state==='OK'?'good':state==='ERROR'?'bad':'warn');
  const rows=Array.isArray(d?.components)?d.components:[];
  qs('#healthRows').innerHTML='';
  const fragment=document.createDocumentFragment();
  for(const row of rows){
    const el=document.createElement('div');el.className='status-row';
    const left=document.createElement('span');left.textContent=String(row?.label||row?.id||'Composant');
    const right=document.createElement('span');right.textContent=String(row?.detail||row?.status||'—');
    right.className='tag '+(row?.status==='OK'?'good':row?.status==='ERROR'?'bad':row?.status==='INFO'?'neutral':row?.status==='PROTECTED'?'protected':'warn');
    el.append(left,right);fragment.appendChild(el);
  }
  qs('#healthRows').appendChild(fragment);
  if(!rows.length)qs('#healthRows').textContent='État détaillé indisponible.';
  return d;
}
async function loadPanel(name,force=false){
  const last=panelLoadedAt.get(name)||0;
  if(!force&&Date.now()-last<PANEL_TTL_MS)return;
  const loaders={
    chat:()=>loadChatCapabilities(force),
    skills:()=>loadSkills(force),
    roadmap:()=>loadRoadmap(force),
    memory:()=>loadMemory(),
    computer:()=>loadComputer(),
    terminal:()=>loadTerminal(),
    lora:()=>loadFreeLoraStatus()
  };
  const loader=loaders[name];
  if(!loader)return;
  await loader();
  panelLoadedAt.set(name,Date.now());
}
async function setUnifiedMode(mode){
  const normalized=mode==='development'?'development':'meeting';
  const development=normalized==='development';
  const modeTabs=qsa('#melUnifiedTabs [data-mode]');
  modeTabs.forEach(x=>{const active=x.dataset.mode===normalized;x.classList.toggle('active',active);x.setAttribute('aria-selected',String(active));});
  const meeting=qs('[data-mode-panel="meeting"]'),dev=qs('[data-mode-panel="development"]');
  if(meeting)meeting.hidden=development;if(dev)dev.hidden=!development;
  if(development){await loadWork().catch(()=>{});panelLoadedAt.set('multi:development',Date.now());}
}
function show(name){
  const alias=legacyPanelAliases[name]||null;
  let target=alias?.panel||name;
  if(!titles[target]||!qs('.view[data-panel="'+target+'"]'))target='overview';
  qsa('.view').forEach(v=>v.classList.toggle('active',v.dataset.panel===target));
  qsa('#nav button[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===target));
  qs('#viewTitle').textContent=titles[target][0];
  qs('#viewSubtitle').textContent=titles[target][1];
  const menu=qs('#mobileMoreMenu'),more=qs('#mobileMoreNav');
  if(menu)menu.hidden=true;if(more)more.setAttribute('aria-expanded','false');
  loadPanel(target).catch(()=>{});
  if(alias?.mode)setUnifiedMode(alias.mode).catch(()=>{});
}
qsa('#nav button[data-view]').forEach(b=>b.onclick=()=>show(b.dataset.view));qsa('[data-jump]').forEach(b=>b.onclick=()=>show(b.dataset.jump));
const modeTabs=qsa('#melUnifiedTabs [data-mode]');
modeTabs.forEach(tab=>tab.onclick=()=>setUnifiedMode(tab.dataset.mode));
const mobileMoreNav=qs('#mobileMoreNav');if(mobileMoreNav)mobileMoreNav.onclick=()=>{const menu=qs('#mobileMoreMenu');if(!menu)return;menu.hidden=!menu.hidden;mobileMoreNav.setAttribute('aria-expanded',String(!menu.hidden));};
function stableId(key){try{let v=localStorage.getItem(key);if(!v){v=crypto.randomUUID();localStorage.setItem(key,v)}return v}catch{return crypto.randomUUID()}}
let conversationId=stableId('mel.conversation');const deviceId=stableId('mel.device');
function addMsg(role,text){const d=document.createElement('div');d.className='msg '+(role==='user'?'user':'mel');d.textContent=text;qs('#chatlog').appendChild(d);qs('#chatlog').scrollTop=qs('#chatlog').scrollHeight}
async function sendChat(){const input=qs('#chatInput'),text=input.value.trim();if(!text)return;input.value='';addMsg('user',text);qs('#chatSend').disabled=true;qs('#chatStatus').textContent='Réflexion…';try{const d=await jfetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,conversation_id:conversationId,device_id:deviceId})});addMsg('mel',d.text||d.response||'Réponse vide.');qs('#chatStatus').textContent=''}catch(e){addMsg('mel','Erreur : '+e.message);qs('#chatStatus').textContent=e.message}finally{qs('#chatSend').disabled=false;input.focus()}}
async function resumeLatestConversation(){const button=qs('#resumeLatestChat');if(button)button.disabled=true;qs('#chatStatus').textContent='Chargement du dernier échange…';try{const d=await jfetch('/api/mel/conversations/latest');if(!d?.conversation?.id)throw Error('Aucune conversation précédente.');conversationId=String(d.conversation.id);localStorage.setItem('mel.conversation',conversationId);qs('#chatlog').innerHTML='';for(const row of (Array.isArray(d.messages)?d.messages:[]).slice(-60)){const role=String(row?.role||'').toLowerCase();if(role==='user'||role==='assistant'||role==='mel')addMsg(role==='user'?'user':'mel',row?.content||row?.text||'')}qs('#chatStatus').textContent='Dernier échange repris.'}catch(e){qs('#chatStatus').textContent='Reprise impossible : '+e.message}finally{if(button)button.disabled=false}}
qs('#chatSend').onclick=sendChat;qs('#chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();sendChat()}});qs('#resumeLatestChat').onclick=resumeLatestConversation;
function statusTag(s){const good=['ONLINE','HEALTHY','DONE','DONE_VERIFIED'].includes(s),bad=['OFFLINE','BLOCKED_EXTERNAL','BLOCKED_HUMAN'].includes(s);return '<span class="tag '+(good?'good':bad?'bad':'warn')+'">'+String(s||'UNKNOWN')+'</span>'}
function capFamily(id){const v=String(id||'').toLowerCase();if(v.startsWith('code.'))return'Code';if(/conversation|memory|rag|archive/.test(v))return'Mémoire & échanges';if(/roadmap|evolution|dev|module|work/.test(v))return'Développement';if(/augmentio|teacher|model|research|web/.test(v))return'IA & recherche';if(/device|sync|browser|mail|gmail|drive|calendar/.test(v))return'Outils & connexions';return'Autres'}
async function loadChatCapabilities(force=false){const summary=qs('#chatCapSummary'),groups=qs('#chatCapGroups'),list=qs('#chatCapList');if(!summary||!groups||!list)return[];summary.textContent='Lecture de mes capacités…';try{const d=await loadCapabilitiesData(force);if(!Array.isArray(d?.capabilities))throw Error('Liste CapabilityBus absente');const caps=d.capabilities;const active=caps.filter(capabilityUsable);const by={};for(const x of active){const f=capFamily(x.id);by[f]=(by[f]||0)+1}summary.textContent=active.length+' capacité'+(active.length>1?'s':'')+' disponible'+(active.length>1?'s':'')+' sur '+caps.length+' enregistrée'+(caps.length>1?'s':'')+'.';groups.innerHTML=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,n])=>'<span class="cap-chip">'+esc(k)+' · '+n+'</span>').join('');list.innerHTML=caps.map(x=>{const meta=capabilityHealthMeta(x);return '<div class="cap-help-item"><strong>'+esc(x.name||x.id)+'</strong><small>'+esc(x.description||x.id||'')+'</small><span class="cap-help-state '+meta.kind+'">'+esc(meta.label)+'</span></div>'}).join('')||'<div class="muted">Aucune capacité enregistrée.</div>';return caps}catch(e){summary.textContent='Capacités indisponibles : '+e.message;groups.innerHTML='';list.textContent='Impossible de lire le CapabilityBus.';throw e}}
qs('#chatCapRefresh').onclick=()=>{panelLoadedAt.delete('chat');loadChatCapabilities(true).then(()=>panelLoadedAt.set('chat',Date.now())).catch(()=>{})};
async function loadSkills(force=false){
  const box=qs('#skillsList');box.textContent='Vérification de la santé réelle…';
  try{
    const d=await loadCapabilitiesData(force),caps=Array.isArray(d.capabilities)?d.capabilities:[];
    renderCapabilitySummary(caps);
    const counts={healthy:0,protected:0,degraded:0,unavailable:0,failed:0},providers={};
    for(const skill of caps){
      const meta=capabilityHealthMeta(skill),provider=String(skill.provider||'core');
      providers[provider]=providers[provider]||{total:0,usable:0};providers[provider].total++;if(capabilityUsable(skill))providers[provider].usable++;
      if(['HEALTHY','ONLINE'].includes(meta.raw))counts.healthy++;
      else if(meta.raw==='PROTECTED')counts.protected++;
      else if(['DEGRADED','UNKNOWN','UNTESTED','NOT_TESTED'].includes(meta.raw))counts.degraded++;
      else if(['ERROR','FAILED','FAIL','DOWN','UNHEALTHY','BROKEN','BLOCKED'].includes(meta.raw))counts.failed++;
      else counts.unavailable++;
    }
    const set=(id,value)=>{const el=qs(id);if(el)el.textContent=value};
    set('#skillsHealthy',counts.healthy);set('#skillsProtected',counts.protected);set('#skillsDegraded',counts.degraded);set('#skillsUnavailable',counts.unavailable);set('#skillsFailed',counts.failed);
    const providerSummary=qs('#skillsProviderSummary');if(providerSummary)providerSummary.textContent=Object.entries(providers).sort((a,b)=>a[0].localeCompare(b[0])).map(([name,row])=>name+' '+row.usable+'/'+row.total).join(' · ')||'Aucun fournisseur';
    box.innerHTML='';const fragment=document.createDocumentFragment();
    for(const skill of caps){
      const meta=capabilityHealthMeta(skill),el=document.createElement('div');el.className='skill';
      const detail=skill.health_detail?'<div class="footer-note" style="margin-top:7px">Diagnostic : '+esc(skill.health_detail)+'</div>':'';
      el.innerHTML='<div class="skill-head"><div><strong>'+esc(skill.name||skill.id)+'</strong><div class="muted">'+esc(skill.description||'')+'</div><div class="code-proof">'+esc(skill.id||'')+' · '+esc(skill.provider||'core')+'</div>'+detail+'</div><span class="tag '+meta.kind+'">'+esc(meta.label)+'</span></div>';
      fragment.appendChild(el);
    }
    box.appendChild(fragment);if(!caps.length)box.textContent='Aucune compétence enregistrée.';return caps;
  }catch(e){box.textContent='Indisponible : '+e.message;throw e}
}
qs('#refreshSkills').onclick=()=>{panelLoadedAt.delete('skills');loadSkills(true).then(()=>panelLoadedAt.set('skills',Date.now())).catch(()=>{})};
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function loadRoadmap(force=false){const box=qs('#roadmapList');box.textContent='Chargement…';const d=await loadRoadmapData(force);renderRoadmapSummary(d);renderRoadmap();return d}
function renderRoadmap(){if(!roadmapCache)return;const sf=qs('#rmStatus').value,pf=qs('#rmPriority').value,box=qs('#roadmapList');box.innerHTML='';const fragment=document.createDocumentFragment();let rendered=0;for(const phase of roadmapCache.phases||[]){const items=(phase.items||[]).filter(item=>(!sf||item.status===sf)&&(!pf||item.priority===pf));if(!items.length)continue;const ph=document.createElement('section');ph.className='phase';ph.innerHTML='<h3><span>'+esc(phase.title)+'</span><span class="tag">'+items.length+' étape(s)</span></h3>';for(const item of items){const row=document.createElement('div');row.className='road-item';row.innerHTML='<div class="road-id">'+esc(item.id)+' · '+esc(item.priority)+'</div><div><div class="road-title">'+esc(item.title)+'</div><div class="road-next">'+esc(item.next||'—')+'</div></div><div class="road-status">'+statusTag(item.status)+'</div>';ph.appendChild(row)}fragment.appendChild(ph);rendered+=items.length}box.appendChild(fragment);if(!rendered)box.textContent='Aucune étape pour ces filtres.'}
qs('#rmStatus').onchange=renderRoadmap;qs('#rmPriority').onchange=renderRoadmap;
async function codeCheck(){const btn=qs('#codeSelfCheck');btn.disabled=true;qs('#codeProof').textContent='Test en cours…';try{const d=await jfetch('/api/gen2/code/self-check');const ok=!!d.ok;qs('#codeProof').textContent=ok?'Lecture OK · '+d.repository+' · '+d.branch+' · '+d.path+' · '+String(d.sha||'').slice(0,10):'Échec : '+(d.error||d.code||'inconnu');qs('#codeMetric').textContent=ok?'OK':'ERREUR';qs('#codeSummary').textContent=qs('#codeProof').textContent;return ok}catch(e){qs('#codeProof').textContent='Échec : '+e.message;qs('#codeMetric').textContent='ERREUR';qs('#codeSummary').textContent=e.message;return false}finally{btn.disabled=false}}
qs('#codeSelfCheck').onclick=codeCheck;
qs('#diagCaps').onclick=async()=>{try{const c=await loadSkills(true);qs('#diagCapsOut').textContent='OK · '+c.length+' capacité(s)'}catch(e){qs('#diagCapsOut').textContent='Échec · '+e.message}};
qs('#diagRoadmap').onclick=async()=>{try{roadmapCache=null;await loadRoadmap();qs('#diagRoadmapOut').textContent='OK · '+roadmapCache.summary.total+' étapes'}catch(e){qs('#diagRoadmapOut').textContent='Échec · '+e.message}};
qs('#diagAug').onclick=async()=>{try{const d=await jfetch('/api/gen2/capabilities?refresh=0');const a=(d.capabilities||[]).find(x=>x.id==='augmentio.fanout');qs('#diagAugOut').textContent=a?'Présent · '+a.health:'Non enregistré'}catch(e){qs('#diagAugOut').textContent='Échec · '+e.message}};
qs('#multiRun').onclick=async()=>{const input=qs('#multiInput').value.trim();if(!input)return;qs('#multiRun').disabled=true;qs('#multiOut').textContent='Consultation des IA…';try{const d=await jfetch('/api/gen2/augmentio/fanout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input,maxCandidates:Number(qs('#multiN').value),teacherReview:qs('#multiTeacher').value==='true'})});qs('#multiOut').textContent=JSON.stringify(d,null,2)}catch(e){qs('#multiOut').textContent='Erreur : '+e.message}finally{qs('#multiRun').disabled=false}};
async function loadChatGPTImportStatus(){try{const d=await jfetch('/api/gen2/import/chatgpt-status');const state=qs('#chatgptServerState');if(state){state.textContent=d.status==='ONLINE'?'ACTIF':d.status?'INDISPONIBLE':'ÉTAT INCONNU';state.className='tag '+(d.status==='ONLINE'?'good':'bad')}const fmt=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('fr-FR');qs('#chatgptServerConversations').textContent=fmt(d.conversations);qs('#chatgptServerMessages').textContent=fmt(d.messages);qs('#chatgptServerCandidates').textContent=fmt(d.memory_candidates);qs('#chatgptServerUnsynced').textContent=fmt(d.unsynced_messages);qs('#chatgptServerLast').textContent=d.last_received?.title||d.last_received?.conversation_id||'—';qs('#chatgptServerMemoryStage').textContent=d.stages?.memory_candidate_extraction||'—';qs('#chatgptStatusOut').textContent=JSON.stringify(d,null,2);return d}catch(e){const state=qs('#chatgptServerState');if(state){state.textContent='ERREUR';state.className='tag bad'}qs('#chatgptServerConversations').textContent='—';qs('#chatgptServerMessages').textContent='—';qs('#chatgptServerCandidates').textContent='—';qs('#chatgptServerUnsynced').textContent='—';qs('#chatgptStatusOut').textContent='Suivi import indisponible : '+e.message;return null}}
async function loadShardVaultStatus(){try{const d=await jfetch('/api/gen2/shardvault/status');const state=qs('#shardVaultState');if(state){state.textContent=d.ok?'ACTIF':(d.status||'À VÉRIFIER');state.className='tag '+(d.ok?'good':'warn')}const selected=Array.isArray(d.selected_endpoints)?d.selected_endpoints:[];qs('#shardVaultOut').textContent='Sauvegardes réelles : '+selected.length+' cible(s) mémoire · code GitHub '+(d.code_survival?.repository?'identifié':'à vérifier')+' · copie R2 '+(d.code_survival?.status||'—')+'\\nExploration Internet : ouvre ShardVault pour lancer une recherche complète.\\n'+JSON.stringify({status:d.status,storage_mode:d.storage_mode,selected_endpoints:selected,code_survival:d.code_survival,health:d.health,scheme:d.scheme},null,2);return d}catch(e){const state=qs('#shardVaultState');if(state){state.textContent='ERREUR';state.className='tag bad'}qs('#shardVaultOut').textContent='ShardVault indisponible : '+e.message;return null}}
async function forceShardVaultSnapshot(){const btn=qs('#shardVaultSnapshot');btn.disabled=true;btn.textContent='Sauvegarde en cours…';qs('#shardVaultOut').textContent='Création immédiate du snapshot mémoire + copie du code…';try{const d=await jfetch('/api/gen2/shardvault/snapshot',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});qs('#shardVaultOut').textContent='Sauvegarde créée · '+(d.snapshot_id||'snapshot')+' · '+(d.shards==null?'nombre de fragments indisponible':Number(d.shards).toLocaleString('fr-FR')+' fragments')+'\\n'+JSON.stringify(d,null,2);await loadShardVaultStatus();return d}catch(e){qs('#shardVaultOut').textContent='Sauvegarde échouée : '+e.message;throw e}finally{btn.disabled=false;btn.textContent='Sauvegarder maintenant'}}
async function loadMemory(){try{const d=await jfetch('/api/memory/status');qs('#memoryOut').textContent=JSON.stringify(d,null,2);const memoryCount=qs('#memoryCount');if(memoryCount)memoryCount.textContent=d.memory_count??d.count??d.total??'—'}catch(e){qs('#memoryOut').textContent='État mémoire indisponible : '+e.message}loadChatGPTImportStatus().catch(()=>{});loadShardVaultStatus().catch(()=>{})}
qs('#memoryRefresh').onclick=loadMemory;
qs('#shardVaultSnapshot').onclick=()=>forceShardVaultSnapshot().catch(()=>{});
qs('#shardVaultRefresh').onclick=loadShardVaultStatus;
qs('#chatgptStatusRefresh').onclick=loadChatGPTImportStatus;
qs('#chatgptImport').onclick=async()=>{const f=qs('#chatgptFile').files[0];if(!f){qs('#chatgptOut').textContent='Choisis un fichier JSON.';return}qs('#chatgptImport').disabled=true;try{const text=await f.text();const payload=JSON.parse(text);const d=await jfetch('/api/gen2/import/chatgpt-archive',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({archive:payload,preview:false})});qs('#chatgptOut').textContent=JSON.stringify(d,null,2);await loadChatGPTImportStatus()}catch(e){qs('#chatgptOut').textContent='Erreur : '+e.message}finally{qs('#chatgptImport').disabled=false}};
let autonomyControl={paused:true,max_autonomy:false,status:'UNKNOWN'};
function renderAutonomy(state){
  const control=state?.control||state||{};
  autonomyControl={...autonomyControl,...control};
  const active=autonomyControl.paused!==true&&autonomyControl.max_autonomy===true;
  const badge=qs('#autonomyBadge');
  badge.textContent=active?'ACTIVE':autonomyControl.paused===true?'PAUSE':'SUPERVISÉE';
  badge.className='tag '+(active?'good':'warn');
  qs('#autonomyMode').textContent=active?'Autonomie maximale':autonomyControl.paused===true?'En pause':'Autonomie supervisée';
  const next=state?.next;
  qs('#autonomyNext').textContent=next?.id?(next.id+' · '+next.title):'Sélection automatique par la roadmap';
  const max=qs('#melFullMax');if(max){max.classList.toggle('max-active',autonomyControl.max_autonomy===true);max.textContent=autonomyControl.max_autonomy===true?'MAX ACTIF':'MAX 100%';}
  const pause=qs('#melFullStop');if(pause)pause.textContent=autonomyControl.paused===true?'Reprendre MEL':'Mettre MEL en pause';
}
async function loadAutonomy(){
  try{
    const d=await jfetch('/api/gen2/autonomy/state');
    renderAutonomy(d);
    qs('#autonomyNote').textContent=d?.readiness?.blockers?.length
      ? 'Boucle disponible · '+d.readiness.blockers.length+' blocker(s) contournés si externes.'
      : 'Boucle prête · candidate uniquement · production verrouillée.';
    return d;
  }catch(e){
    try{const d=await jfetch('/api/gen2/autonomy/control');renderAutonomy(d);return d}
    catch{qs('#autonomyNote').textContent='État autonomie indisponible : '+e.message;return null}
  }
}
async function autonomyAction(button,url,body,label,feedback=qs('#mobileAutonomyFeedback')){
  if(!button)return null;
  const previous=button.textContent;
  button.disabled=true;button.textContent='…';if(feedback)feedback.textContent=label+'…';
  try{
    const d=await jfetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});
    renderAutonomy(d?.state||d);await loadAutonomy();if(feedback)feedback.textContent=label+' : OK';return d;
  }catch(e){if(feedback)feedback.textContent=label+' : '+e.message;throw e}
  finally{button.disabled=false;if(!['melFullMax','melFullStop'].includes(button.id))button.textContent=previous;renderAutonomy(autonomyControl)}
}
function activityMarkup(state){
  const activityKnown=Array.isArray(state?.recent_activity);
  const items=activityKnown?state.recent_activity.slice(0,8):[];
  const counts=state?.counts&&typeof state.counts==='object'?state.counts:null;
  const metric=value=>{const n=finiteMetric(value);return n===null?'—':String(n)};
  const summary='<div><b>Actifs :</b> '+metric(counts?.active)+' · <b>Terminés :</b> '+metric(counts?.completed)+' · <b>Échecs :</b> '+metric(counts?.failed)+'</div>';
  const rows=!activityKnown
    ?'<div style="margin-top:7px">Historique d’activité non chargé.</div>'
    :items.length
      ?items.map(x=>'<div style="margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,.06)"><b>'+esc(x.roadmap_id||x.id||'activité')+'</b> · '+esc(x.status||'—')+'</div>').join('')
      :'<div style="margin-top:7px">Aucune activité récente observée.</div>';
  return summary+rows;
}
async function showActivity(panel){
  if(!panel)return;panel.textContent='Chargement de l’activité…';
  try{const d=await jfetch('/api/gen2/autonomy/state');panel.innerHTML=activityMarkup(d)}catch(e){panel.textContent='Activité indisponible : '+e.message}
}
const mobileMax=qs('#mobileMaxAutonomy'),mobilePause=qs('#mobilePauseAutonomy'),mobileStart=qs('#mobileStartCycle'),mobileResume=qs('#mobileResumeAutonomy'),mobileActivity=qs('#mobileActivityAutonomy');
if(mobileMax)mobileMax.onclick=()=>autonomyAction(mobileMax,'/api/gen2/autonomy/max',{enabled:autonomyControl.max_autonomy!==true},'MAX 100%').catch(()=>{});
if(mobilePause)mobilePause.onclick=()=>autonomyAction(mobilePause,'/api/gen2/autonomy/pause',{reason:'owner-mobile-standby'},'Mise en pause').catch(()=>{});
if(mobileStart)mobileStart.onclick=()=>autonomyAction(mobileStart,'/api/gen2/autonomy/tick',{},'Cycle MEL').catch(()=>{});
if(mobileResume)mobileResume.onclick=()=>autonomyAction(mobileResume,'/api/gen2/autonomy/resume',{},'Reprise de MEL').catch(()=>{});
if(mobileActivity)mobileActivity.onclick=async()=>{const panel=qs('#mobileActivityPanel');if(!panel)return;if(!panel.hidden){panel.hidden=true;return}panel.hidden=false;await showActivity(panel)};
const topMax=qs('#melFullMax'),topCycle=qs('#melFullCycle'),topPause=qs('#melFullStop'),topActivity=qs('#melFullActivity'),desktopPanel=qs('#desktopActivityPanel');
if(topMax)topMax.onclick=()=>autonomyAction(topMax,'/api/gen2/autonomy/max',{enabled:autonomyControl.max_autonomy!==true},'Autonomie maximale',null).catch(()=>{});
if(topCycle)topCycle.onclick=()=>autonomyAction(topCycle,'/api/gen2/autonomy/tick',{},'Cycle MEL',null).catch(()=>{});
if(topPause)topPause.onclick=()=>autonomyAction(topPause,autonomyControl.paused===true?'/api/gen2/autonomy/resume':'/api/gen2/autonomy/pause',autonomyControl.paused===true?{}:{reason:'owner-control-center-pause'},autonomyControl.paused===true?'Reprise de MEL':'Mise en pause',null).catch(()=>{});
if(topActivity)topActivity.onclick=async()=>{if(!desktopPanel)return;desktopPanel.hidden=!desktopPanel.hidden;if(!desktopPanel.hidden)await showActivity(qs('#desktopActivityBody'))};
qs('#desktopActivityClose').onclick=()=>{if(desktopPanel)desktopPanel.hidden=true};
async function loadWork(){try{const r=await fetch('/api/work/health');const d=await r.json().catch(()=>({}));qs('#bridgeState').textContent=r.ok?'Disponible':'Indisponible';qs('#workOut').textContent=JSON.stringify(d,null,2)}catch(e){qs('#bridgeState').textContent='Indisponible';qs('#workOut').textContent=e.message}}
qs('#workRefresh').onclick=loadWork;qs('#workCreate').onclick=async()=>{const goal=qs('#workGoal').value.trim();if(!goal)return;qs('#workCreate').disabled=true;try{const d=await jfetch('/api/work/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({goal,mode:'prepare'})});qs('#workOut').textContent=JSON.stringify(d,null,2)}catch(e){qs('#workOut').textContent='Erreur : '+e.message}finally{qs('#workCreate').disabled=false}};
function setLoraTag(id,text,kind){const el=qs(id);if(!el)return;el.textContent=text;el.className='tag '+kind}
async function loadFreeLoraStatus(){
  const btn=qs('#freeLoraRefresh');if(btn)btn.disabled=true;
  try{
    const d=await jfetch('/api/learning/lora/free-status');
    const bundleKnown=Boolean(d?.bundle&&typeof d.bundle==='object');
    const files=bundleKnown&&Array.isArray(d.bundle.files)?d.bundle.files:[];
    const bundleReady=bundleKnown?d.bundle.ready===true:null;
    const training=bundleKnown&&d.bundle.training&&typeof d.bundle.training==='object'?d.bundle.training:null;
    const dataset=bundleKnown&&d.bundle.dataset&&typeof d.bundle.dataset==='object'?d.bundle.dataset:null;
    const registry=bundleKnown&&d.bundle.adapter_registry&&typeof d.bundle.adapter_registry==='object'?d.bundle.adapter_registry:null;
    const wfKnown=Boolean(d?.workflow&&typeof d.workflow==='object');
    const wf=wfKnown?d.workflow:{};
    const trainWfKnown=Boolean(d?.training_workflow&&typeof d.training_workflow==='object');
    const trainWf=trainWfKnown?d.training_workflow:{};
    const checkpoint=d?.checkpoint&&typeof d.checkpoint==='object'?d.checkpoint:null;
    const trainStatus=trainWfKnown&&trainWf.status!=null?String(trainWf.status).toUpperCase():'UNKNOWN';
    const trainConclusion=String(trainWf.conclusion||'').toUpperCase();
    const trainActive=trainStatus==='IN_PROGRESS'||trainStatus==='QUEUED'||trainStatus==='PENDING';
    const checkpointCycle=checkpoint?.cycle!=null?Number(checkpoint.cycle):null;
    const visibleCycle=trainActive?(checkpointCycle==null?0:checkpointCycle+1):checkpointCycle;
    qs('#freeKaggleState').textContent=trainStatus==='UNKNOWN'?'—':(trainActive?'RUNNING':(trainStatus==='COMPLETED'?(trainConclusion||'COMPLETED'):trainStatus));
    qs('#freeKaggleCycle').textContent=visibleCycle==null?'—':'C'+String(visibleCycle).padStart(3,'0');
    const wfStatus=wfKnown&&wf.status!=null?String(wf.status).toUpperCase():'UNKNOWN';
    const wfConclusion=wfKnown?String(wf.conclusion||'').toUpperCase():'';
    const loraKnown=Boolean(d?.learning?.lora_status&&typeof d.learning.lora_status==='object'&&d.learning.lora_status.state!=null);
    const lora=loraKnown?d.learning.lora_status:{};
    const loraState=loraKnown?String(lora.state).toUpperCase():'UNKNOWN';
    const lessonRaw=d?.learning?.corrections_available_for_training;
    const lessonCount=lessonRaw==null||!Number.isFinite(Number(lessonRaw))?null:Math.max(0,Number(lessonRaw));
    qs('#freeLoraLessons').textContent=lessonCount==null?'—/50':lessonCount+'/50'+(lessonCount>=50?' · PRÊT':'');
    qs('#freeTrainingExamples').textContent=training?.examples!=null?Number(training.examples).toLocaleString('fr-FR'):(dataset?.examples!=null?Number(dataset.examples).toLocaleString('fr-FR'):'—');
    qs('#freeCheckpointStage').textContent=checkpoint?.tag?String(checkpoint.tag):(training?.stage?String(training.stage).toUpperCase():(bundleKnown?'AUCUN CHECKPOINT':'—'));
    qs('#freeCompatibleLoras').textContent=registry?.compatible_count!=null?Number(registry.compatible_count).toLocaleString('fr-FR'):'—';
    const benchKnown=Boolean(d?.learning?.benchmark_status&&typeof d.learning.benchmark_status==='object');
    const bench=benchKnown?d.learning.benchmark_status:{};
    qs('#freeBenchmarkState').textContent=!benchKnown?'—':(bench.status!=null?String(bench.status):'—')+(bench.latest_score!=null?' · '+Math.round(Number(bench.latest_score)*1000)/10+'%':'');
    const impactKnown=Boolean(d?.learning?.impact&&typeof d.learning.impact==='object');
    const impact=impactKnown?d.learning.impact:{}, cand=impact.candidate||{}, delta=impact.delta||{};
    const pctImpact=v=>v==null||!Number.isFinite(Number(v))?'—':(Math.round(Number(v)*1000)/10)+'%';
    qs('#freeImpactStage').textContent=impact.next_stage||'—';
    qs('#freeImpactTechnical').textContent=pctImpact(cand.technical_depth);
    qs('#freeImpactSensitive').textContent=pctImpact(cand.sensitive_answer_rate);
    qs('#freeImpactRefusal').textContent=pctImpact(cand.over_refusal_rate);
    qs('#freeImpactBoundary').textContent=pctImpact(cand.targeted_boundary);
    qs('#freeImpactAgentic').textContent=pctImpact(cand.agentic_execution);
    qs('#freeImpactDelta').textContent=delta.overall==null?'—':((Number(delta.overall)>=0?'+':'')+pctImpact(delta.overall));
    const agenticKnown=impact.next_stage!=null&&String(impact.next_stage).trim()!=='';
    const agenticReady=agenticKnown&&String(impact.next_stage)==='AGENTIC_READY';
    setLoraTag('#freeAgenticState',!agenticKnown?'Indisponible':(agenticReady?'AGENTIC_READY':'VERROUILLÉ'),agenticReady?'good':'warn');
    const agenticLink=qs('#freeAgenticColab');
    if(agenticLink){
      if(d.agentic_colab_url)agenticLink.href=d.agentic_colab_url;
      agenticLink.setAttribute('aria-disabled',agenticReady?'false':'true');
      agenticLink.style.pointerEvents=agenticReady?'auto':'none';
      agenticLink.style.opacity=agenticReady?'1':'.45';
    }

    if(trainStatus==='UNKNOWN')setLoraTag('#freeGpuState','Indisponible','warn');
    else if(trainActive)setLoraTag('#freeGpuState','RUNNING','good');
    else if(trainStatus==='COMPLETED'&&trainConclusion==='SUCCESS')setLoraTag('#freeGpuState','CYCLE TERMINÉ','good');
    else if(trainStatus==='COMPLETED')setLoraTag('#freeGpuState','À RELANCER','warn');
    else if(trainStatus==='NEVER_RUN')setLoraTag('#freeGpuState','À lancer','warn');
    else setLoraTag('#freeGpuState',trainStatus,'warn');
    setLoraTag('#freeHfState',checkpoint?.tag?'CHECKPOINT '+('C'+String(checkpointCycle).padStart(3,'0')):(bundleKnown?(bundleReady?'Bundle HF prêt':'En attente'):'Indisponible'),checkpoint?.tag||bundleReady===true?'good':'warn');

    let wfKind='warn',wfLabel=wfStatus==='NEVER_RUN'?'Jamais lancé':'Indisponible';
    if(wfStatus==='IN_PROGRESS'||wfStatus==='QUEUED'){wfLabel='En cours';wfKind='warn'}
    else if(wfStatus==='COMPLETED'&&wfConclusion==='SUCCESS'){wfLabel='Succès';wfKind='good'}
    else if(wfStatus==='COMPLETED'){wfLabel='Échec / annulé';wfKind='bad'}
    setLoraTag('#freeWorkflowState',wfLabel,wfKind);

    let runtimeKind='warn',runtimeLabel=loraState==='UNKNOWN'?'Indisponible':loraState,runtimeDetail=loraState==='UNKNOWN'?'État runtime indisponible.':(lora.reason||'État runtime fourni sans détail.');
    if(loraState==='ACTIVE'){runtimeKind='good';runtimeLabel='ACTIVE'}
    else if(loraState==='EVALUATED'){runtimeKind='warn';runtimeLabel='BENCHMARKÉ'}
    else if(loraState==='READY'){runtimeKind='warn';runtimeLabel='PRÊT'}
    else if(loraState==='TRAINING'){runtimeKind='warn';runtimeLabel='ENTRAÎNEMENT'}
    setLoraTag('#freeRuntimeState',runtimeLabel,runtimeKind);
    qs('#freeRuntimeDetail').textContent=runtimeDetail;

    qs('#freeLoraFiles').innerHTML=files.length?files.map(x=>(x.available?'✓ ':'○ ')+esc(x.name)).join('<br>'):(bundleKnown?'Aucun fichier détecté.':'État fichiers indisponible.');
    qs('#freeLoraWorkflowDetail').textContent=JSON.stringify({
      training:trainWf.id?{id:trainWf.id,status:trainWf.status,conclusion:trainWf.conclusion,head_sha:trainWf.head_sha,updated_at:trainWf.updated_at}:null,
      checkpoint:checkpoint,
      promotion:wf.id?{id:wf.id,status:wf.status,conclusion:wf.conclusion,head_sha:wf.head_sha,updated_at:wf.updated_at}:null
    },null,2);
    if(d.kaggle_url)qs('#freeLoraColab').href=d.kaggle_url;
    if(checkpoint?.html_url)qs('#freeLoraHf').href=checkpoint.html_url;else if(d.hf_url)qs('#freeLoraHf').href=d.hf_url;
    if(d.workflow_url)qs('#freeLoraWorkflow').href=d.workflow_url;

    const stageKnown=trainWfKnown||bundleKnown||wfKnown||loraKnown||Boolean(checkpoint);
    let stage=0;
    if(trainActive)stage=1;
    if(checkpoint?.tag||bundleReady===true)stage=2;
    if(wfStatus==='IN_PROGRESS'||wfStatus==='QUEUED')stage=Math.max(stage,2.5);
    if(wfStatus==='COMPLETED'&&wfConclusion==='SUCCESS')stage=Math.max(stage,3);
    if(loraState==='ACTIVE')stage=4;
    else if(loraState==='EVALUATED')stage=Math.max(stage,3);
    const percent=stageKnown?Math.round(stage/4*100):null;
    qs('#freeLoraBar').style.width=(percent==null?0:percent)+'%';
    qs('#freeLoraProgressPercent').textContent=percent==null?'—':percent+'%';
    qs('#freeLoraProgressText').textContent=percent==null?'Statut indisponible':percent===100?'Checkpoint UNCENSORED actif dans le preview':trainActive?'GPU Kaggle T4 en cours · cycle '+(visibleCycle==null?'?':visibleCycle):(checkpoint?.tag?'Checkpoint UNCENSORED conservé · benchmark/gate à suivre':bundleReady===true?'Bundle UNCENSORED prêt · promotion candidate à lancer':bundleKnown?'En attente du prochain cycle Kaggle gratuit':'Statut indisponible');
  }catch(e){
    setLoraTag('#freeHfState','Indisponible','bad');
    setLoraTag('#freeWorkflowState','Indisponible','bad');
    setLoraTag('#freeRuntimeState','Indisponible','bad');
    setLoraTag('#freeAgenticState','Indisponible','bad');
    qs('#freeKaggleState').textContent='—';
    qs('#freeKaggleCycle').textContent='—';
    qs('#freeCheckpointStage').textContent='—';
    qs('#freeBenchmarkState').textContent='—';
    qs('#freeRuntimeDetail').textContent='État runtime indisponible.';
    qs('#freeLoraWorkflowDetail').textContent='Erreur : '+e.message;
    qs('#freeLoraProgressText').textContent='Statut indisponible';
  }finally{if(btn)btn.disabled=false}
}
qs('#freeLoraRefresh').onclick=()=>{panelLoadedAt.delete('lora');loadFreeLoraStatus().then(()=>panelLoadedAt.set('lora',Date.now())).catch(()=>{})};

let computerCache={devices:[],selected_id:null,commands:[]};
function selectedComputer(){const id=qs('#computerSelect')?.value||computerCache.selected_id;return computerCache.devices.find(x=>x.id===id)||computerCache.devices[0]||null}
function fmtSeen(ts){if(!ts)return'—';const d=Math.max(0,Date.now()-Number(ts));if(d<15000)return'à l’instant';if(d<60000)return Math.round(d/1000)+' s';if(d<3600000)return Math.round(d/60000)+' min';return new Date(Number(ts)).toLocaleString('fr-FR')}
function renderComputer(d){
  computerCache=d||computerCache;
  const devices=computerCache.devices||[],sel=qs('#computerSelect'),wanted=computerCache.selected_id||sel?.value||devices[0]?.id||'';
  if(sel){sel.innerHTML=devices.length?devices.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name||x.id)+(x.online?' · en ligne':' · hors ligne')+'</option>').join(''):'<option value="">Aucun ordinateur</option>';if(wanted&&devices.some(x=>x.id===wanted))sel.value=wanted}
  const pc=selectedComputer(),state=qs('#computerState');
  if(!pc){state.textContent='NON INSTALLÉ';state.className='tag warn';qs('#computerLastSeen').textContent='—';qs('#computerActiveWindow').textContent='—';qs('#computerOut').textContent='Télécharge puis lance l’installation Windows.';return}
  state.textContent=pc.halted?'ARRÊTÉ':pc.online?'EN LIGNE':'HORS LIGNE';state.className='tag '+(pc.halted?'bad':pc.online?'good':'warn');
  qs('#computerLastSeen').textContent=fmtSeen(pc.last_seen_at);qs('#computerActiveWindow').textContent=pc.metadata?.active_window||'—';
  qs('#computerOut').textContent=JSON.stringify({ordinateur:pc,commandes:(computerCache.commands||[]).slice(0,12)},null,2);
  const latest=(computerCache.commands||[]).find(c=>c?.result?.outputs?.some(o=>o?.view_url));
  const output=latest?.result?.outputs?.find(o=>o?.view_url);
  if(output?.view_url){const img=qs('#computerScreen');img.src=output.view_url+'&v='+Date.now();img.style.display='block';qs('#computerScreenState').textContent='CAPTURE DISPONIBLE';qs('#computerScreenState').className='tag good'}
}
async function loadComputer(){try{const id=qs('#computerSelect')?.value||'';const d=await jfetch('/api/computer/v1/status'+(id?'?computer_id='+encodeURIComponent(id):''));renderComputer(d);return d}catch(e){qs('#computerState').textContent='INDISPONIBLE';qs('#computerState').className='tag bad';qs('#computerOut').textContent='Erreur : '+e.message;return null}}
async function computerCommand(steps,approveSensitive=false){const pc=selectedComputer();if(!pc)throw Error('Aucun ordinateur appairé');const d=await jfetch('/api/computer/v1/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({computer_id:pc.id,steps,approve_sensitive:approveSensitive})});qs('#computerOut').textContent=JSON.stringify(d,null,2);await new Promise(r=>setTimeout(r,1500));await loadComputer();return d}
qs('#computerRefresh').onclick=()=>loadComputer();
qs('#computerSelect').onchange=()=>loadComputer();
qs('#computerHalt').onclick=async()=>{const pc=selectedComputer();if(!pc)return;await jfetch('/api/computer/v1/halt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({computer_id:pc.id})});await loadComputer()};
qs('#computerResume').onclick=async()=>{const pc=selectedComputer();if(!pc)return;await jfetch('/api/computer/v1/resume',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({computer_id:pc.id})});await loadComputer()};
qs('#computerShot').onclick=()=>computerCommand([{action:'screen.capture'}]).catch(e=>qs('#computerOut').textContent='Erreur : '+e.message);
qsa('[data-pc-app]').forEach(b=>b.onclick=()=>computerCommand([{action:'app.open',app:b.dataset.pcApp}],true).catch(e=>qs('#computerOut').textContent='Erreur : '+e.message));
qs('#computerType').onclick=()=>{const t=qs('#computerText').value;if(!t)return;computerCommand([{action:'keyboard.type',text:t}],true).catch(e=>qs('#computerOut').textContent='Erreur : '+e.message)};
qsa('[data-pc-key]').forEach(b=>b.onclick=()=>computerCommand([{action:'keyboard.press',key:b.dataset.pcKey}]).catch(e=>qs('#computerOut').textContent='Erreur : '+e.message));
qs('#computerScrollUp').onclick=()=>computerCommand([{action:'pointer.scroll',delta_y:240}]).catch(e=>qs('#computerOut').textContent='Erreur : '+e.message);
qs('#computerScrollDown').onclick=()=>computerCommand([{action:'pointer.scroll',delta_y:-240}]).catch(e=>qs('#computerOut').textContent='Erreur : '+e.message);
qs('#computerScreen').onclick=async e=>{const pc=selectedComputer(),screen=pc?.metadata?.screen;if(!pc||!screen)return;const r=e.currentTarget.getBoundingClientRect();const x=Math.round((e.clientX-r.left)/r.width*Number(screen.width||0)+Number(screen.x||0));const y=Math.round((e.clientY-r.top)/r.height*Number(screen.height||0)+Number(screen.y||0));try{await computerCommand([{action:'cursor.move',x,y},{action:'pointer.click'}]);setTimeout(()=>computerCommand([{action:'screen.capture'}]).catch(()=>{}),700)}catch(err){qs('#computerOut').textContent='Erreur : '+err.message}};

async function loadTerminal(){
  try{
    const d=await jfetch('/api/device/v1/status');
    const devices=Array.isArray(d.devices)?d.devices:[];
    const state=qs('#terminalState');
    state.textContent=devices.some(x=>x.online)?'EN LIGNE':devices.length?'APPAIRÉ':'EN ATTENTE';
    state.className='tag '+(devices.some(x=>x.online)?'good':'warn');
    qs('#terminalDevices').innerHTML=devices.length?devices.map(x=>'<div class="skill"><div class="skill-head"><div><strong>'+esc(x.status?.name||x.device_id)+'</strong><div class="muted">'+esc(x.device_id)+' · '+esc(x.model)+'</div></div><span class="tag '+(x.online?'good':'warn')+'">'+(x.online?'EN LIGNE':'HORS LIGNE')+'</span></div><div class="status-row"><span>Firmware</span><strong>'+esc(x.status?.firmware||'—')+'</strong></div><div class="status-row"><span>Protocole</span><strong>'+esc(x.status?.protocol_version||'—')+'</strong></div><div class="status-row"><span>Batterie</span><strong>'+(x.status?.battery==null?'—':esc(x.status.battery)+'%')+'</strong></div><div class="status-row"><span>Wi-Fi RSSI</span><strong>'+(x.status?.wifi_rssi==null?'—':esc(x.status.wifi_rssi)+' dBm')+'</strong></div><div class="status-row"><span>Dernier contact</span><strong>'+esc(fmtSeen(x.last_seen_at))+'</strong></div></div>').join(''):'<div class="muted">Aucun terminal appairé.</div>';
    qs('#terminalOut').textContent=JSON.stringify(d,null,2);
    return d;
  }catch(e){
    qs('#terminalState').textContent='INDISPONIBLE';qs('#terminalState').className='tag bad';
    qs('#terminalDevices').innerHTML='<div class="muted">État des terminaux indisponible.</div>';
    qs('#terminalOut').textContent='Erreur : '+e.message;return null;
  }
}
qs('#terminalPairCreate').onclick=async()=>{
  const b=qs('#terminalPairCreate');b.disabled=true;
  try{
    const d=await jfetch('/api/device/v1/pair-code',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    qs('#terminalPairCode').textContent=String(d.code||'—').match(/.{1,4}/g)?.join(' ')||String(d.code||'—');
    qs('#terminalPairNote').textContent='Code valable jusqu’à '+new Date(Number(d.expires_at)).toLocaleTimeString('fr-FR')+'. Saisis-le directement sur l’écran tactile de MINI via l’icône de liaison.';
  }catch(e){qs('#terminalOut').textContent='Erreur : '+e.message}
  finally{b.disabled=false}
};
qs('#terminalRefresh').onclick=()=>loadTerminal();

async function boot(){qs('#codeMetric').textContent='MANUEL';qs('#codeSummary').textContent='Test à la demande pour accélérer l’ouverture.';const tasks=await Promise.allSettled([loadDashboardSummary(),loadAutonomy()]);const dashboard=tasks[0];if(dashboard.status!=='fulfilled'){renderCapabilityOverview(null);renderRoadmapSummary(null);qs('#globalState').textContent='Diagnostic requis';qs('#globalDot').className='dot bad';qs('#healthRows').textContent='Résumé système indisponible.'}}

function toggleLearningDetails(){
  const chip=qs('#learningChip'),details=qs('#learningDetails'),arrow=qs('#learnArrow');
  if(!chip||!details)return;
  const open=chip.getAttribute('aria-expanded')==='true';
  chip.setAttribute('aria-expanded',String(!open));
  details.style.display=open?'none':'block';
  if(arrow)arrow.textContent=open?'⌄':'⌃';
}
async function loadLearningProgress(){
  const level=qs('#learnLevel'),rank=qs('#learnRank'),bar=qs('#learnBar'),xp=qs('#learnXp'),meta=qs('#learnMeta'),chip=qs('#learningChip');
  if(!level||!rank||!bar||!xp||!meta)return false;
  const fmtCount=value=>{const n=finiteMetric(value);return n===null?'—':n.toLocaleString('fr-FR')};
  const fmtPercent=value=>{const n=finiteMetric(value);return n===null?null:Math.max(0,Math.min(100,n))};
  try{
    const d=await jfetch('/api/learning/progress'),e=d?.evidence&&typeof d.evidence==='object'?d.evidence:null;
    const p=fmtPercent(d?.level_progress_percent);
    level.textContent=d?.level??'—';
    rank.textContent=(d?.rank||'mesure indisponible')+(p===null?'':' · '+p.toFixed(0)+'%');
    bar.style.width=p===null?'0%':p+'%';
    bar.setAttribute('aria-valuetext',p===null?'mesure indisponible':p.toFixed(0)+'%');
    xp.textContent=fmtCount(d?.xp)+' XP';
    const bench=e?.benchmark_latest_score==null?'bench —':('bench '+(Math.round(Number(e.benchmark_latest_score)*1000)/10)+'%');
    const loraState=String(d?.lora_status?.state||'').toUpperCase();
    const lora=loraState==='ACTIVE'?'LoRA actif':loraState==='TECHNICALLY_VALIDATED'?'LoRA validé techniquement':loraState==='EVALUATED'?'LoRA benchmarké':loraState==='READY'?'LoRA prêt':loraState==='TRAINING'?'LoRA en entraînement':loraState==='BLOCKED'?'LoRA bloqué':'LoRA état indisponible';
    meta.textContent=fmtCount(e?.corrections_validated)+' corr. · '+bench+' · '+lora;
    const put=(id,v)=>{const n=qs(id);if(n)n.textContent=v;};
    put('#learnNext',fmtCount(d?.xp_to_next_level)+' XP');
    put('#learnCorrections',fmtCount(e?.corrections_validated)+' validées / '+fmtCount(e?.corrections_recorded));
    put('#learnTraining',fmtCount(e?.corrections_available_for_training));
    const base=e?.benchmark_baseline_score==null?'—':(Math.round(Number(e.benchmark_baseline_score)*1000)/10)+'%';
    const latest=e?.benchmark_latest_score==null?'—':(Math.round(Number(e.benchmark_latest_score)*1000)/10)+'%';
    const gain=e?.benchmark_gain==null?'':(' · Δ '+(Number(e.benchmark_gain)>=0?'+':'')+(Math.round(Number(e.benchmark_gain)*1000)/10)+' pts');
    put('#learnBenchmark',base+' → '+latest+gain);
    put('#learnTrials',fmtCount(e?.inference_trials));
    put('#learnErrors',fmtCount(e?.repeated_taught_errors));
    const adapterCount=finiteMetric(e?.active_adapter_count),adapters=adapterCount===null?'—':adapterCount.toLocaleString('fr-FR');
    put('#learnWeights',e?.neural_weights_changed===true
      ?('modifiés · '+adapters+' adaptateur(s) actif(s)')
      :e?.neural_weights_changed===false
        ?(adapterCount===0?'inchangés · aucun adaptateur actif en runtime':adapterCount===null?'inchangés · état des adaptateurs indisponible':'inchangés · '+adapters+' adaptateur(s) déclaré(s) actif(s)')
        :'état des poids indisponible');
    if(chip)chip.title='Cliquer pour les détails · '+fmtCount(d?.xp)+' XP · roadmap exclue';
    return true;
  }catch(err){
    level.textContent='—';rank.textContent='indisponible';bar.style.width='0%';bar.setAttribute('aria-valuetext','mesure indisponible');xp.textContent='— XP';meta.textContent='mesure indisponible';return false;
  }
}
async function runLearningAction(button,url,busy){
  const state=qs('#melLearningActionState');if(!button)return;button.disabled=true;if(state)state.textContent=busy;
  try{const d=await jfetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(state)state.textContent='Terminé.';await loadLearningProgress();return d}
  catch(e){if(state)state.textContent='Échec : '+e.message;return null}
  finally{button.disabled=false}
}
qs('#melRunBenchmark').onclick=()=>runLearningAction(qs('#melRunBenchmark'),'/api/learning/benchmark/run','Benchmark en cours…');
qs('#melPrepareLora').onclick=()=>runLearningAction(qs('#melPrepareLora'),'/api/learning/lora/prepare','Préparation LoRA…');
const learningChip=qs('#learningChip');
if(learningChip){
  learningChip.addEventListener('click',toggleLearningDetails);
  learningChip.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleLearningDetails();}});
}

loadLearningProgress();
boot();
let canonicalRefreshTimer=setInterval(()=>{
  if(document.hidden)return;
  const active=document.querySelector('.view.active')?.dataset?.panel||'';
  if(active==='roadmap'){roadmapCache=null;loadRoadmap(true).catch(()=>{})}
  const dev=qs('[data-mode-panel="development"]');if(active==='multi'&&dev&&!dev.hidden)loadWork().catch(()=>{});
  if(active==='overview')loadLearningProgress().catch(()=>{});
},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.querySelector('.view.active')?.dataset?.panel==='overview')loadLearningProgress().catch(()=>{})});
window.addEventListener('beforeunload',()=>{if(canonicalRefreshTimer)clearInterval(canonicalRefreshTimer)},{once:true});
</script></body></html>`;
  return new Response(body,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}
