import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";

const files = (await readdir("tests"))
  .filter((f) => f.endsWith(".test.mjs"))
  .sort();

let failures = 0;
let passed = 0;

async function runFile(f) {
  const cp = spawn(process.execPath, ["tests/" + f], {
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, NODE_OPTIONS: "--no-warnings" }
  });
  let out = "";
  cp.stdout.on("data", (b) => {
    out += b.toString();
    process.stdout.write(b);
  });
  cp.stderr.on("data", (b) => {
    out += b.toString();
    process.stderr.write(b);
  });
  const rc = await new Promise((resolve) => cp.on("close", resolve));
  return { file: f, rc, out };
}

for (const f of files) {
  const result = await runFile(f);
  if (result.rc === 0) {
    console.log(`✓ ${f}`);
    passed++;
  } else {
    console.log(`✗ ${f} (rc=${result.rc})`);
    failures++;
  }
}

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
