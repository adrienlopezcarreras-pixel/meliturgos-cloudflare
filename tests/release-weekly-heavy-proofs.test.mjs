import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Owner rule (25/10): browser/file/downstream proofs cost Browser Run hours and
// Workers AI neurons; they run on the first release of each UTC week only.
test('heavy release proofs run on the first release of the week only', () => {
  const wf = readFileSync('.github/workflows/deploy-cloudflare-release.yml', 'utf8');
  const decide = wf.indexOf('- name: Decide weekly heavy release proofs');
  assert.ok(decide > 0);
  assert.match(wf, /status=success&created=>=\$MONDAY/);
  for (const name of ['Prove MEL-MEDIA-02 12/12 live on exact deployed SHA', 'Upload MEL-MEDIA-02 exact-SHA evidence', 'Dispatch decoupled downstream production proofs', 'Prove real production browser.execute', 'Prove MEL-FILE-01 in real production browser', 'Upload MEL-FILE-01 production proof']) {
    const at = wf.indexOf('- name: ' + name);
    assert.ok(at > decide, name);
    assert.match(wf.slice(at, at + 200), /if: (always\(\) && )?env\.HEAVY_PROOFS == 'true'/, name);
  }
});
