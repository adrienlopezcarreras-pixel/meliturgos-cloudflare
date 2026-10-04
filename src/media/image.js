import { Buffer } from 'buffer';

/**
 * Generate an image from a text prompt using Workers AI.
 * @param {string} prompt - The text prompt for image generation.
 * @returns {Promise<Buffer>} The generated image as a buffer.
 */
export async function generateImage(prompt) {
  const inputs = {
    prompt,
  };

  const response = await env.AI.run(
    '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    inputs
  );

  return Buffer.from(response);
}
