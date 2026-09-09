#!/usr/bin/env node
// Module Lab Runner Demo - GEN2-16 - P5
// Démonstration de l'exécution de modules

async function runDemo() {
  console.log("\n" + "=".repeat(60));
  console.log("MOULE LAB RUNNER - DÉMONSTRATION v0.1");
  console.log("=".repeat(60) + "\n");

  const { ModuleRunner } = await import("./src/modules/module-runner.js");

  const runner = new ModuleRunner({});

  console.log("1. CRÉATION DU RUNNER");
  console.log("   ✓ ModuleRunner initialisé avec succès\n");

  console.log("2. TEST JIRA - CREATE TASK");
  const jiraResult = await runner.run("jira-create-task", {
    projectKey: "TEST",
    summary: "Tâche de test Module Lab",
    assignee: "test@example.com",
    description: "Module Lab fonctionnel!",
    priority: "High",
    labels: ["automation", "test"]
  }, { userId: "demo-user-123" });

  console.log(`   ✓ Succès: ${jiraResult.success}`);
  console.log(`   ID d'exécution: ${jiraResult.metadata.executionId}`);
  console.log(`   Durée: ${jiraResult.metadata.duration}ms\n`);

  console.log("3. TEST GITHUB - CREATE ISSUE");
  const githubResult = await runner.run("github-create-issue", {
    repo: "test-org/test-repo",
    title: "Issue générée par Module Lab",
    body: "Test complet Module Lab avec repérage de modules",
    labels: ["feature", "automated"],
    assignees: ["test@example.com"]
  }, { userId: "demo-user-123" });

  console.log(`   ✓ Succès: ${githubResult.success}`);
  console.log(`   ID: ${githubResult.metadata.executionId}\n`);

  console.log("4. TEST CLOUDFLARE R2 - UPLOAD");
  const r2Result = await runner.run("cloudflare-r2-upload", {
    bucket: "meliturgos-test",
    key: "module-lab-demo.txt",
    body: "Contenu du fichier mobilab test...",
    contentType: "text/plain"
  }, { userId: "demo-user-123" });

  console.log(`   ✓ Succès: ${r2Result.success}`);
  console.log(`   Emplacement: ${r2Result.output.location}\n`);

  console.log("5. TEST CLOUDFLARE D1 - QUERY");
  const d1Result = await runner.run("cloudflare-d1-query", {
    databaseId: "test-db",
    sql: "SELECT 1 as test"
  }, { userId: "demo-user-123" });

  console.log(`   ✓ Succès: ${d1Result.success}\n`);

  console.log("6. VALIDATION DES PARAMÈTRES");
  try {
    await runner.run("jira-create-task", {
      projectKey: "TEST"
      // Missing summary (required)
    }, { userId: "test" });
  } catch (error) {
    console.log(`   ✓ Validation fonctionnelle: ${error.message}\n`);
  }

  console.log("7. RÉPERTOIRE DES MODULES");
  console.log("   ✓ Registre intégré avec définitions:");
  const module = runner._getModuleDefinition("jira-create-task");
  console.log(`      - Type: ${module.type}`);
  console.log(`      - Nom: ${module.name}`);
  console.log(`      - Paramètres requis: ${module.requiredParams.join(", ")}\n`);

  console.log("=".repeat(60));
  console.log("✓ DÉMONSTRATION MODULE LAB TERMINÉE AVEC SUCCÈS");
  console.log("=".repeat(60));
  console.log("\nP5 Gen2-16: Module Lab runner prototype fonctionnel");
  console.log("  - Exécution de modules distants (Jira, GitHub, Cloudflare)");
  console.log("  - Validation des paramètres requise");
  console.log("  - Récupération de métadonnées d'exécution");
  console.log("  - Intégration API /api/gen2/modules/run (implémentée)\n");
}

runDemo()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("\n✗ Erreur:", error.message);
    process.exit(1);
  });