export const SOVEREIGNTY_WATCH_SCHEMA='mel.sovereignty-watch-catalog/v1';
export const SOVEREIGNTY_WATCH_INTERVAL_MS=24*60*60*1000;

const target=(layer,query,capabilities=[])=>Object.freeze({
  id:'sovereignty_'+layer,
  layer,
  mode:'observe',
  weight:1,
  metadata:Object.freeze({
    category:'technical-sovereignty',
    query,
    capabilities:Object.freeze(capabilities),
    source_class:'official-preferred',
    verification_policy:'DISCOVERY_ONLY_THEN_LOCAL_LIVE_PREVALIDATION',
    purpose:'find_replacement_before_dependency_failure',
  }),
});

export const SOVEREIGNTY_WATCH_TARGETS=Object.freeze([
  target('ai',
    'official current open or free AI model providers OpenAI-compatible HTTP inference API low refusal open weights zero cost free tier portability',
    ['models','open-models','inference','api','low-refusal']),
  target('runtime',
    'official current serverless edge worker node runtime hosting free tier portable deployment alternatives',
    ['runtime','serverless','edge','deployment']),
  target('storage',
    'official current S3 compatible object storage free tier zero cost API alternatives',
    ['object-storage','S3','backup']),
  target('database',
    'official current SQL PostgreSQL SQLite compatible database serverless free tier portable export import alternatives',
    ['database','SQL','PostgreSQL','SQLite']),
  target('source_control',
    'official current Git forge source control hosting GitHub alternative free tier Git API repository import export',
    ['git','source-control','forge']),
  target('ci_cd',
    'official current CI CD pipeline runner GitHub Actions alternative free tier API artifacts deployment',
    ['CI','CD','pipeline','runner']),
  target('secrets_identity',
    'official current secret manager identity vault OAuth secret reference free tier portable alternatives',
    ['secrets','identity','OAuth','vault']),
  target('scheduler',
    'official current cron scheduler task queue workflow scheduler API free tier alternatives',
    ['scheduler','cron','queue']),
  target('observability',
    'official current logs metrics traces observability telemetry OpenTelemetry free tier alternatives',
    ['observability','logs','metrics','traces','OpenTelemetry']),
  target('backup_restore',
    'official current encrypted backup cold storage restore archival free tier alternatives',
    ['backup','restore','archive','cold-storage']),
]);

export function getSovereigntyWatchCatalog(){
  return{
    schema:SOVEREIGNTY_WATCH_SCHEMA,
    interval_ms:SOVEREIGNTY_WATCH_INTERVAL_MS,
    targets:SOVEREIGNTY_WATCH_TARGETS.map(row=>({
      ...row,
      metadata:{...row.metadata,capabilities:[...row.metadata.capabilities]},
    })),
  };
}
