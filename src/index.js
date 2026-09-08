/**
 * Gen2 Entry Point
 * 
 * Clean, modular Worker Gen2 entry point.
 * Provides router initialization and error handling.
 * 
 * LEGACY: worker.js remains as reference for production stability.
 * GEN2: src/index.js is the evolving modular entry point.
 */

import router from "./router.js";

/**
 * Main fetch handler
 */
export default {
  async fetch(request, env) {
    // Directly delegate to router
    try {
      const response = await router.fetch(request, env);
      if (response) return response;
      throw new Error("Router returned null");
    } catch (error) {
      console.error("[Gen2] Request error:", error);
      return new Response(
        JSON.stringify({ error: "Une erreur interne est survenue.", code: "INTERNAL_ERROR" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};
