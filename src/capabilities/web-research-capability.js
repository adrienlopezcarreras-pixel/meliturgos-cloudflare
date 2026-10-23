import { searchImages, searchPublicMedia } from '../search/image-search.js';
import InternetService from '../services/internet-service.js';

export function registerWebResearchCapability(bus, env = {}) {
  bus.discover({
    id: 'web.research',
    name: 'Recherche web sourcée',
    category: 'research',
    version: '1.0.0',
    provider: 'mel',
    description: 'Performs bounded public-web research with URL safety, provenance, rate limiting and source snippets.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 2000 },
        domains: { type: 'array', maxItems: 3, items: { type: 'string', minLength: 1, maxLength: 253 } },
        seed_urls: { type: 'array', maxItems: 6, items: { type: 'string', minLength: 8, maxLength: 500 } },
        depth: { type: 'integer', minimum: 1, maximum: 3 }
      },
      required: ['query'],
      additionalProperties: false
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true
  }, async input => {
    const service = new InternetService(env);
    service.minInterval = Math.max(0, Math.min(5000, Number(env.MEL_WEB_MIN_INTERVAL_MS ?? 1000) || 0));
    return service.research(
      input.query,
      input.domains || null,
      Math.max(1, Math.min(3, Number(input.depth) || 2)),
      input.seed_urls || null,
    );
  });
  bus.discover({
    id:'web.images.search',name:'Recherche de photos sourcées',category:'research',version:'1.0.0',provider:'mel',
    description:'Retrieve real public images with source URLs; no image generation or private-file access.',
    input_schema:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:2000},max_images:{type:'integer',minimum:1,maximum:6}},required:['query'],additionalProperties:false},
    output_schema:{type:'object',additionalProperties:true},risk:'LOW',permissions:[],health:'HEALTHY',enabled:true,
  },async input=>{
    const service=new InternetService(env);
    service.minInterval=Math.max(0,Math.min(5000,Number(env.MEL_WEB_MIN_INTERVAL_MS??1000)||0));
    return searchImages(service,input);
  });

  bus.discover({
    id:'web.media.search',name:'Recherche de sons et vidéos libres',category:'research',version:'1.0.0',provider:'mel',
    description:'Retrieve actual sourced public audio or video from Wikimedia Commons for playback. Free public search, never generation or visual/audio analysis.',
    input_schema:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:2000},type:{type:'string',enum:['audio','video']},max_results:{type:'integer',minimum:1,maximum:6}},required:['query','type'],additionalProperties:false},
    output_schema:{type:'object',additionalProperties:true},risk:'LOW',permissions:[],health:'HEALTHY',enabled:true,
  },async input=>{
    const service=new InternetService(env);
    service.minInterval=Math.max(0,Math.min(5000,Number(env.MEL_WEB_MIN_INTERVAL_MS??1000)||0));
    return searchPublicMedia(service,input);
  });
}
