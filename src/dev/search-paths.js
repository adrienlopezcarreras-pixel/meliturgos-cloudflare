export function parseSearchPaths(stdout = '') {
  const paths = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const match = line.match(/^\s*\.?\/?([^:\s]+):\d+(?::\d+)?(?::|\s)/);
    if (match && !match[1].includes(',') && !paths.includes(match[1])) paths.push(match[1]);
  }
  return paths;
}

export function rankSearchPaths(paths = []) {
  return [...new Set(paths)].sort((a, b) => score(b) - score(a) || a.localeCompare(b));
}
function score(file) {
  const p = String(file).toLowerCase(); let n = 0;
  if (p.startsWith('src/')) n += 30;
  if (/\.(js|mjs|ts|tsx|jsx|html|css)$/.test(p)) n += 20;
  if (/(pages|ui|component|route|interface)/.test(p)) n += 18;
  if (/^(imports|exports|dumps|docs|tests|migrations)\//.test(p)) n -= 45;
  if (/\.json$/.test(p)) n -= 25;
  return n;
}
