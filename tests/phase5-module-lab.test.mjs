// Module Lab Runner Tests - GEN2-16 - P5
// Tests E2E de l'exécution de modules

import { moduleRunner } from "../src/modules/module-runner.js";
import { json } from "../src/core/http.js";

// Test basic runner creation
export async function testModuleRunnerCreation() {
  console.log("[TEST] Module Runner Creation...");

  const { ModuleRunner } = await import("../src/modules/module-runner.js");
  const runner = new ModuleRunner({});
  
  if (!runner || typeof runner.run !== 'function') {
    throw new Error("ModuleRunner creation failed");
  }

  console.log("✓ ModuleRunner created successfully");
  return { success: true };
}

// Test Jira Create Task module
export async function testJiraCreateTaskModule() {
  console.log("[TEST] Jira Create Task module...");

  const { ModuleRunner } = await import("../src/modules/module-runner.js");
  const runner = new ModuleRunner({});
  const result = await runner.run('jira-create-task', {
    projectKey: 'TEST',
    summary: 'Test task from Module Lab',
    assignee: 'user@example.com',
    description: 'This is a test task created via Module Lab',
    priority: 'High',
    labels: ['automation', 'test']
  }, { userId: 'test-user' });

  if (!result.success) {
    throw new Error(`Module execution failed: ${result.error}`);
  }

  if (!result.metadata || !result.metadata.executionId) {
    throw new Error("Missing metadata in result");
  }

  console.log("✓ Jira Create Task module executed successfully");
  console.log(`  Execution ID: ${result.metadata.executionId}`);
  console.log(`  Duration: ${result.metadata.duration}ms`);
  return result;
}

// Test GitHub Create Issue module
export async function testGitHubCreateIssueModule() {
  console.log("[TEST] GitHub Create Issue module...");

  const { ModuleRunner } = await import("../src/modules/module-runner.js");
  const runner = new ModuleRunner({});
  const result = await runner.run('github-create-issue', {
    repo: 'test/repo',
    title: 'Test issue from Module Lab',
    body: 'This is a test issue created via Module Lab',
    labels: ['bug', 'automated'],
    assignees: ['user@example.com']
  }, { userId: 'test-user' });

  if (!result.success) {
    throw new Error(`Module execution failed: ${result.error}`);
  }

  console.log("✓ GitHub Create Issue module executed successfully");
  return result;
}

// Test Cloudflare R2 Upload module
export async function testCloudflareR2UploadModule() {
  console.log("[TEST] Cloudflare R2 Upload module...");

  const { ModuleRunner } = await import("../src/modules/module-runner.js");
  const runner = new ModuleRunner({});
  
  // Create a simple test payload
  const testPayload = JSON.stringify({ test: "module-lab" }).repeat(1000); // 2KB payload
  
  const result = await runner.run('cloudflare-r2-upload', {
    bucket: 'meliturgos-test',
    key: 'module-lab-test-upload',
    body: testPayload,
    contentType: 'application/json',
    contentEncoding: 'gzip'
  }, { userId: 'test-user' });

  if (!result.success) {
    throw new Error(`Module execution failed: ${result.error}`);
  }

  console.log("✓ Cloudflare R2 Upload module executed successfully");
  console.log(`  Location: ${result.output.location}`);
  return result;
}

// Test Cloudflare D1 Query module
export async function testCloudflareD1QueryModule() {
  console.log("[TEST] Cloudflare D1 Query module...");

  const { ModuleRunner } = await import("../src/modules/module-runner.js");
  const runner = new ModuleRunner({});
  const result = await runner.run('cloudflare-d1-query', {
    databaseId: 'test-db-id',
    sql: 'SELECT COUNT(*) as count FROM test_table LIMIT 1',
    params: []
  }, { userId: 'test-user' });

  if (!result.success) {
    throw new Error(`Module execution failed: ${result.error}`);
  }

  console.log("✓ Cloudflare D1 Query module executed successfully");
  return result;
}

// Test module lookup
export async function testModuleLookup() {
  console.log("[TEST] Module Lookup...");

  const { ModuleRunner } = await import("../src/modules/module-runner.js");
  const runner = new ModuleRunner({});
  
  // Try to get module definition
  const moduleDef = runner._getModuleDefinition('jira-create-task');
  
  if (!moduleDef || !moduleDef.name) {
    throw new Error("Module definition not found");
  }

  console.log(`✓ Module lookup successful: ${moduleDef.name}`);
  console.log(`  Type: ${moduleDef.type}`);
  console.log(`  Required params: ${moduleDef.requiredParams.join(', ')}`);
  
  // Test unknown module
  try {
    runner._getModuleDefinition('nonexistent-module');
    throw new Error("Should have thrown error for unknown module");
  } catch (error) {
    if (error.message.includes("Unknown module")) {
      console.log("✓ Unknown module throws error correctly");
    } else {
      throw error;
    }
  }

  return { success: true, moduleDef };
}

// Test parameter validation
export async function testParameterValidation() {
  console.log("[TEST] Parameter Validation...");

  const { ModuleRunner } = await import("../src/modules/module-runner.js");
  const runner = new ModuleRunner({});

  // Missing required parameter
  try {
    await runner.run('jira-create-task', {
      projectKey: 'TEST'
      // Missing summary
    }, { userId: 'test-user' });
    
    throw new Error("Should have thrown validation error");
  } catch (error) {
    if (error.message.includes("Missing required parameters")) {
      console.log("✓ Parameter validation works correctly");
    } else {
      throw error;
    }
  }

  return { success: true };
}

// Run all tests
export async function runAllModuleLabTests() {
  console.log("\n" + "=".repeat(60));
  console.log("MOULE LAB RUNNER TESTS");
  console.log("=".repeat(60) + "\n");

  const tests = [
    { name: "Module Runner Creation", fn: testModuleRunnerCreation },
    { name: "Module Lookup", fn: testModuleLookup },
    { name: "Parameter Validation", fn: testParameterValidation },
    { name: "Jira Create Task", fn: testJiraCreateTaskModule },
    { name: "GitHub Create Issue", fn: testGitHubCreateIssueModule },
    { name: "Cloudflare R2 Upload", fn: testCloudflareR2UploadModule },
    { name: "Cloudflare D1 Query", fn: testCloudflareD1QueryModule },
  ];

  const results = [];

  for (const test of tests) {
    try {
      console.log(`\n➜ ${test.name}`);
      await test.fn();
      results.push({ test: test.name, status: "passed" });
    } catch (error) {
      console.error(`\n✗ ${test.name} FAILED:`, error.message);
      results.push({ test: test.name, status: "failed", error: error.message });
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));
  
  const passed = results.filter(r => r.status === "passed").length;
  const failed = results.filter(r => r.status === "failed").length;

  results.forEach(r => {
    const icon = r.status === "passed" ? "✓" : "✗";
    console.log(`${icon} ${r.test}${r.status === "failed" ? ` - ${r.error}` : ""}`);
  });

  console.log(`\nPassed: ${passed}/${tests.length}`);
  console.log(`Failed: ${failed}/${tests.length}`);

  if (failed > 0) {
    throw new Error(`${failed} test(s) failed`);
  }

  console.log("\n✓ All Module Lab tests passed!");
  console.log("=".repeat(60) + "\n");
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllModuleLabTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nTests failed:", error.message);
      process.exit(1);
    });
}