import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readWorkflow = (file) =>
  readFile(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8');

test('MINI publishing is manual-only, pinned to main and explicitly approved', async () => {
  const publish = await readWorkflow('publish-waveshare-firmware.yml');
  assert.match(publish, /on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(publish, /\n\s*push:\s*\n/);
  assert.match(publish, /test "\$GITHUB_EVENT_NAME" = "workflow_dispatch"/);
  assert.match(publish, /test "\$GITHUB_REF_NAME" = "main"/);
  assert.match(publish, /test "\$APPROVAL" = "PUBLISH_FIRMWARE"/);
  assert.match(publish, /git merge-base --is-ancestor "\$EXPECTED_SHA" FETCH_HEAD/);
});

test('MINI publishing fails closed if built binary hashes differ from approved hashes', async () => {
  const publish = await readWorkflow('publish-waveshare-firmware.yml');
  assert.match(publish, /expected_ota_sha256:/);
  assert.match(publish, /expected_installer_sha256:/);
  assert.match(publish, /test "\$OTA_SHA256" = "\$EXPECTED_OTA_SHA256"/);
  assert.match(publish, /test "\$INSTALL_SHA256" = "\$EXPECTED_INSTALLER_SHA256"/);
  assert.ok(
    publish.indexOf('test "$OTA_SHA256" = "$EXPECTED_OTA_SHA256"') <
      publish.indexOf('Upload OTA app image first'),
  );
  assert.ok(
    publish.indexOf('test "$INSTALL_SHA256" = "$EXPECTED_INSTALLER_SHA256"') <
      publish.indexOf('Upload USB first-install image'),
  );
});

test('MINI CI artifacts are candidate-only, provenance-bound and checksum verified', async () => {
  const build = await readWorkflow('waveshare-terminal-firmware.yml');
  assert.match(build, /SOURCE_SHA="\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}"/);
  assert.match(build, /"source_sha": "\$\{SOURCE_SHA\}"/);
  assert.match(build, /"build_sha": "\$\{BUILD_SHA\}"/);
  assert.match(build, /"channel": "candidate"/);
  assert.match(build, /"available": false/);
  assert.match(build, /Candidate binary SHA-256 and lengths verified/);
  assert.match(build, /sha256sum -c \.\.\/SHA256SUMS\.txt/);
});
