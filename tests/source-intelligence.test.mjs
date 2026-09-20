import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SOURCE_SIGNAL_FEEDS,
  rankAiCandidates,
  rankSourceCandidates,
  sourceIntelligenceSummary,
} from '../src/learning/source-intelligence.js';
import { getEcosystemWatchCatalog } from '../src/evaluation/ecosystem-watch-catalog.js';

test('source intelligence keeps popularity separate from factual authority', () => {
  const ranked=rankSourceCandidates([
    {url:'https://official.example/fact',source_kind:'PRIMARY_SOURCE'},
    {url:'https://popular.example/post',source_kind:'DIRECT_SOURCE',quality_signals:{
      similarweb_rank:1,tranco_rank:1,majestic_rank:1,rating:5,rating_count:100000,topical_relevance:1,
    }},
  ]);
  assert.equal(ranked[0].url,'https://official.example/fact');
  const popular=ranked.find(row=>row.url.includes('popular.example'));
  assert.equal(popular.source_quality.rule,'POPULARITY_IS_NOT_TRUTH');
  assert.equal(popular.source_quality.fact_eligible,false);
});

test('independently corroborated direct source can become factual evidence without becoming primary', () => {
  const [row]=rankSourceCandidates([{url:'https://secondary.example',source_kind:'DIRECT_SOURCE',quality_signals:{independent_corroboration:.9,topical_relevance:1}}]);
  assert.equal(row.source_quality.fact_eligible,true);
  assert.equal(row.source_quality.role,'SECONDARY_EVIDENCE');
});

test('AI quality is task-specific and local MEL benchmark remains material', () => {
  const ranked=rankAiCandidates([
    {id:'coding-specialist',task:'coding',metrics:{lmarena_score:1400,artificial_analysis_score:70,swe_bench_verified_pct:90,mel_benchmark_score:.92,reliability:.9}},
    {id:'general-chat',task:'coding',metrics:{lmarena_score:1700,artificial_analysis_score:85,swe_bench_verified_pct:45,mel_benchmark_score:.65,reliability:.9}},
  ]);
  assert.equal(ranked[0].id,'coding-specialist');
  assert.equal(ranked[0].model_quality.rule,'NO_SINGLE_GLOBAL_BEST_MODEL');
});

test('website and AI watch feeds cover traffic, consensus, backlinks and independent model benchmarks', async () => {
  assert.deepEqual(SOURCE_SIGNAL_FEEDS.websites.map(row=>row.id),[
    'similarweb-top-websites','tranco-top-sites','majestic-million'
  ]);
  assert.deepEqual(SOURCE_SIGNAL_FEEDS.ai.map(row=>row.id),[
    'lmarena-text','artificial-analysis','swe-bench-verified','huggingface-open-llm'
  ]);
  const summary=sourceIntelligenceSummary();
  assert.equal(summary.website_feeds,3);
  assert.equal(summary.ai_feeds,4);

  const catalog=getEcosystemWatchCatalog();
  const ids=new Set(catalog.targets.map(row=>row.id));
  assert.equal(ids.has('watch_source_reputation'),true);
  assert.equal(ids.has('watch_ai_benchmarks'),true);

  const knowledge=await readFile(new URL('../src/capabilities/knowledge-workspace-capabilities.js',import.meta.url),'utf8');
  assert.match(knowledge,/rankSourceCandidates/);
  assert.match(knowledge,/Qualité source/);
});
