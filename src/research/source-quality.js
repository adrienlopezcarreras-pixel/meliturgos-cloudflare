import { validateUrl } from '../devices/web-capability.js';

function researchError(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}

function cleanDomain(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (!raw || raw.length > 253) throw researchError('RESEARCH_DOMAIN_INVALID');
  if (raw.includes('://') || raw.includes('/') || raw.includes('@') || raw.includes(':')) {
    throw researchError('RESEARCH_DOMAIN_INVALID');
  }
  let url;
  try { url = new URL(`https://${raw}/`); } catch { throw researchError('RESEARCH_DOMAIN_INVALID'); }
  if (url.hostname.toLowerCase().replace(/\.$/, '') !== raw) throw researchError('RESEARCH_DOMAIN_INVALID');
  const validation = validateUrl(url.href);
  if (!validation.valid) throw researchError('RESEARCH_DOMAIN_UNSAFE');
  return raw;
}

export function normalizeResearchDomains(domains) {
  if (domains == null) return Object.freeze([]);
  if (!Array.isArray(domains) || domains.length > 3) throw researchError('RESEARCH_DOMAINS_INVALID');
  return Object.freeze([...new Set(domains.map(cleanDomain))].sort());
}

export function urlMatchesResearchDomains(urlValue, domains = []) {
  if (!Array.isArray(domains) || domains.length === 0) return true;
  let host;
  try { host = new URL(urlValue).hostname.toLowerCase().replace(/\.$/, ''); } catch { return false; }
  return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}

export function sourceEvidenceMetadata(source = {}) {
  const kind = String(source.source_kind || 'UNKNOWN');
  const direct = kind === 'DIRECT_SOURCE' || kind === 'OFFICIAL_SEED';
  const discoveryOnly = kind === 'SEARCH_INDEX';
  const provenance = source.provenance || {};
  const completeProvenance = Boolean(
    provenance.source_id
      && provenance.fetched_at
      && provenance.content_type
      && provenance.content_sha256,
  );
  return Object.freeze({
    evidence_class: discoveryOnly ? 'DISCOVERY_ONLY' : direct ? 'DIRECT_CONTENT' : 'UNKNOWN',
    direct_content: direct,
    discovery_only: discoveryOnly,
    authority_verified: false,
    provenance_complete: completeProvenance,
    redirected: Number(provenance.redirect_count || 0) > 0,
    truncated: provenance.truncated === true,
  });
}

export function summarizeResearchEvidence(sources = [], { domains = [] } = {}) {
  const rows = Array.isArray(sources) ? sources : [];
  const metadata = rows.map(sourceEvidenceMetadata);
  const direct = metadata.filter(row => row.direct_content).length;
  const discovery = metadata.filter(row => row.discovery_only).length;
  const provenanceComplete = metadata.filter(row => row.provenance_complete).length;
  const citationQuality = rows.length === 0
    ? 'NONE'
    : direct === rows.length
      ? 'DIRECT'
      : direct > 0
        ? 'MIXED'
        : 'DISCOVERY_ONLY';
  return Object.freeze({
    source_count: rows.length,
    direct_source_count: direct,
    discovery_only_count: discovery,
    provenance_complete_count: provenanceComplete,
    citation_quality: citationQuality,
    domain_restricted: Array.isArray(domains) && domains.length > 0,
    domains: Object.freeze([...(domains || [])]),
    authority_claims_verified: false,
  });
}
