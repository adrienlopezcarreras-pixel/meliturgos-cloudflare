import { env } from '$env/dynamic/private';
import { CapabilityBus } from '../capability-bus.js';
import { z } from 'zod';

const VideoGenerateInput = z.object({
  prompt: z.string().min(1),
  image: z.instanceof(ArrayBuffer).optional(),
  audio: z.instanceof(ArrayBuffer).optional(),
  duration: z.number().int().min(1).max(30).optional(),
  fps: z.number().int().min(1).max(60).optional(),
  width: z.number().int().min(64).max(1024).optional(),
  height: z.number().int().min(64).max(1024).optional(),
});

export async function generateVideo(input) {
  const parsed = VideoGenerateInput.parse(input);

  // Validate inputs
  if (!parsed.prompt.trim()) {
    throw new Error('VIDEO_GENERATE_EMPTY_PROMPT');
  }

  // Prepare model input
  const modelInput = {
    prompt: parsed.prompt,
    ...(parsed.image && { image: parsed.image }),
    ...(parsed.audio && { audio: parsed.audio }),
    ...(parsed.duration && { num_frames: parsed.fps * parsed.duration }),
    ...(parsed.fps && { fps: parsed.fps }),
    ...(parsed.width && { width: parsed.width }),
    ...(parsed.height && { height: parsed.height }),
  };

  // Call Workers AI
  let result;
  try {
    result = await env.AI.run('@cf/stable-video-diffusion-img2vid', modelInput);
  } catch (err) {
    // Propagate provider errors for fail-closed handling
    throw err;
  }

  // Check for empty response
  if (!result) {
    throw new Error('EMPTY_WORKERS_AI_RESPONSE');
  }

  // Validate response type
  if (!(result instanceof ArrayBuffer)) {
    throw new Error('INVALID_WORKERS_AI_RESPONSE_TYPE');
  }

  // Check for empty buffer
  if (result.byteLength === 0) {
    throw new Error('EMPTY_WORKERS_AI_RESPONSE_BUFFER');
  }

  return result;
}