/**
 * P0 Interface Principale - Tests Critiques
 * GEN2-26: Extraire ROOT_PAGE inline vers src/pages/index.html et câbler route
 */

import { assertEquals } from "https://deno.land/std@0.210.0/assert/mod.ts";

const { Hono } = await import("https://deno.land/x/hono/mod.ts");

// Import router from parallel test context
async function loadRouter() {
  const { default: router } = await import("../src/router.js");
  return router;
}

async function testInterfaceServesHTML() {
  console.log("Testing P0 Interface - Source extraction and route cabling");
  const router = await loadRouter();
  
  const env = {
    DB: {
      prepare: () => ({ bind: () => ({ all: () => ({ results: [] }) }) }),
    },
    MELITURGOS_PASSWORD: "test",
    OWNER_NAME: "test",
  };

  const request = new Request("http://localhost/");
  const response = await router.fetch(request, env);

  assertEquals(response.status, 200, "Should return 200 OK");
  const contentType = response.headers.get("Content-Type");
  assertEquals(contentType, "text/html; charset=utf-8", "Should serve HTML");
  
  const html = await response.text();
  assertTrue(html.includes("<!doctype html>"), "Should contain doctype");
  assertTrue(html.includes("<title>MELITURGOS</title>"), "Should contain title");
  assertTrue(html.includes("Votre espace de conversation et de mémoire"), "Should contain welcome text");
  assertTrue(html.includes('<main>'), "Should contain main element");
  assertTrue(html.includes("<script>"), "Should contain JavaScript");
  assertTrue(html.includes("document.querySelector('#chat')"), "Should have basic chat functionality");
  
  console.log("✅ Interface HTML correctly extracted and served");
}

async function testHTMLContainsRequiredElements() {
  router = await loadRouter();
  const env = {
    DB: {
      prepare: () => ({ bind: () => ({ all: () => ({ results: [] }) }) }),
    },
    MELITURGOS_PASSWORD: "test",
    OWNER_NAME: "test",
  };

  const request = new Request("http://localhost/");
  const response = await router.fetch(request, env);
  const html = await response.text();

  // Critical elements that must exist for chat functionality
  const requiredIds = [
    "#chat", "#question", "#form", "#status", "#info",
    "#memory", "#diagnostic", "#backup", "#mic-start", "#mic-stop",
  ];

  for (const selector of requiredIds) {
    assertTrue(html.includes(selector), `Required element ${selector} missing`);
  }

  console.log("✅ All required HTML elements present");
}

async function testHTMLHasMinimalInlineScript() {
  router = await loadRouter();
  const env = {
    DB: {
      prepare: () => ({ bind: () => ({ all: () => ({ results: [] }) }) }),
    },
    MELITURGOS_PASSWORD: "test",
    OWNER_NAME: "test",
  };

  const request = new Request("http://localhost/");
  const response = await router.fetch(request, env);
  const html = await response.text();

  const inlineScript = html.match(/<script>\(function\(\)\{[^<]*\}\)\(<\/script>\)/);
  assertTrue(inlineScript !== null, "Should have critical inline script for chat functionality");

  // Script must contain essential functions
  const scriptContent = inlineScript[0];
  assertTrue(scriptContent.includes("document.querySelector('#chat')"), "Script should have chat selector");
  assertTrue(scriptContent.includes("addEventListener('keydown'"), "Script should handle Enter key");
  assertTrue(scriptContent.includes("api('/api/chat'"), "Script should call chat endpoint");

  console.log("✅ Inline script contains critical chat functionality");
}

async function testProfessorRouteNotBroken() {
  router = await loadRouter();
  
  const env = {
    DB: {
      prepare: () => ({ bind: () => ({ all: () => ({ results: [] }) }) }),
    },
    MELITURGOS_PASSWORD: "test",
    OWNER_NAME: "test",
    PROFESSOR_PAGE_V5_CLASSIC: "<h1>Professor Page</h1>",
  };

  // Test professor route redirects or serves correctly
  const request = new Request("http://localhost/professor");
  const response = await router.fetch(request, env);

  assertEquals(response.status, 200, "Professor route should respond");
  // The route should either serve professor page or redirect to it
  const contentType = response.headers.get("Content-Type");
  assertEquals(contentType === "text/html" || contentType === "text/plain", true, "Should serve HTML or plain text");

  console.log("✅ Professor route not broken by P0 changes");
}

// Helper functions
function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

// Run all tests
async function runAll() {
  console.log("\n=== P0 Interface Principal Tests ===\n");
  
  await testInterfaceServesHTML();
  await testHTMLContainsRequiredElements();
  await testHTMLHasMinimalInlineScript();
  await testProfessorRouteNotBroken();
  
  console.log("\n=== ✅ All P0 Interface Tests Passed ===\n");
}

if (import.meta.main) {
  await runAll();
}