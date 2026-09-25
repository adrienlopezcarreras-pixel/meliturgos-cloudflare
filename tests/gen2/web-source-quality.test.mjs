import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessWebSourceQuality,
  rankWebSources,
  summarizeWebSourceQuality,
} from '../../src/search/web-source-quality.js';
import InternetService from '../../src/services/internet-service.js';
import { fetchWebContent } from '../../src/devices/web-capability.js';

function source({
  kind='DIRECT_SOURCE',
  url='https://example.com/page',
  title='Example source',
  snippet='A sufficiently descriptive public source snippet.',
  redirectCount=0,
  truncated=false,
}={}) {
  return {
    source_kind: kind,
    url,
    title,
    snippet,
    provenance: {
      source_id:'src-1',
      fetched_at:'2026-09-25T12:00:00.000Z',
      content_type:'text/html; charset=utf-8',
      redirect_count:redirectCount,
      redirect_chain:[url],
      truncated,
    },
  };
}

test('GEN2-37 source quality ranks explicit official seed above direct evidence above discovery index',()=>{
  const official=source({kind:'OFFICIAL_SEED',url:'https://docs.example.com/release'});
  const direct=source({kind:'DIRECT_SOURCE',url:'https://news.example.org/article'});
  const discovery=source({kind:'SEARCH_INDEX',url:'https://www.google.com/search?q=mel'});

  const ranked=rankWebSources([discovery,direct,official]);
  assert.deepEqual(ranked.map(row=>row.source_kind),[
    'OFFICIAL_SEED',
    'DIRECT_SOURCE',
    'SEARCH_INDEX',
  ]);
  assert.equal(ranked[0].quality.band,'HIGH_PROVENANCE');
  assert.equal(ranked[1].quality.band,'DIRECT_EVIDENCE');
  assert.equal(ranked[2].quality.band,'DISCOVERY_ONLY');
  assert.ok(ranked[0].quality.score>ranked[1].quality.score);
  assert.ok(ranked[1].quality.score>ranked[2].quality.score);
});

test('GEN2-37 quality assessment is explicitly a provenance heuristic and not a truth score',()=>{
  const quality=assessWebSourceQuality(source());
  assert.equal(quality.band,'DIRECT_EVIDENCE');
  assert.equal(quality.caveat,'transport_and_provenance_heuristic_not_truth_score');
  assert.ok(quality.signals.includes('direct_page_fetch'));
  assert.ok(quality.signals.includes('https'));
  assert.ok(quality.signals.includes('source_id_present'));
});

test('GEN2-37 preferred domain is an explicit inspectable ranking signal',()=>{
  const without=assessWebSourceQuality(source({
    url:'https://docs.vendor.example/update',
  }));
  const withPreferred=assessWebSourceQuality(source({
    url:'https://docs.vendor.example/update',
  }),{
    preferredDomains:['vendor.example'],
  });

  assert.equal(withPreferred.score,Math.min(100,without.score+5));
  assert.ok(withPreferred.signals.includes('preferred_domain_match'));
});

test('GEN2-37 public redirect provenance keeps requested URL, final URL and validated chain',async()=>{
  const calls=[];
  const page=await fetchWebContent('redirect-source','https://example.com/start',{
    fetchImpl:async url=>{
      calls.push(String(url));
      if(String(url)==='https://example.com/start'){
        return new Response(null,{
          status:302,
          headers:{location:'https://docs.example.org/final'},
        });
      }
      if(String(url)==='https://docs.example.org/final'){
        return new Response('<html><head><title>Final source</title></head><body>Evidence</body></html>',{
          status:200,
          headers:{'content-type':'text/html; charset=utf-8'},
        });
      }
      throw new Error('unexpected fetch '+url);
    },
  });

  assert.equal(page.requested_url,'https://example.com/start');
  assert.equal(page.url,'https://docs.example.org/final');
  assert.equal(page.redirect_count,1);
  assert.deepEqual(page.redirect_chain,[
    'https://example.com/start',
    'https://docs.example.org/final',
  ]);
  assert.deepEqual(calls,page.redirect_chain);
});

test('GEN2-37 research exposes ranked quality summary and redirect provenance in citations',async()=>{
  const fetchImpl=async url=>{
    const value=String(url);
    if(value.startsWith('https://www.google.com/search?')){
      return new Response(`<html><head><title>Google index</title></head><body>
        <a href="/url?q=https%3A%2F%2Fexample.com%2Fstart">first</a>
      </body></html>`,{
        status:200,
        headers:{'content-type':'text/html'},
      });
    }
    if(value.startsWith('https://duckduckgo.com/html/?q=')){
      return new Response(`<html><head><title>Duck index</title></head><body>
        <a href="/l/?uddg=https%3A%2F%2Fdocs.example.org%2Fdirect">second</a>
      </body></html>`,{
        status:200,
        headers:{'content-type':'text/html'},
      });
    }
    if(value==='https://example.com/start'){
      return new Response(null,{
        status:302,
        headers:{location:'/final'},
      });
    }
    if(value==='https://example.com/final'){
      return new Response('<html><head><title>Primary direct page</title><meta name="description" content="Direct public evidence with complete metadata."></head><body>primary</body></html>',{
        status:200,
        headers:{'content-type':'text/html; charset=utf-8'},
      });
    }
    if(value==='https://docs.example.org/direct'){
      return new Response('<html><head><title>Documentation page</title><meta name="description" content="Second direct public evidence with complete metadata."></head><body>secondary</body></html>',{
        status:200,
        headers:{'content-type':'text/html; charset=utf-8'},
      });
    }
    return new Response('missing',{status:404,headers:{'content-type':'text/plain'}});
  };

  const service=new InternetService({MEL_WEB_FETCH:fetchImpl});
  service.minInterval=0;
  const result=await service.research('current MEL evidence',null,2);

  assert.equal(result.sources.length,2);
  assert.equal(result.quality_summary.source_count,2);
  assert.equal(result.quality_summary.bands.DIRECT_EVIDENCE,2);
  assert.equal(result.quality_summary.bands.DISCOVERY_ONLY,0);
  assert.equal(
    result.quality_summary.caveat,
    'quality_measures_source_transport_and_provenance_not_factual_truth',
  );
  assert.ok(result.sources.every(row=>row.quality.band==='DIRECT_EVIDENCE'));
  assert.match(result.citation,/provenance heuristic, not truth score/);
  assert.match(result.summary,/Provenance mix:/);

  const redirected=result.sources.find(row=>row.url==='https://example.com/final');
  assert.ok(redirected);
  assert.equal(redirected.provenance.requested_url,'https://example.com/start');
  assert.equal(redirected.provenance.final_url,'https://example.com/final');
  assert.equal(redirected.provenance.redirect_count,1);
  assert.deepEqual(redirected.provenance.redirect_chain,[
    'https://example.com/start',
    'https://example.com/final',
  ]);
});

test('GEN2-37 quality summary is deterministic and bounded',()=>{
  const ranked=rankWebSources([
    source({kind:'DIRECT_SOURCE',url:'https://b.example/page'}),
    source({kind:'DIRECT_SOURCE',url:'https://a.example/page'}),
  ]);
  assert.deepEqual(ranked.map(row=>row.url),[
    'https://a.example/page',
    'https://b.example/page',
  ]);
  const summary=summarizeWebSourceQuality(ranked);
  assert.equal(summary.source_count,2);
  assert.equal(summary.scored_count,2);
  assert.ok(summary.average_score>=0 && summary.average_score<=100);
});
