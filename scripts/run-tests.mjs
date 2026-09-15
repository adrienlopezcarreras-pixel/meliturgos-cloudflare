import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

async function collectTests(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...await collectTests(absolute));
    } else if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
      found.push(absolute);
    }
  }
  return found;
}

const files = (await collectTests("tests"))
  .sort((a, b) => a.localeCompare(b));

let failures = 0;
let passed = 0;

async function runFile(file) {
  const cp = spawn(process.execPath, [file], {
    stdio: ["inherit", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-warnings",
      // The test suite uses mocked Workers AI bindings. This flag is consumed
      // only by Node test execution; production Worker environments cannot use
      // it to bypass the fail-closed zero-cost provenance requirement.
      MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS: "1",
    }
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
  return { file, rc, out };
}

for (const file of files) {
  const result = await runFile(file);
  const display = file.split(path.sep).join("/");
  if (result.rc === 0) {
    console.log(`✓ ${display}`);
    passed++;
  } else {
    console.log(`✗ ${display} (rc=${result.rc})`);
    failures++;
  }
}

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
