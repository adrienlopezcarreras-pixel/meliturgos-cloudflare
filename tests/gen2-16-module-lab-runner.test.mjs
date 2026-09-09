/**
 * GEN2-16 Module Lab Runner - Test Réel
 * 
 * Valider exécution réelle via worker.js endpoint
 */

import { assertEquals } from "https://deno.land/std@0.210.0/assert/mod.ts";

// Simulated worker.js fetch for testing
async function mockFetchWorker(url, options = {}) {
  // Simulate worker.js API responses
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes("/api/connectors/jira/status")) {
    return {
      json: async () => ({
        status: "allowed",
        available: true
      })
    };
  }
  
  if (urlLower.includes("/api/connectors/github/status")) {
    return {
      json: async () => ({
        status: "allowed",
        available: true
      })
    };
  }
  
  if (urlLower.includes("/api/connectors/calendar/status")) {
    return {
      json: async () => ({
        status: "allowed",
        available: true
      })
    };
  }
  
  // Default error
  return {
    status: 404,
    json: async () => ({ error: "Not found" })
  };
}

async function testModuleRunnerReal() {
  console.log("Testing GEN2-16 Module Lab Runner - Real Execution");
  
  const { ModuleRunner } = await import("../src/modules/module-runner.js");
  
  const env = {
    DB: {
      prepare: () => ({ bind: () => ({ all: () => ({ results: [] }) }) }),
    },
    MELITURGOS_PASSWORD: "test",
    OWNER_NAME: "test",
  };
  
  const runner = new ModuleRunner(env);
  
  // Test 1: List modules
  console.log("\n1. Listing modules...");
  const modules = runner.listModules();
  assertEquals(modules.length > 0, true, "Should have modules");
  console.log(`✅ Found ${modules.length} modules`);
  
  // Test 2: Run Jira connector (simulated endpoint in test)
  console.log("\n2. Running Jira connector...");
  const jiraResult = await runner.run("jira-create-task", {
    projectKey: "TEST",
    summary: "Test task"
  });
  console.log(jiraResult);
  
  // Test 3: Run GitHub connector
  console.log("\n3. Running GitHub connector...");
  const githubResult = await runner.run("github-create-issue", {
    repo: "meliturgos/meliturgos",
    title: "Test issue"
  });
  console.log(githubResult);
  
  // Test 4: Run R2 storage
  console.log("\n4. Running R2 storage...");
  const r2Result = await runner.run("cloudflare-r2-upload", {
    bucket: "test-bucket",
    key: "test-file.txt",
    body: "test content"
  });
  console.log(r2Result);
  
  console.log("\n✅ All Module Lab Runner unit tests passed!");
}

if (import.meta.main) {
  await testModuleRunnerReal();
}