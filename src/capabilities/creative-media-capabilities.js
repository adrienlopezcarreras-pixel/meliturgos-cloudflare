import { MediaGenerationService } from '../media/media-generation-service.js';

const DEFINITIONS = Object.freeze([
  { id: 'media.image.analyze', name: 'Analyse visuelle', kind: 'image', operation: 'analyze', aliases: ['image.analyze','vision','visual understanding','art analysis'] },
  { id: 'media.image.process', name: 'Traitement visuel', kind: 'image', operation: 'process', aliases: ['image.process','image.edit','design','illustration'] },
  { id: 'media.image.generate', name: 'Génération visuelle', kind: 'image', operation: 'generate', aliases: ['image.generate','image generation','visual creation','illustration generation'] },
  { id: 'media.audio.transcribe', name: 'Transcription audio', kind: 'audio', operation: 'transcribe', aliases: ['audio.transcribe','speech to text','voice transcription'] },
  { id: 'media.audio.synthesize', name: 'Synthèse vocale', kind: 'voice', operation: 'synthesize', aliases: ['audio.synthesize','text to speech','voice generation'] },
  { id: 'media.audio.analyze', name: 'Analyse audio', kind: 'audio', operation: 'analyze', aliases: ['audio.analyze','audio understanding','sound analysis'] },
  { id: 'media.audio.generate', name: 'Génération audio', kind: 'audio', operation: 'generate', aliases: ['audio.generate','audio generation','sound design'] },
  { id: 'media.music.analyze', name: 'Analyse musicale', kind: 'music', operation: 'analyze', aliases: ['music.analyze','music analysis','composition analysis'] },
  { id: 'media.music.generate', name: 'Création musicale', kind: 'music', operation: 'generate', aliases: ['music.generate','music generation','composition','soundtrack'] },
  { id: 'media.video.analyze', name: 'Analyse vidéo', kind: 'video', operation: 'analyze', aliases: ['video.analyze','video understanding','cinema analysis'] },
  { id: 'media.video.process', name: 'Traitement vidéo', kind: 'video', operation: 'process', aliases: ['video.process','video.edit','editing','animation'] },
  { id: 'media.video.generate', name: 'Génération vidéo', kind: 'video', operation: 'generate', aliases: ['video.generate','video generation','cinema creation','animation generation'] },
]);

function directAdapter(env, id) {
  const adapter = env?.MEL_MEDIA_CAPABILITIES?.[id];
  return typeof adapter === 'function' ? adapter : null;
}

function companion(env) {
  return env?.MEL_MEDIA_COMPANION && typeof env.MEL_MEDIA_COMPANION.fetch === 'function'
    ? env.MEL_MEDIA_COMPANION
    : null;
}

function generationProvider(env, kind) {
  const providers = Array.isArray(env?.MEL_MEDIA_PROVIDERS) ? env.MEL_MEDIA_PROVIDERS : [];
  return providers.some(provider => {
    try { return typeof provider?.canGenerate === 'function' && provider.canGenerate(kind); }
    catch { return false; }
  });
}

function initialHealth(env, definition) {
  if (directAdapter(env, definition.id)) return 'HEALTHY';
  if (companion(env)) return 'DEGRADED';
  if (definition.operation === 'generate' && generationProvider(env, definition.kind)) return 'HEALTHY';
  return 'UNAVAILABLE';
}

async function health(env, definition) {
  if (directAdapter(env, definition.id)) return { status: 'HEALTHY' };
  const binding = companion(env);
  if (binding) {
    try {
      const response = await binding.fetch(`https://mel-media.local/health?capability=${encodeURIComponent(definition.id)}`);
      if (response?.ok) return { status: 'HEALTHY' };
      return { status: 'UNAVAILABLE' };
    } catch {
      return { status: 'UNAVAILABLE' };
    }
  }
  if (definition.operation === 'generate' && generationProvider(env, definition.kind)) return { status: 'HEALTHY' };
  return { status: 'UNAVAILABLE' };
}

async function execute(env, definition, input) {
  const adapter = directAdapter(env, definition.id);
  if (adapter) return adapter(input);

  const binding = companion(env);
  if (binding) {
    const response = await binding.fetch(`https://mel-media.local/capabilities/${encodeURIComponent(definition.id)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input || {}),
    });
    if (!response?.ok) {
      const error = new Error(`MEDIA_COMPANION_ERROR:${definition.id}:${response?.status || 'UNKNOWN'}`);
      error.code = 'MEDIA_COMPANION_ERROR';
      error.status = 502;
      throw error;
    }
    return response.json();
  }

  if (definition.operation === 'generate' && generationProvider(env, definition.kind)) {
    const service = new MediaGenerationService({
      bucket: env?.MEDIA_BUCKET,
      providers: env.MEL_MEDIA_PROVIDERS,
    });
    const prompt = String(input?.prompt || '').trim();
    if (!prompt) {
      const error = new Error('MEDIA_PROMPT_REQUIRED');
      error.code = 'MEDIA_PROMPT_REQUIRED';
      error.status = 400;
      throw error;
    }
    return service.generate({ kind: definition.kind, prompt, params: input?.params || {} });
  }

  const error = new Error(`MEDIA_CAPABILITY_UNAVAILABLE:${definition.id}`);
  error.code = 'MEDIA_CAPABILITY_UNAVAILABLE';
  error.status = 503;
  throw error;
}

export function registerCreativeMediaCapabilities(bus, { env = {} } = {}) {
  for (const definition of DEFINITIONS) {
    bus.discover({
      id: definition.id,
      name: definition.name,
      category: 'creative-media',
      version: '1.0.0',
      provider: 'mel',
      description: `Canonical provider-neutral creative media capability. Aliases: ${definition.aliases.join(', ')}. Uses only explicitly configured providers/adapters and remains unavailable otherwise.`,
      input_schema: { type: 'object', additionalProperties: true },
      output_schema: { type: 'object', additionalProperties: true },
      risk: definition.operation === 'generate' || definition.operation === 'process' || definition.operation === 'synthesize' ? 'MEDIUM' : 'LOW',
      permissions: [],
      health: initialHealth(env, definition),
      enabled: true,
    }, input => execute(env, definition, input), () => health(env, definition));
  }
  return bus;
}

export function creativeMediaCapabilityIds() {
  return DEFINITIONS.map(row => row.id);
}
