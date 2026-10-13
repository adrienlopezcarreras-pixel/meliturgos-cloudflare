import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const a=readFileSync('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLocalApkUpdate.kt','utf8');
const m=readFileSync('android-companion/app/src/main/AndroidManifest.xml','utf8');
const ui=readFileSync('android-companion/app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt','utf8');

test('MEL local update works without ADB and cannot silently install',()=>{
 assert.match(m,/android\.permission\.REQUEST_INSTALL_PACKAGES/);
 assert.match(a,/Activity/);
 assert.match(a,/ACTION_MANAGE_UNKNOWN_APP_SOURCES/);
 assert.match(a,/application\/vnd\.android\.package-archive/);
 assert.match(a,/Intent\.ACTION_VIEW/);
 assert.match(a,/FLAG_GRANT_READ_URI_PERMISSION/);
 assert.doesNotMatch(a,/adb install|pm install|su -c|INSTALL_PACKAGES|root shell/);
 assert.match(ui,/METTRE À JOUR MEL \(SANS DÉBOGAGE\)/);
 assert.match(ui,/ActivityResultContracts\.OpenDocument/);
 assert.match(ui,/MelLocalApkUpdate\.prepare/);
 assert.match(ui,/MelLocalApkUpdate\.requestInstaller/);
});
test('only same-app newer single-signer candidate passes the update stage',()=>{
 for(const needle of [
  'candidate.packageName == context.packageName',
  'candidateVersion > installedVersion',
  'installedSignatures?.size == 1',
  'candidateSignatures?.size == 1',
  'installedSignatures[0] == candidateSignatures[0]',
  'MessageDigest.getInstance("SHA-256")',
  'MAX_APK_BYTES', 'output.fd.sync()',
  'FileProvider.getUriForFile',
 ])assert.ok(a.includes(needle),needle);
 assert.match(a,/Dispatchers\.IO|prepare\(context: Context, source: Uri\)/);
 assert.match(ui,/withContext\(Dispatchers\.IO\)/);
 assert.match(a,/if \(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.O/);
 assert.match(a,/canRequestPackageInstalls\(\)/);
 assert.doesNotMatch(a,/Intent\.ACTION_DELETE|ACTION_UNINSTALL_PACKAGE|pm clear/);
});
