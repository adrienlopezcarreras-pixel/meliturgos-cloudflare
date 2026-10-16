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
  let completeTapSummary = false;
  let summaryCleanupTimer = null;
  let fileDeadlineTimer = null;
  let forceKillTimer = null;

  const inspectTapSummary = () => {
    const number = (pattern) => {
      const match = out.match(pattern);
      return match ? Number(match[1]) : null;
    };
    const tests = number(/^# tests (\d+)\s*$/m);
    const passed = number(/^# pass (\d+)\s*$/m);
    const failed = number(/^# fail (\d+)\s*$/m);
    const cancelled = number(/^# cancelled (\d+)\s*$/m);
    const skipped = number(/^# skipped (\d+)\s*$/m);
    const todo = number(/^# todo (\d+)\s*$/m);
    if ([tests, passed, failed, cancelled, skipped, todo].some(value => value === null)) return;
    completeTapSummary =
      failed === 0 && cancelled === 0 && passed + skipped + todo === tests;
    if (completeTapSummary && summaryCleanupTimer === null) {
      // Some tests can finish every assertion but leave a Node handle open.
      // Once the complete passing TAP summary is present, bounded cleanup lets
      // the serial suite continue without turning an assertion failure green.
      summaryCleanupTimer = setTimeout(() => {
        if (cp.exitCode === null && cp.signalCode === null) {
          console.warn(`⚠ ${file}: complete passing TAP summary but child remained alive; terminating leaked handle`);
          cp.kill("SIGTERM");
          forceKillTimer = setTimeout(() => {
            if (cp.exitCode === null && cp.signalCode === null) cp.kill("SIGKILL");
          }, 3000);
          forceKillTimer.unref?.();
        }
      }, 1500);
      summaryCleanupTimer.unref?.();
    }
  };

  const cleanup = () => {
    if (summaryCleanupTimer !== null) clearTimeout(summaryCleanupTimer);
    if (fileDeadlineTimer !== null) clearTimeout(fileDeadlineTimer);
    if (forceKillTimer !== null) clearTimeout(forceKillTimer);
  };

  cp.stdout.on("data", (b) => {
    const chunk = b.toString();
    out += chunk;
    process.stdout.write(b);
    inspectTapSummary();
  });
  cp.stderr.on("data", (b) => {
    const chunk = b.toString();
    out += chunk;
    process.stderr.write(b);
    inspectTapSummary();
  });

  // A file that never produces a complete TAP summary must fail, not hang the
  // production release indefinitely. Slower integration tests get 3 minutes.
  fileDeadlineTimer = setTimeout(() => {
    if (cp.exitCode === null && cp.signalCode === null) {
      console.error(`::error title=Test file timed out::${file} exceeded 180 seconds`);
      cp.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (cp.exitCode === null && cp.signalCode === null) cp.kill("SIGKILL");
      }, 3000);
      forceKillTimer.unref?.();
    }
  }, 180000);
  fileDeadlineTimer.unref?.();

  const closed = await new Promise((resolve, reject) => {
    cp.once("error", reject);
    cp.once("close", (code, signal) => resolve({ code, signal }));
  });
  cleanup();

  // A child killed only after a complete passing TAP summary is considered
  // assertion-successful; keep a warning in the logs for the handle leak.
  const rc = closed.code === 0 ||
    (completeTapSummary && closed.code === null && ["SIGTERM", "SIGKILL"].includes(closed.signal))
      ? 0
      : (closed.code ?? 1);
  return { file, rc, out, timed_out: !completeTapSummary && closed.code === null };
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
