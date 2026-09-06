import assert from "node:assert/strict";
import { copyFile, unlink } from "node:fs/promises";

const testWorker = "/tmp/meliturgos-chatgpt-import-test.mjs";
await copyFile(new URL("../worker.js", import.meta.url), testWorker);
const { default: worker } = await import("file://" + testWorker + "?v=" + Date.now());
const auth = "Basic " + Buffer.from("adrien:test").toString("base64");
const guard = "meliturgos-import-guard-2025";

const sqlLog = [];
const statementProto = {
  bind() { return this; },
  run: async () => ({ meta: { changes: 1, last_row_id: 7 } }),
  first: async () => ({ n: 0 }),
  all: async () => ({ results: [] }),
};

function env() {
  return {
    MELITURGOS_USER: "adrien",
    MELITURGOS_PASSWORD: "test",
    OWNER_NAME: "Adrien",
    CHATGPT_IMPORT_GUARD: guard,
    DB: {
      prepare(sql) {
        sqlLog.push(sql);
        const s = Object.create(statementProto);
        if (String(sql).includes("PRAGMA quick_check")) {
          s.first = async () => ({ quick_check: "ok" });
        }
        if (String(sql).includes("SELECT id FROM memories WHERE fingerprint")) {
          s.first = async () => null;
        }
        return s;
      },
      batch: async () => [],
    },
  };
}

async function call(path, body) {
  return worker.fetch(
    new Request("https://meliturgos.test" + path, {
      method: "POST",
      headers: { Authorization: auth, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env()
  );
}

const contextPayload = {
  entries: [
    { text: "Adrien préfère le thé au café.", kind: "preference", importance: 0.9, confidence: 0.95 },
    { text: "Projet MELITURGOS Gen2 démarré en septembre 2026.", kind: "project", importance: 0.85 },
    { text: "", kind: "fact" },
    { text: "sk-test1234567890123456789012345678901234567890abcdef", kind: "fact" },
  ],
  guard,
  simulation: true,
};

{
  const r1 = await call("/api/import/chatgpt-context", contextPayload);
  assert.equal(r1.status, 200);
  const b1 = await r1.json();
  assert.equal(b1.ok, true);
  assert.equal(b1.simulation, true);
  assert.equal(b1.total, 4);
  assert.equal(b1.inserted, 2);
  assert.equal(b1.rejected, 1);
  assert.equal(b1.skipped, 1);
  assert.equal(b1.confirmation_required, "CHATGPT_IMPORT_CONFIRM");
  assert.equal(b1.source, "chatgpt_context_summary");
}

{
  const r2 = await call("/api/import/chatgpt-context", { entries: [], guard });
  assert.equal(r2.status, 400);
  assert.equal((await r2.json()).code, "EMPTY_CHATGPT_IMPORT");
}

{
  const r3 = await call("/api/import/chatgpt-context", { entries: [{ text: "x" }] });
  assert.equal(r3.status, 403);
  assert.equal((await r3.json()).code, "IMPORT_GUARD_REQUIRED");
}

await unlink(testWorker);
console.log("chatgpt-context-import: simulation, validation, guard et rejet sécurisés validés");
