import { verifyContingencyProbeReports } from './contingency-probe-auth.js';
function blocked(code) {
  return Object.freeze({ok:false,code,source_archive_allowed:false,failover_allowed:false,
    max_running:false,d1_restored:false,r2_restored:false});
}
/** Independently signed outage admits only a source archive, never failover. */
export async function admitGitHubSourceRescue(report,signed,{
  secret,expectedHost,now=Date.now(),maxAgeMs=15*60_000,cryptoImpl=globalThis.crypto,
}={}) {
  if(report?.schema!=='mel.external-health-monitor/v1'
      || report?.independent!==true || report?.failover_performed!==false
      || report?.status!=='DOWN' || report?.code!=='OUTAGE_QUORUM'
      || typeof expectedHost!=='string' || !expectedHost
      || report?.target_host!==expectedHost) return blocked('OUTAGE_QUORUM_NOT_PROVEN');
  const observedAt=Date.parse(String(report?.observed_at||''));
  if(!Number.isFinite(observedAt)||observedAt>now||observedAt<now-maxAgeMs)
    return blocked('OUTAGE_EVIDENCE_STALE');
  const samples=Array.isArray(report?.samples)?report.samples:[];
  if(samples.length<3||samples.length>5
      ||samples.some(row=>!['DOWN','UP','UNKNOWN'].includes(row?.status))
      ||samples.filter(row=>row.status==='DOWN').length<=samples.length/2)
    return blocked('OUTAGE_QUORUM_NOT_PROVEN');
  if(signed?.part!=='cloudflare'||signed?.up!==false
      ||signed?.observer!=='github-actions-external-monitor'
      ||signed?.observed_at!==report.observed_at
      ||typeof signed?.evidence_id!=='string'
      ||!/^github-run-[0-9]+-[1-9][0-9]*$/.test(signed.evidence_id))
    return blocked('SIGNED_INCIDENT_MISMATCH');
  const checked=await verifyContingencyProbeReports([signed],{secret,now,maxAgeMs,cryptoImpl});
  if(checked.verified_count!==1||checked.observed.cloudflareUp!==false)
    return blocked('SIGNED_INCIDENT_UNVERIFIED');
  return Object.freeze({ok:true,code:'SIGNED_OUTAGE_CONFIRMED',
    source_archive_allowed:true,failover_allowed:false,
    max_running:false,d1_restored:false,r2_restored:false,
    observed_at:report.observed_at,observer:signed.observer});
}

/**
 * Archive only allowlisted software sources, not every tracked object.
 * Tracked imports, exports, local data, private backup material and generated
 * secrets must never be copied to a broadly downloadable Actions artifact.
 */
const SOURCE_ARCHIVE_ROOTS = new Set([
  'src', 'scripts', 'tests', 'migrations', 'firmware', 'browser-companion',
  'android', 'mobile', 'packages', 'release-tools', '.github',
  'package.json', 'package-lock.json', 'worker.js', 'wrangler.jsonc',
  'wrangler.toml', 'tsconfig.json', 'jsconfig.json', 'vite.config.js',
]);
export function selectSourceArchiveRoots(trackedRoots = []) {
  if (!Array.isArray(trackedRoots)) return [];
  return [...new Set(trackedRoots)]
    .filter(name => typeof name === 'string' && SOURCE_ARCHIVE_ROOTS.has(name))
    .sort();
}


/** Never publish a tracked secret, key or database dump merely because its
 * parent root is source-allowlisted. Reject the whole artifact, fail closed. */
export function sensitiveSourceArchivePaths(paths = []) {
  if (!Array.isArray(paths)) return Object.freeze(['INVALID_PATH_LIST']);
  const denyName = /^(?:\.env(?:\.[^/]*)?|\.npmrc|\.pypirc|id_rsa|id_ed25519|[^/]*\.(?:pem|key|p12|pfx|kdbx|sqlite|sqlite3|db|bak|dump|backup|zip|7z|tar|gz|age|gpg))$/i;
  const denySegment = /^(?:secrets?|credentials?|private[_-]?keys?|backups?|exports?|imports?)$/i;
  const found = paths.filter(path => {
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\')) return true;
    const segments = path.split('/');
    if (segments.some(x => x === '.' || x === '..' || !x)) return true;
    return denyName.test(segments.at(-1)) || segments.some(x => denySegment.test(x));
  });
  return Object.freeze(found);
}
