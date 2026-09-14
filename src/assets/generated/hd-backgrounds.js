function data(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function scene({ a, b, glow, accent, motif = '' }) {
  return data(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3840 2160" width="3840" height="2160">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset=".52" stop-color="${b}"/><stop offset="1" stop-color="#020611"/></linearGradient>
    <radialGradient id="halo"><stop stop-color="${glow}" stop-opacity=".72"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${accent}" stop-opacity=".15"/><stop offset="1" stop-color="#02040a" stop-opacity=".88"/></linearGradient>
    <pattern id="grid" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M120 0H0V120" fill="none" stroke="${accent}" stroke-opacity=".12" stroke-width="2"/></pattern>
    <filter id="soft"><feGaussianBlur stdDeviation="34"/></filter>
    <filter id="grain"><feTurbulence baseFrequency=".6" numOctaves="3" seed="8"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .06"/></feComponentTransfer></filter>
  </defs>
  <rect width="3840" height="2160" fill="url(#sky)"/>
  <ellipse cx="3150" cy="380" rx="1050" ry="850" fill="url(#halo)" filter="url(#soft)"/>
  <ellipse cx="520" cy="1780" rx="900" ry="700" fill="url(#halo)" opacity=".42" filter="url(#soft)"/>
  ${motif}
  <path d="M0 1500 C900 1390 1500 1470 1920 1445 C2480 1415 3030 1320 3840 1430 V2160 H0Z" fill="url(#floor)"/>
  <path d="M0 1510 H3840 V2160 H0Z" fill="url(#grid)" opacity=".45"/>
  <rect width="3840" height="2160" filter="url(#grain)" opacity=".34"/>
  <rect width="3840" height="2160" fill="none" stroke="#fff" stroke-opacity=".035" stroke-width="18"/>
</svg>`);
}

const classic = scene({
  a:'#06172d', b:'#0b2545', glow:'#1d9bf0', accent:'#57d5ff',
  motif:`<g fill="none" stroke="#6ddcff" stroke-opacity=".18" stroke-width="5"><path d="M260 420H1180L1440 680H2380L2700 360H3550"/><path d="M420 980H940L1190 730M2750 780H3370L3600 1010"/><circle cx="1190" cy="730" r="18" fill="#6ddcff"/><circle cx="2700" cy="360" r="18" fill="#6ddcff"/></g><g opacity=".22"><rect x="2550" y="490" width="800" height="510" rx="46" fill="#07111f" stroke="#7dd3fc" stroke-width="5"/><path d="M2640 875L2820 680L2990 810L3170 600L3280 720" fill="none" stroke="#a7f3d0" stroke-width="12"/></g>`
});

const crusade = scene({
  a:'#17100b', b:'#3a2616', glow:'#d6a44b', accent:'#c9a86a',
  motif:`<g opacity=".52" fill="#0b0806" stroke="#d9bd84" stroke-opacity=".23" stroke-width="8"><path d="M180 1510V520Q520 120 860 520V1510Z"/><path d="M2920 1510V520Q3260 120 3600 520V1510Z"/><path d="M1320 1510V650Q1920 0 2520 650V1510Z"/></g><g fill="#e4bf72" opacity=".21"><rect x="1880" y="430" width="80" height="560" rx="18"/><rect x="1640" y="650" width="560" height="80" rx="18"/></g><circle cx="1920" cy="520" r="360" fill="url(#halo)" opacity=".35"/>`
});

const religious = scene({
  a:'#120c18', b:'#342034', glow:'#f3b86b', accent:'#d8b57a',
  motif:`<g opacity=".5" fill="#08070a" stroke="#efcf9a" stroke-opacity=".2" stroke-width="9"><path d="M250 1510V640Q650 170 1050 640V1510Z"/><path d="M2790 1510V640Q3190 170 3590 640V1510Z"/><path d="M1260 1510V540Q1920 -80 2580 540V1510Z"/></g><g fill="#ffd98b" opacity=".65"><ellipse cx="1240" cy="1380" rx="22" ry="110"/><ellipse cx="2600" cy="1380" rx="22" ry="110"/><ellipse cx="1510" cy="1430" rx="16" ry="85"/><ellipse cx="2330" cy="1430" rx="16" ry="85"/></g><g fill="#f5d891" opacity=".13"><circle cx="1920" cy="590" r="390"/><circle cx="1920" cy="590" r="245"/></g>`
});

const granada = scene({
  a:'#15120f', b:'#504430', glow:'#f3d99c', accent:'#ddc693',
  motif:`<g fill="#0c0b0a" stroke="#f8e7bd" stroke-opacity=".26" stroke-width="8" opacity=".58"><path d="M100 1510V420H540V1510M780 1510V420H1220V1510M2620 1510V420H3060V1510M3300 1510V420H3740V1510"/><path d="M1280 1510V570Q1920 -10 2560 570V1510Z"/></g><g fill="none" stroke="#edcf88" stroke-opacity=".2" stroke-width="5"><path d="M1480 660L1920 340L2360 660L1920 980Z"/><path d="M1580 660L1920 430L2260 660L1920 890Z"/></g>`
});

const aviation = scene({
  a:'#081118', b:'#182535', glow:'#8fc7dd', accent:'#7da8b8',
  motif:`<g fill="#03070a" stroke="#a6c9d7" stroke-opacity=".25" stroke-width="10" opacity=".78"><path d="M0 1500L610 360L1110 1260H2730L3230 360L3840 1500Z"/><circle cx="1920" cy="1160" r="360"/><circle cx="1060" cy="1320" r="210"/><circle cx="2780" cy="1320" r="210"/></g><g fill="none" stroke="#c5e7f2" stroke-opacity=".35" stroke-width="12"><path d="M1920 800V1520M1560 1160H2280"/><path d="M970 1320h180M1060 1230v180M2690 1320h180M2780 1230v180"/></g>`
});

const paladin = scene({
  a:'#08141e', b:'#24394b', glow:'#e9f6ff', accent:'#d8c487',
  motif:`<g fill="#071019" stroke="#f8f0d2" stroke-opacity=".23" stroke-width="9" opacity=".62"><path d="M180 1510V610Q520 210 860 610V1510Z"/><path d="M2980 1510V610Q3320 210 3660 610V1510Z"/><path d="M1060 1510V520Q1920 -120 2780 520V1510Z"/></g><g fill="#fff5c7" opacity=".16"><path d="M1920 240L2070 690L1920 1030L1770 690Z"/><circle cx="1920" cy="650" r="420"/></g><path d="M1920 390L2030 720L1920 970L1810 720Z" fill="#f9e7a7" opacity=".24"/>`
});

const amazon = scene({
  a:'#11111e', b:'#302140', glow:'#a376ff', accent:'#d9a24d',
  motif:`<g fill="#090812" stroke="#dcb46e" stroke-opacity=".24" stroke-width="8" opacity=".7"><path d="M0 1510L420 760L700 900L1020 550L1320 1510Z"/><path d="M2540 1510L2820 690L3090 850L3420 520L3840 1510Z"/><path d="M1480 1510V920H1620V710H1770V1010H2080V760H2230V940H2400V1510Z"/></g><path d="M2970 250L2700 720H2920L2630 1210" fill="none" stroke="#e9d5ff" stroke-width="24" stroke-opacity=".72"/><path d="M780 310L610 620H760L560 980" fill="none" stroke="#fef3c7" stroke-width="15" stroke-opacity=".48"/>`
});

const control = scene({
  a:'#04111f', b:'#09263b', glow:'#21c7d9', accent:'#5eead4',
  motif:`<g opacity=".36"><path d="M380 1470V520H1260V1470M2580 1470V520H3460V1470" fill="#030913" stroke="#67e8f9" stroke-opacity=".32" stroke-width="7"/><rect x="520" y="680" width="600" height="440" rx="42" fill="#0a1b2a" stroke="#60a5fa" stroke-width="6"/><rect x="2720" y="680" width="600" height="440" rx="42" fill="#0a1b2a" stroke="#60a5fa" stroke-width="6"/><circle cx="1920" cy="800" r="430" fill="none" stroke="#5eead4" stroke-opacity=".28" stroke-width="10"/><circle cx="1920" cy="800" r="260" fill="none" stroke="#60a5fa" stroke-opacity=".23" stroke-width="6"/><path d="M1500 800H2340M1920 380V1220" stroke="#a5f3fc" stroke-opacity=".18" stroke-width="5"/></g>`
});

export const HD_BACKGROUNDS = Object.freeze({ classic, crusade, religious, granada, aviation, paladin, amazon, control });
export default HD_BACKGROUNDS;
