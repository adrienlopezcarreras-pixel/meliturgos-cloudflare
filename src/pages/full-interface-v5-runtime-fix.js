import { onRequestGet as handleFullModeV5 } from './full-interface-v5.js';

function replaceOrFail(source, invalid, valid, label) {
  if (!source.includes(invalid)) throw new Error(`FULL_MODE_RUNTIME_FIX_MISSING:${label}`);
  return source.replace(invalid, valid);
}

export function repairGeneratedFullModeHtml(html) {
  let out = String(html || '');

  out = replaceOrFail(
    out,
    `melAnswer?'

Réponse MEL à relire :
'+String(melAnswer):''`,
    "melAnswer?'\\n\\nRéponse MEL à relire :\\n'+String(melAnswer):''",
    'mentor-newlines'
  );

  out = replaceOrFail(
    out,
    `pieces.join('

')`,
    "pieces.join('\\n\\n')",
    'council-newlines'
  );

  out = replaceOrFail(
    out,
    `'AUDIT LECTURE SEULE
Résultat : '`,
    "'AUDIT LECTURE SEULE\\nRésultat : '",
    'audit-header-newline'
  );

  out = replaceOrFail(
    out,
    `+'
Routes contrôlées : 7
Échecs : '`,
    "+'\\nRoutes contrôlées : 7\\nÉchecs : '",
    'audit-lines-newlines'
  );

  out = replaceOrFail(
    out,
    `+'

'+JSON.stringify(d,null,2)`,
    "+'\\n\\n'+JSON.stringify(d,null,2)",
    'audit-json-newlines'
  );

  return out;
}

export async function onRequestGet(context = {}) {
  const response = await handleFullModeV5(context);
  const html = await response.text();
  const repaired = repairGeneratedFullModeHtml(html);
  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-mel-full-mode-js', 'repaired-v1');
  return new Response(repaired, { status: response.status, statusText: response.statusText, headers });
}
