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

test('MINI preserves and verifies predecessor and remote archive before replacing active firmware', async () => {
  const publish = await readWorkflow('publish-waveshare-firmware.yml');
  const archive = publish.indexOf('Preserve and verify previous 0.6.17 release before replacement');
  const upload = publish.indexOf('Upload OTA app image first');
  assert.ok(archive > 0 && upload > archive, 'preservation must precede any active overwrite');
  assert.match(publish, /verify-previous-release\.mjs previous-mini\/manifest\.json/);
  assert.match(publish, /archive\/0\.6\.17/);
  assert.match(publish, /cmp "previous-mini\/\$file" "restore-drill\/\$file"/);
  assert.match(publish, /verify-previous-release\.mjs restore-drill\/manifest\.json/);
  assert.doesNotMatch(publish, /erase_flash/);
});
