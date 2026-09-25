import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('GEN2-59 build uses canonical Windows assets and exact source SHA', async () => {
  const build = await read('scripts/build-windows-release.ps1');
  assert.match(build, /assets/);
  assert.match(build, /MEL-Computer-Setup\.ps1/);
  assert.match(build, /MEL-Computer-Companion\.ps1/);
  assert.match(build, /WINDOWS_RELEASE_SHA_INVALID/);
  assert.match(build, /release-manifest\.json/);
  assert.match(build, /Get-FileHash -Algorithm SHA256/);
  assert.match(build, /mel\.windows-release-manifest\.v1/);
  assert.match(build, /LastWriteTime = \$epoch/);
  assert.doesNotMatch(build, /dist\/MEL-Computer/);
});

test('GEN2-59 signing is secret-backed and happens before release hashing', async () => {
  const build = await read('scripts/build-windows-release.ps1');
  const sign = await read('scripts/sign-windows-release.ps1');
  assert.match(build, /MEL_WINDOWS_SIGNING_PFX_BASE64/);
  assert.match(build, /MEL_WINDOWS_SIGNING_PFX_PASSWORD/);
  assert.ok(build.indexOf('sign-windows-release.ps1') < build.indexOf('$manifestFiles = @()'));
  assert.match(sign, /Set-AuthenticodeSignature/);
  assert.match(sign, /EphemeralKeySet/);
  assert.match(sign, /WINDOWS_SIGN_PRIVATE_KEY_MISSING/);
  assert.match(sign, /Remove-Item -Force \$tempPfx/);
});

test('GEN2-59 verifier fails closed on package, manifest and file checksum drift', async () => {
  const verify = await read('scripts/verify-windows-release.ps1');
  assert.match(verify, /WINDOWS_PACKAGE_CHECKSUM_MISMATCH/);
  assert.match(verify, /WINDOWS_MANIFEST_SHA_MISMATCH/);
  assert.match(verify, /WINDOWS_MANIFEST_FILE_HASH_MISMATCH/);
  assert.match(verify, /WINDOWS_RELEASE_VERIFIED/);
});

test('GEN2-59 workflow packages on windows-latest and requires exact SHA for manual release', async () => {
  const workflow = await read('.github/workflows/windows-release-build.yml');
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /expected_sha:/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /WINDOWS_RELEASE_EXACT_SHA_MISMATCH/);
  assert.match(workflow, /MEL_WINDOWS_SIGNING_PFX_BASE64/);
  assert.match(workflow, /MEL_WINDOWS_SIGNING_PFX_PASSWORD/);
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /actions\/upload-artifact@/);
  assert.doesNotMatch(workflow, /android-companion/);
});
