export function parseSearchPaths(stdout = '') {
  const paths = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const match = line.match(/^\s*\.?\/?([^:\s]+):\d+(?::\d+)?(?::|\s)/);
    if (match && !match[1].includes(',') && !paths.includes(match[1])) paths.push(match[1]);
  }
  return paths;
}
