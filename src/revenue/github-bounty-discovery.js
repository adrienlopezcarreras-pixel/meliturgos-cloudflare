// Public, read-only source independent of Taskmarket. Never submit or claim on GitHub.
const API = 'https://api.github.com/search/issues';
const QUERIES = Object.freeze([
  'is:issue is:open label:bounty',
  'is:issue is:open "paid bounty"',
  'is:issue is:open label:algora',
  'is:issue is:open "USDC" bounty',
  'is:issue is:open label:"💰 Bounty"',
]);
const clean = s => String(s || '').replace(/[\x00-\x1f]/g, ' ').trim();
export async function discoverGithubBounties({ fetchImpl = fetch, now = new Date(), perQuery = 10 } = {}) {
  const found = new Map();
  const errors = [];
  for (const query of QUERIES) {
    const url = API + '?q=' + encodeURIComponent(query) + '&sort=updated&order=desc&per_page=' + Math.min(30, Math.max(1, perQuery));
    try {
      const response = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'MEL-WORK-Discovery' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) { errors.push('GITHUB_HTTP_' + response.status); continue; }
      const data = await response.json();
      for (const item of Array.isArray(data?.items) ? data.items : []) {
        if (item?.state !== 'open' || item.pull_request || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(item.html_url || '')) continue;
        const description = clean(item.body).slice(0, 1200);
        const money = /(?:[$€£]\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?(?:USD|EUR|USDC))\b/i.test(description + ' ' + item.title);
        if (!money) continue; // no explicit reward mentioned: not a paid lead
        found.set(item.html_url, {
          name: clean(item.title).slice(0, 120), url: item.html_url,
          type: 'bounty', how_mel_earns: 'Prime annoncée dans une issue GitHub ; vérifier modalités et rémunération avant toute contribution.',
          automation: 'semi', requirements: description.slice(0, 300),
          risk: 'moyen', score: 40, provider: 'github', verified_payment: false,
          status: 'DISCOVERY_ONLY', observed_at: now.toISOString(),
        });
      }
    } catch (e) { errors.push('GITHUB_FETCH_FAILED'); }
  }
  return { opportunities: [...found.values()], errors };
}
