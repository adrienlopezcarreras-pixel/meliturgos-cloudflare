import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { ROADMAP_CODE_CONTRACTS } from '../src/roadmap/roadmap-code-contracts.js';

const sha = text => createHash('sha256').update(text).digest('hex');
const packages = fs.existsSync('prepared') ? fs.readdirSync('prepared').filter(f => f.endsWith('.json')) : [];

// A prepared package must stay applicable: every file is in its contract and
// either still matches the recorded base or is already delivered.
test('prepared mission packages target their contract and a live base', () => {
  for (const file of packages) {
    const pkg = JSON.parse(fs.readFileSync(`prepared/${file}`, 'utf8'));
    const contract = ROADMAP_CODE_CONTRACTS[pkg.roadmap_id];
    assert.ok(contract, file);
    assert.equal(file, `${pkg.roadmap_id}.json`);
    assert.ok(pkg.changes.some(c => contract.code_paths.includes(c.path)), `${file} changes no code path`);
    assert.ok(pkg.changes.some(c => contract.test_paths.includes(c.path)), `${file} ships no regression test`);
    for (const change of pkg.changes) {
      assert.ok([...contract.code_paths, ...contract.test_paths].includes(change.path), change.path);
      const current = fs.existsSync(change.path) ? fs.readFileSync(change.path, 'utf8') : null;
      const live = current === null ? change.base_sha256 === 'new' : (sha(current) === change.base_sha256 || current === change.content);
      assert.ok(live, `${file}: ${change.path} base changed — rebuild the package`);
    }
  }
});

test('the bridge preparer exposes the prepared-package path', async () => {
  const { preparedMissionPackage } = await import('../src/evolution/autonomy-bridge-preparer.js');
  assert.equal(typeof preparedMissionPackage, 'function');
  assert.equal(await preparedMissionPackage({}, {}, { optional_context: { roadmap_id: 'NOT-A-CONTRACT' } }), null);
});

test('a failed prepared package is not reapplied, but a revised one is', async () => {
  const source = fs.readFileSync('src/evolution/autonomy-bridge-preparer.js', 'utf8');
  assert.match(source, /package_sha256: await sha256Hex\(JSON\.stringify\(pkg\.changes\)\)/);
  assert.match(source, /lastPrepared\?\.package_sha256 === candidatePackage\?\.proposal\?\.provenance\?\.package_sha256 \? null : candidatePackage/);
});


test('building a package over a file another pending package owns is refused', () => {
  const source = fs.readFileSync('scripts/prepare-mission.mjs', 'utf8');
  // The collision is caught where it is cheap, not in the candidate CI.
  assert.match(source, /PREPARED_PACKAGE_FILE_COLLISION/);
  assert.match(source, /PREPARE_ALLOW_COLLISION/);
  // A package already identical to main is delivered and must not block.
  assert.match(source, /base !== null && base === change\.content/);
});

// 01/11: a package partially applied to the candidate could never re-apply,
// so the mission fell back to the Mentor at every tick.
test('a prepared package still applies when one of its files is already in the target state', async () => {
  const source = await (await import('node:fs/promises')).readFile('src/evolution/autonomy-bridge-preparer.js', 'utf8');
  assert.match(source, /const applied = base === String\(change\.content \|\| ''\);/);
  assert.match(source, /if \(!applied && String\(change\.base_sha256/);

  const { preparedMissionPackage } = await import('../src/evolution/autonomy-bridge-preparer.js');
  const { ROADMAP_CODE_CONTRACTS } = await import('../src/roadmap/roadmap-code-contracts.js');
  const id = Object.keys(ROADMAP_CODE_CONTRACTS)[0];
  const contract = ROADMAP_CODE_CONTRACTS[id];
  const codePath = contract.code_paths[0];
  const testPath = contract.test_paths[0];
  const pkg = { roadmap_id: id, summary: 's', tests: ['test'], changes: [
    { path: codePath, base_sha256: 'new', content: 'CODE_CIBLE' },
    // Already applied on the candidate, with a base that no longer matches.
    { path: testPath, base_sha256: 'f'.repeat(64), content: 'TEST_DEJA_APPLIQUE' },
  ] };
  // Only the package itself is fetched; the candidate files come from inspectedFiles.
  const fetchImpl = async url => {
    if (String(url).includes(encodeURIComponent(`prepared/${id}.json`).replace(/%2F/g, '/')) || String(url).includes('prepared')) {
      const body = JSON.stringify(pkg);
      return Response.json({ type: 'file', sha: 'a'.repeat(40), size: body.length, content: Buffer.from(body).toString('base64') });
    }
    return new Response('', { status: 404 });
  };
  const code = { repository: 'o/r', branch: 'candidate/x', candidate_sha: 'c'.repeat(40) };
  const job = { optional_context: { roadmap_id: id } };

  const ok = await preparedMissionPackage({}, code, job, [{ path: testPath, content: 'TEST_DEJA_APPLIQUE' }], fetchImpl);
  assert.ok(ok, 'the package applies despite the already-applied file');
  assert.equal(ok.proposal.changes.length, 2);
  assert.equal(ok.proposal.provenance.source, 'prepared-package');

  // A file drifted to something ELSE is still refused: the guard holds.
  const drifted = await preparedMissionPackage({}, code, job, [{ path: testPath, content: 'AUTRE_CHOSE' }], fetchImpl);
  assert.equal(drifted, null);
});
