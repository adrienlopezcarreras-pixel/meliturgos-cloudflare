import { createConversationService } from "./conversation-service.js";

/**
 * Wrap a route handler to archive chat/professor messages non-intrusively.
 * The original response is returned unchanged.
 */
export function withConversationArchive(handler, options = {}) {
  return async function (request, env, ctx) {
    const service = createConversationService(env);
    const path = new URL(request.url).pathname;
    if (request.method !== "POST" || (path !== "/api/chat" && !path.startsWith("/api/professor/ask"))) {
      return handler(request, env, ctx);
    }
    const body = await request.clone().json().catch(() => ({}));
    await service.migrate();
    let response;
    try {
      response = await handler(request, env, ctx);
    } catch (e) {
      throw e;
    }

    try {
      const url = new URL(request.url);
      if (!response?.ok) return response;
      const conversationId = deriveConversationId(request, body, options);
      if (!conversationId) return response;

      await service.migrate();
      await service.ensureConversation(conversationId, env.MELITURGOS_USER || "", String(body.text || body.question || "Conversation").slice(0, 80));
      if (url.pathname === "/api/chat" && response) {
        await archiveChat(request, body, response, service, conversationId);
      } else if (url.pathname.startsWith("/api/professor/ask") && response) {
        await archiveProfessor(body, response, service, conversationId, request);
      }
    } catch (e) {
      console.error(JSON.stringify({ message: "conversation archive intercept failed", error: e.message }));
    }

    return response;
  };
}

function deriveConversationId(request, body, options) {
  const url = new URL(request.url);
  const headerCid = request.headers.get("x-conversation-id");
  const queryCid = url.searchParams.get("conversation_id");
  const bodyCid = body?.conversation_id;
  return headerCid || bodyCid || queryCid || options.defaultConversationId || "default";
}

async function archiveChat(request, body, response, service, conversationId) {
  const deviceId = request.headers.get("x-device-id") || body?.device_id || null;
  const messages = body?.messages || [];
  const userMessage = typeof body.text === "string" ? { content: body.text } : messages.filter((m) => m.role === "user").pop();
  if (!userMessage) return;

  const cloned = response.clone ? response.clone() : response;
  let answer = { text: "" };
  try {
    answer = await cloned.json();
  } catch {
    return;
  }

  const ts = Date.now();
  await service.archiveMessage({
    conversationId,
    deviceId,
    role: "user",
    content: userMessage.content || "",
    attachments: body.attachments || null,
    model: answer.model || null,
    timestamp: ts,
    provenance: "chat",
    metadata: { request_path: "/api/chat" },
  });
  await service.archiveMessage({
    conversationId,
    deviceId,
    role: "assistant",
    content: answer.text || answer.response || answer.answer || "",
    model: answer.model || null,
    timestamp: ts + 1,
    provenance: "chat",
    metadata: { request_path: "/api/chat" },
  });
}

async function archiveProfessor(body, response, service, conversationId, request) {
  const deviceId = request.headers.get("x-device-id") || body?.device_id || null;
  const question = body?.question || "";
  const cloned = response.clone ? response.clone() : response;
  let answer = {};
  try {
    answer = await cloned.json();
  } catch {
    return;
  }
  const ts = Date.now();
  await service.archiveMessage({
    conversationId,
    deviceId,
    role: "user",
    content: question,
    timestamp: ts,
    provenance: "professor",
    metadata: { request_path: "/api/professor/ask", session_id: body?.session_id },
  });
  await service.archiveMessage({
    conversationId,
    deviceId,
    role: "assistant",
    content: answer.answer || answer.text || "",
    model: answer.model || null,
    capabilitiesUsed: answer.tools ? Object.keys(answer.tools) : null,
    timestamp: ts + 1,
    provenance: "professor",
    metadata: { request_path: "/api/professor/ask", session_id: body?.session_id },
  });
}
