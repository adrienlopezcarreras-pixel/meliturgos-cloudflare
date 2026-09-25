const SOURCE_KIND_WEIGHT = Object.freeze({
  OFFICIAL_SEED: 55,
  DIRECT_SOURCE: 35,
  SEARCH_INDEX: 5,
});

function text(value) {
  return String(value ?? '').trim();
}

function hostname(value) {
  try {
    return new URL(text(value)).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

function domainMatches(host, domain) {
  const normalizedHost = text(host).toLowerCase().replace(/\.$/, '');
  const normalizedDomain = text(domain)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
  if (!normalizedHost || !normalizedDomain) return false;
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Heuristic provenance/evidence quality only. It does not claim factual truth.
 * The score is deliberately based on inspectable transport/source signals:
 * directness, TLS, bounded redirects, provenance completeness and content metadata.
 */
export function assessWebSourceQuality(source = {}, {
  preferredDomains = [],
} = {}) {
  const sourceKind = text(source.source_kind || 'UNKNOWN');
  const url = text(source.url);
  const host = hostname(url);
  const provenance = source?.provenance && typeof source.provenance === 'object'
    ? source.provenance
    : {};

  let score = SOURCE_KIND_WEIGHT[sourceKind] ?? 0;
  const signals = [];

  if (sourceKind === 'OFFICIAL_SEED') {
    signals.push('explicit_official_seed');
  } else if (sourceKind === 'DIRECT_SOURCE') {
    signals.push('direct_page_fetch');
  } else if (sourceKind === 'SEARCH_INDEX') {
    signals.push('discovery_index_only');
  }

  if (url.startsWith('https://')) {
    score += 10;
    signals.push('https');
  }

  const redirectCount = Math.max(0, Math.trunc(finite(provenance.redirect_count, 0)));
  if (redirectCount === 0) {
    score += 5;
    signals.push('no_redirect');
  } else if (redirectCount <= 2) {
    score += 2;
    signals.push('bounded_redirects');
  } else {
    signals.push('multiple_redirects');
  }

  const contentType = text(provenance.content_type).toLowerCase();
  if (
    contentType.includes('text/html')
    || contentType.includes('application/json')
    || contentType.includes('text/plain')
  ) {
    score += 5;
    signals.push('supported_text_content');
  }

  if (text(provenance.source_id)) {
    score += 5;
    signals.push('source_id_present');
  }
  if (text(provenance.fetched_at)) {
    score += 5;
    signals.push('fetch_time_present');
  }

  if (text(source.title).length >= 3) {
    score += 5;
    signals.push('title_present');
  }
  if (text(source.snippet).length >= 20) {
    score += 5;
    signals.push('snippet_present');
  }

  if (provenance.truncated === false) {
    score += 5;
    signals.push('not_truncated');
  } else if (provenance.truncated === true) {
    signals.push('truncated');
  }

  const preferred = Array.isArray(preferredDomains)
    && preferredDomains.some(domain => domainMatches(host, domain));
  if (preferred) {
    score += 5;
    signals.push('preferred_domain_match');
  }

  score = Math.max(0, Math.min(100, score));

  let band = 'DISCOVERY_ONLY';
  if (sourceKind === 'OFFICIAL_SEED' && score >= 80) {
    band = 'HIGH_PROVENANCE';
  } else if (sourceKind !== 'SEARCH_INDEX' && score >= 55) {
    band = 'DIRECT_EVIDENCE';
  }

  return Object.freeze({
    score,
    band,
    signals: Object.freeze([...new Set(signals)].sort()),
    host: host || null,
    redirect_count: redirectCount,
    caveat: 'transport_and_provenance_heuristic_not_truth_score',
  });
}

export function rankWebSources(sources = [], options = {}) {
  if (!Array.isArray(sources)) return [];
  return sources
    .map((source, index) => ({
      ...source,
      quality: assessWebSourceQuality(source, options),
      __input_index: index,
    }))
    .sort((a, b) => (
      b.quality.score - a.quality.score
      || String(a.url || '').localeCompare(String(b.url || ''))
      || a.__input_index - b.__input_index
    ))
    .map(({ __input_index, ...source }) => source);
}

export function summarizeWebSourceQuality(sources = []) {
  const counts = {
    HIGH_PROVENANCE: 0,
    DIRECT_EVIDENCE: 0,
    DISCOVERY_ONLY: 0,
  };
  let total = 0;
  let scored = 0;
  for (const source of Array.isArray(sources) ? sources : []) {
    const quality = source?.quality;
    if (!quality || !Number.isFinite(Number(quality.score))) continue;
    const band = counts[quality.band] === undefined ? 'DISCOVERY_ONLY' : quality.band;
    counts[band] += 1;
    total += Number(quality.score);
    scored += 1;
  }
  return Object.freeze({
    source_count: Array.isArray(sources) ? sources.length : 0,
    scored_count: scored,
    average_score: scored ? Math.round((total / scored) * 10) / 10 : 0,
    bands: Object.freeze(counts),
    caveat: 'quality_measures_source_transport_and_provenance_not_factual_truth',
  });
}
