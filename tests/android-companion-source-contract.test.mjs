import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../android-companion/',import.meta.url);

test('Android app uses Compose Material 3 instead of the former imperative minimal Activity',async()=>{
  const build=await readFile(new URL('app/build.gradle.kts',root),'utf8');
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  assert.match(build,/compose\s*=\s*true/);
  assert.match(build,/compose-bom:2025\.06\.01/);
  assert.match(build,/androidx\.compose\.material3:material3/);
  assert.match(activity,/setContent\s*\{/);
  assert.match(activity,/MaterialTheme/);
  assert.match(activity,/ModeSelector/);
  assert.doesNotMatch(activity,/LinearLayout\(/);
  assert.doesNotMatch(activity,/setContentView\(/);
});

test('Android client forbids cleartext transport and declares a domain security config',async()=>{
  const manifest=await readFile(new URL('app/src/main/AndroidManifest.xml',root),'utf8');
  const network=await readFile(new URL('app/src/main/res/xml/network_security_config.xml',root),'utf8');
  assert.match(manifest,/android\.permission\.INTERNET/);
  assert.match(manifest,/android\.permission\.RECORD_AUDIO/);
  assert.match(manifest,/android:usesCleartextTraffic="false"/);
  assert.match(manifest,/android:networkSecurityConfig="@xml\/network_security_config"/);
  assert.match(manifest,/android:allowBackup="false"/);
  assert.match(network,/cleartextTrafficPermitted="false"/);
  assert.match(network,/meliturgos\.adrien-lopezcarreras\.workers\.dev/);
});

test('Android token is encrypted with Android Keystore and owner password is never persisted',async()=>{
  const vault=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/TokenVault.kt',root),'utf8');
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  assert.match(vault,/AndroidKeyStore/);
  assert.match(vault,/AES\/GCM\/NoPadding/);
  assert.match(vault,/PURPOSE_ENCRYPT/);
  assert.match(api,/require\(baseUrl\.startsWith\("https:\/\/"\)\)/);
  assert.match(api,/Authorization", "Bearer \$token"/);
  assert.match(api,/\/api\/android\/v1\/pair-code/);
  assert.match(api,/Authorization", "Basic \$credentials"/);
  assert.match(api,/Authorization", "Bearer \$password"/);
  assert.doesNotMatch(vault,/password/i);
  assert.doesNotMatch(vault,/owner/i);
  assert.doesNotMatch(vm,/putString\([^\n]*password/i);
});

test('pairing is not considered connected until a device-token heartbeat succeeds',async()=>{
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  const pairing=vm.slice(vm.indexOf('fun pair('),vm.indexOf('fun disconnect('));
  assert.match(pairing,/pairWithOwnerCredentials/);
  assert.match(pairing,/client\.heartbeat/);
  assert.ok(pairing.indexOf('client.heartbeat') < pairing.indexOf('SessionStage.CONNECTED'));
  assert.match(pairing,/vault\.clear\(\)/);
});

test('Normal and Complete are visible app modes and are sent to MEL chat',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');
  assert.match(vm,/NORMAL\("normal", "Normal"\)/);
  assert.match(vm,/COMPLETE\("complete", "Complet"\)/);
  assert.match(activity,/Mode Normal/);
  assert.match(activity,/Mode Complet/);
  assert.match(activity,/CompletePanel/);
  assert.match(api,/\.put\("ui_mode", mode\)/);
  assert.match(api,/uiMode: String = "normal"/);
});

test('Android app exposes native file selection and a useful Complete control surface',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  assert.match(activity,/ActivityResultContracts\.OpenDocument/);
  assert.match(activity,/Text\("Fichier"\)/);
  assert.match(activity,/Text\("Professor"\)/);
  assert.match(activity,/\/professor/);
  assert.match(api,/fun uploadFile\(/);
  assert.match(api,/\/api\/android\/v1\/files\/upload/);
  assert.match(vm,/fun sendFile\(/);
  assert.match(vm,/Aucun texte directement extractible/);
  assert.match(vm,/localTextPreview/);
  assert.match(vm,/ANDROID_FILE_BACKEND_UPDATE_REQUIRED/);
  assert.match(vm,/512_000/);
});

test('Android native client exposes pairing chat sync ACK voice and file transports',async()=>{
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');
  const routes=[
    '/api/android/v1/pair',
    '/api/android/v1/heartbeat',
    '/api/android/v1/chat',
    '/api/android/v1/sync?conversation_id=',
    '/api/android/v1/sync/ack',
    '/api/android/v1/voice/transcribe',
    '/api/android/v1/files/upload'
  ];
  for(const route of routes) assert.ok(api.includes(route),route);
});


test('Android app surfaces the native MEL avatar in launcher and Compose UI',async()=>{
  const manifest=await readFile(new URL('app/src/main/AndroidManifest.xml',root),'utf8');
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const avatar=await readFile(new URL('app/src/main/res/drawable/ic_mel_avatar.xml',root),'utf8');
  assert.match(manifest,/android:icon="@drawable\/ic_mel_avatar"/);
  assert.match(manifest,/android:roundIcon="@drawable\/ic_mel_avatar"/);
  assert.match(activity,/painterResource\(R\.drawable\.ic_mel_avatar\)/);
  assert.match(activity,/MelAvatar\(/);
  assert.match(avatar,/#22D3EE/);
  assert.match(avatar,/#3B241B/);
});

test('signed Android release pipeline is secret-backed fail-closed and verifies the APK signature',async()=>{
  const build=await readFile(new URL('app/build.gradle.kts',root),'utf8');
  const workflow=await readFile(new URL('../.github/workflows/android-release-build.yml',import.meta.url),'utf8');
  assert.match(build,/ANDROID_KEYSTORE_PATH/);
  assert.match(build,/ANDROID_KEYSTORE_PASSWORD/);
  assert.match(build,/ANDROID_KEY_ALIAS/);
  assert.match(build,/ANDROID_KEY_PASSWORD/);
  assert.match(build,/enableV2Signing\s*=\s*true/);
  assert.match(workflow,/secrets\.ANDROID_KEYSTORE_BASE64/);
  assert.match(workflow,/secrets\.ANDROID_KEYSTORE_PASSWORD/);
  assert.match(workflow,/secrets\.ANDROID_KEY_ALIAS/);
  assert.match(workflow,/secrets\.ANDROID_KEY_PASSWORD/);
  assert.match(workflow,/base64 --decode/);
  assert.match(workflow,/apksigner.*verify/);
  assert.match(workflow,/zipalign.*-c/);
  assert.match(workflow,/release\/mel-hardware-v0\.1\.0/);
  assert.match(workflow,/git fetch --no-tags origin release\/mel-hardware-v0\.1\.0/);
  assert.match(workflow,/EXPECTED_SHA=.*origin\/release\/mel-hardware-v0\.1\.0/);
  assert.match(workflow,/ACTUAL_SHA=.*git rev-parse HEAD/);
  assert.match(workflow,/ACTUAL_SHA.*EXPECTED_SHA/);
  assert.match(workflow,/Remove signing material/);
});


test('Android background heartbeat uses WorkManager without hidden background microphone capture',async()=>{
  const build=await readFile(new URL('app/build.gradle.kts',root),'utf8');
  const manifest=await readFile(new URL('app/src/main/AndroidManifest.xml',root),'utf8');
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  const background=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelBackground.kt',root),'utf8');
  assert.match(build,/androidx\.work:work-runtime-ktx:2\.11\.2/);
  assert.match(manifest,/android\.permission\.POST_NOTIFICATIONS/);
  assert.match(background,/PeriodicWorkRequestBuilder<MelHeartbeatWorker>/);
  assert.match(background,/15,\s*TimeUnit\.MINUTES/);
  assert.match(background,/NetworkType\.CONNECTED/);
  assert.match(background,/ExistingPeriodicWorkPolicy\.UPDATE/);
  assert.match(background,/client\.heartbeat/);
  assert.match(background,/notifySessionExpired/);
  assert.doesNotMatch(background,/startForegroundService/);
  assert.doesNotMatch(manifest,/FOREGROUND_SERVICE_MICROPHONE/);
  assert.match(vm,/MelBackground\.schedule\(appContext\)/);
  assert.match(vm,/MelBackground\.cancel\(appContext\)/);
  assert.match(activity,/Manifest\.permission\.POST_NOTIFICATIONS/);
  assert.match(activity,/Activer notifications arrière-plan/);
});


test('Android owner password state is not saveable and emulator smoke tests are wired',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const build=await readFile(new URL('app/build.gradle.kts',root),'utf8');
  const uiTest=await readFile(new URL('app/src/androidTest/java/fr/veriteinterdite/mel/MainActivitySmokeTest.kt',root),'utf8');
  const workflow=await readFile(new URL('../.github/workflows/android-emulator-ui-test.yml',import.meta.url),'utf8');
  assert.match(activity,/var password by remember \{ mutableStateOf\(".*"\) \}/);
  assert.doesNotMatch(activity,/var password by rememberSaveable/);
  assert.match(activity,/testTag\("login-user"\)/);
  assert.match(activity,/testTag\("login-password"\)/);
  assert.match(build,/testInstrumentationRunner = "androidx\.test\.runner\.AndroidJUnitRunner"/);
  assert.match(build,/androidx\.compose\.ui:ui-test-junit4/);
  assert.match(uiTest,/createAndroidComposeRule<MainActivity>/);
  assert.match(uiTest,/passwordIsNotRestoredAcrossActivityRecreation/);
  assert.match(workflow,/connectedDebugAndroidTest/);
  assert.match(workflow,/system-images;android-35;google_apis;x86_64/);
});
