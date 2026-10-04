import { Augmentio } from '../augmentio/augmentio.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';

/**
 * Generate audio from text using available providers via .augmentio.
 * @param {{ env: Env, input: { text: string, voice?: string, format?: string } }} ctx
 * @returns {Promise<ArrayBuffer|string>} Audio data
 */
export default async function audioGenerate({ env, input }) {
  const { text, voice = 'alloy', format = 'mp3' } = input;
  const augmentio = new Augmentio({ pool: createDefaultAugmentioPool(env) });

  const result = await augmentio.run({
    capability: 'audio.generate',
    input: {
      text,
      voice,
      format,
      // Ensure we request audio output
      output_format: format
    },
    maxCandidates: 1,
    // Prefer zero-cost providers first
    zero_added_cost: true
  });

  if (!result || !result.candidates || result.candidates.length === 0) {
    throw new Error('AUDIO_GENERATION_NO_PROVIDERS');
  }

  const candidate = result.candidates[0];
  if (!candidate.audio) {
    throw new Error('AUDIO_GENERATION_EMPTY_RESPONSE');
  }

  // Return audio data as ArrayBuffer or base64 string based on provider
  return typeof candidate.audio === 'string'
    ? candidate.audio
    : candidate.audio;
}