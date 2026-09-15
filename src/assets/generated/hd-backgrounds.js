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
</svg>`);
}

// Classic and control remain generated so the application always has a local
// fallback. The six themed scenes below are the real user-supplied images and
// are served by Cloudflare Workers Static Assets from dist/assets/backgrounds.
const classic = scene({
  a:'#06172d', b:'#0b2545', glow:'#1d9bf0', accent:'#57d5ff',
  motif:`<g fill="none" stroke="#6ddcff" stroke-opacity=".18" stroke-width="5"><path d="M260 420H1180L1440 680H2380L2700 360H3550"/><path d="M420 980H940L1190 730M2750 780H3370L3600 1010"/></g>`
});

const control = scene({
  a:'#04111f', b:'#09263b', glow:'#21c7d9', accent:'#5eead4',
  motif:`<g opacity=".36"><path d="M380 1470V520H1260V1470M2580 1470V520H3460V1470" fill="#030913" stroke="#67e8f9" stroke-opacity=".32" stroke-width="7"/><rect x="520" y="680" width="600" height="440" rx="42" fill="#0a1b2a" stroke="#60a5fa" stroke-width="6"/><rect x="2720" y="680" width="600" height="440" rx="42" fill="#0a1b2a" stroke="#60a5fa" stroke-width="6"/><circle cx="1920" cy="800" r="430" fill="none" stroke="#5eead4" stroke-opacity=".28" stroke-width="10"/></g>`
});

const REAL_ASSET_VERSION = '20260915-real1';
const asset = name => `/assets/backgrounds/mel-bg-${name}.webp?v=${REAL_ASSET_VERSION}`;

const crusade = asset('crusade');
const religious = asset('religious');
const granada = asset('granada');
const aviation = asset('aviation');
const paladin = asset('paladin');
const amazon = asset('amazon');

export const HD_BACKGROUNDS = Object.freeze({ classic, crusade, religious, granada, aviation, paladin, amazon, control });

// Tones were measured from the actual user-supplied images. Keeping this map
// deterministic avoids fragile runtime canvas sampling/CORS behaviour.
export const HD_BACKGROUND_TONES = Object.freeze({
  classic: 'dark',
  crusade: 'light',
  religious: 'dark',
  granada: 'dark',
  aviation: 'light',
  paladin: 'dark',
  amazon: 'dark',
  control: 'dark',
});

export default HD_BACKGROUNDS;
