#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function deploymentCandidates(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.deployments)) return raw.deployments;
  if (raw.deployment && typeof raw.deployment === 'object') return [raw.deployment];
  return [raw];
}

function versionsOf(deployment) {
  return asArray(deployment?.versions)
    .map((entry) => ({
      version_id: String(entry?.version_id || entry?.versionId || '').trim(),
      percentage: Number(entry?.percentage),
    }))
    .filter((entry) => entry.version_id && Number.isFinite(entry.percentage));
}

export function stableVersionId(raw) {
  const deployments = deploymentCandidates(raw);
  for (const deployment of deployments) {
    const versions = versionsOf(deployment);
    if (versions.length === 1 && versions[0].percentage === 100) return versions[0].version_id;
  }
  throw new Error('GEN2-53 requires exactly one production version at 100%; refusing to overlap another gradual deployment.');
}

export function uploadedVersionId(ndjsonText) {
  const events = String(ndjsonText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);

  const uploads = events.filter((event) => event.type === 'version-upload');
  const latest = uploads.at(-1);
  const id = String(latest?.version_id || latest?.data?.version_id || '').trim();
  if (!id) throw new Error('Wrangler did not emit a version-upload event with a version_id.');
  return id;
}

export function assertReleaseIdentity({ releaseSha, canonicalSha, branch }) {
  if (branch !== 'release/gen2-53-canary') {
    throw new Error(`GEN2-53 release must run from release/gen2-53-canary, got ${branch || '<empty>'}.`);
  }
  if (!releaseSha || !canonicalSha || releaseSha !== canonicalSha) {
    throw new Error(`GEN2-53 release SHA must equal the current canonical candidate SHA (${canonicalSha || '<empty>'}); got ${releaseSha || '<empty>'}.`);
  }
  return true;
}

async function main(argv) {
  const [command, ...args] = argv;
  if (command === 'stable-version') {
    const raw = JSON.parse(await readFile(args[0], 'utf8'));
    process.stdout.write(`${stableVersionId(raw)}\n`);
    return;
  }
  if (command === 'uploaded-version') {
    process.stdout.write(`${uploadedVersionId(await readFile(args[0], 'utf8'))}\n`);
    return;
  }
  if (command === 'assert-identity') {
    assertReleaseIdentity({ releaseSha: args[0], canonicalSha: args[1], branch: args[2] });
    process.stdout.write('GEN2-53 release identity verified.\n');
    return;
  }
  throw new Error('Usage: gen2-53-release-guard.mjs <stable-version JSON | uploaded-version NDJSON | assert-identity RELEASE_SHA CANONICAL_SHA BRANCH>');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
