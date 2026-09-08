// Canonical Worker entrypoint. worker.js is an API compatibility dependency.
import router from "./router.js";

/**
 * Main fetch handler
 */
export default {
  async fetch(request, env, ctx) {
    // Directly delegate to router
    try {
      const response = await router.fetch(request, env, ctx);
      if (response) return response;
      throw new Error("Router returned null");
    } catch (error) {
      if (error?.status >= 400 && error.status < 600 && typeof error.code === "string") return Response.json({error:error.code,code:error.code},{status:Number(error.status)});
      if (error instanceof SyntaxError) return Response.json({error:"Invalid JSON",code:"INVALID_JSON"},{status:400});
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
