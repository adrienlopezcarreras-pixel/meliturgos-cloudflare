import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveImageSubject,searchImages,searchPublicMedia,verifiedPontiffName} from '../src/search/image-search.js';
function fixture({ambiguous=false,missing=false,fail=false,label='cat'}={}){
 const calls=[];
 return {calls,async fetchPage(raw){const u=new URL(raw);calls.push(u);if(fail)throw Error('private provider error');
 let data;
 if(u.hostname==='fr.wikipedia.org')data={query:{pages:{1:{title:'Chat',...(missing?{missing:''}:{}),pageprops:{wikibase_item:'Q146',...(ambiguous?{disambiguation:''}:{})}}}}};
 else if(u.hostname==='www.wikidata.org')data={entities:{Q146:{labels:{en:{language:'en',value:label}}}}};
 else data={query:{pages:{1:{title:'File:Domestic cat.jpg',imageinfo:[{thumburl:'https://upload.wikimedia.org/cat.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Domestic_cat.jpg',mime:'image/jpeg'}]}}}};
 return {content:JSON.stringify(data),source_id:'test',timestamp:1};}};
}
test('French chat resolves to the cat entity, not an English bird or a fuzzy gene match',async()=>{
 const s=fixture();const result=await searchImages(s,{query:'chat',max_images:1});
 assert.equal(result.subject_resolution.entity,'Q146');assert.equal(result.images.length,1);
 const q=s.calls.at(-1).searchParams.get('gsrsearch');assert.equal(q,'cat haswbstatement:P180=Q146 filetype:bitmap');
 assert.equal(s.calls.length,3);assert.equal(result.query,'chat');
});
test('missing and disambiguation articles never create a verified subject',async()=>{
 for(const options of [{missing:true},{ambiguous:true},{fail:true}]){const s=fixture(options);assert.equal(await resolveImageSubject(s,'chat'),null);assert.equal(s.calls.length,1);}
});
test('untrusted labels and search operators cannot become injected entity queries',async()=>{
 assert.equal(await resolveImageSubject(fixture({label:'cat OR filetype:video'}),'chat'),null);
 const s=fixture();assert.equal(await resolveImageSubject(s,'chat OR filetype:video'),null);assert.equal(s.calls.length,0);
});
test('a current pope photo keeps the latest name and rejects another Léon', async () => {
  const listed = '<table><tr><td>Léon I</td><td>440</td></tr><tr><td>Léon XIV</td><td>pontificat en cours</td></tr></table>';
  assert.equal(verifiedPontiffName([{ content: listed }]), 'Léon XIV');
  const service = {
    async research() { return { sources: [{ url: 'https://www.vatican.va/holy-father.html', title: 'Saint-Père', content: listed }] }; },
    async fetchPage(raw) {
      const host = new URL(raw).hostname;
      if (host !== 'commons.wikimedia.org') throw new Error('no article');
      return { content: JSON.stringify({ query: { pages: {
        1: { index: 1, title: 'File:Noel, Léon, Nadar, Gallica.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/nadar.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Noel', mime: 'image/jpeg' }] },
        2: { index: 2, title: 'File:Pope Leo XIV portrait.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/leo.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Pope_Leo_XIV', mime: 'image/jpeg' }] },
      } } }), source_id: 't', timestamp: 1 };
    },
  };
  const result = await searchImages(service, { query: 'montre moi une photo du pape' });
  assert.equal(result.images.length, 1);
  assert.match(result.images[0].title, /Leo XIV/);
});

test('audio and video retain their canonical provider and do not run image resolution',async()=>{
 for(const type of ['audio','video']){const s=fixture();await searchPublicMedia(s,{query:'piano',type});assert.equal(s.calls.length,1);assert.equal(s.calls[0].hostname,'commons.wikimedia.org');}
});


test('truncated Vatican table resolves the current pontiff from the compact official index, then finds a matching photo',async()=>{
  const calls=[];
  const shortIndex='https://www.vatican.va/holy_father/index_fr.htm';
  const service={
    async research(){
      // The public table has 267 entries: the 50k read can stop before the final row.
      return {sources:[{url:'https://www.vatican.va/content/vatican/fr/holy-father.html',
        title:'Pontifes',content:'<table><tr><td>266</td><td>François</td><td>21.IV.2025</td></tr></table>'}]};
    },
    async fetchPage(raw){
      calls.push(String(raw));
      const u=new URL(raw);
      if(raw===shortIndex)return {url:raw,content:'<nav><a href="/">Saint-Père</a></nav><a href="/leo">Léon XIV</a><a href="/francois">François</a>'};
      if(u.hostname==='fr.wikipedia.org')return {content:JSON.stringify({query:{pages:{'-1':{missing:''}}}})};
      if(u.hostname!=='commons.wikimedia.org')throw Error('Unexpected URL '+raw);
      const search=u.searchParams.get('gsrsearch');
      if(search==='Léon XIV filetype:bitmap')return {content:JSON.stringify({query:{pages:{}}}),source_id:'fixture',timestamp:1};
      assert.equal(search,'Pope Leo XIV filetype:bitmap');
      return {content:JSON.stringify({query:{pages:{
        1:{index:1,title:'File:Leo XIII image.jpg',imageinfo:[{thumburl:'https://upload.wikimedia.org/leo13.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Leo_XIII',mime:'image/jpeg'}]},
        2:{index:2,title:'File:Pope Leo XIV portrait.jpg',imageinfo:[{thumburl:'https://upload.wikimedia.org/leo14.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Leo_XIV',mime:'image/jpeg'}]},
      }}}),source_id:'fixture',timestamp:1};
    },
  };
  const result=await searchImages(service,{query:'montre moi une photo du pape',max_images:3});
  assert.equal(result.code,null);
  assert.equal(result.official_identity,'Léon XIV');
  assert.equal(result.images.length,1);
  assert.equal(result.images[0].url,'https://upload.wikimedia.org/leo14.jpg');
  assert.ok(calls.includes(shortIndex));
  assert.ok(calls.some(url=>url.includes('commons.wikimedia.org')));
});

test('a failed compact Vatican index does not guess a serving pope or invent a picture',async()=>{
  const service={
    async research(){return {sources:[{url:'https://www.vatican.va/content/vatican/fr/holy-father.html',
      content:'<table><tr><td>266</td><td>François</td></tr></table>'}]};},
    async fetchPage(){throw Error('official index unavailable');},
  };
  const result=await searchImages(service,{query:'montre moi une photo du pape'});
  assert.equal(result.code,'IMAGE_SEARCH_EMPTY');
  assert.equal(result.images.length,0);
});
