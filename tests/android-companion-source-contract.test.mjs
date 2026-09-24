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
  assert.match(vm,/NORMAL\("normal", "Normal"\)/);
  assert.match(activity,/MEL \/\/ FULL ACCESS/);
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


test('Android native microphone uses SpeechRecognizer with declared package visibility and WebM fallback',async()=>{
  const manifest=await readFile(new URL('app/src/main/AndroidManifest.xml',root),'utf8');
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  assert.match(manifest,/android\.speech\.RecognitionService/);
  assert.match(manifest,/android\.permission\.RECORD_AUDIO/);
  assert.match(activity,/SpeechRecognizer\.createSpeechRecognizer/);
  assert.match(activity,/EXTRA_LANGUAGE_MODEL/);
  assert.match(activity,/EXTRA_PARTIAL_RESULTS/);
  assert.match(activity,/model\.send\(text, voice = true\)/);
  assert.match(activity,/MediaRecorder\.OutputFormat\.WEBM/);
  assert.match(activity,/MediaRecorder\.AudioEncoder\.OPUS/);
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
  assert.match(activity,/Notifications arrière-plan/);
});


test('Android owner password state is not saveable and emulator smoke tests are wired',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const build=await readFile(new URL('app/build.gradle.kts',root),'utf8');
  const uiTest=await readFile(new URL('app/src/androidTest/java/fr/veriteinterdite/mel/MainActivitySmokeTest.kt',root),'utf8');
  const screenshotTest=await readFile(new URL('app/src/androidTest/java/fr/veriteinterdite/mel/MelUiHarnessScreenshotTest.kt',root),'utf8');
  const harness=await readFile(new URL('app/src/debug/java/fr/veriteinterdite/mel/MelUiHarnessActivity.kt',root),'utf8');
  const debugManifest=await readFile(new URL('app/src/debug/AndroidManifest.xml',root),'utf8');
  const workflow=await readFile(new URL('../.github/workflows/android-emulator-ui-test.yml',import.meta.url),'utf8');
  assert.match(activity,/var password by remember \{ mutableStateOf\(".*"\) \}/);
  assert.doesNotMatch(activity,/var password by rememberSaveable/);
  assert.match(activity,/testTag\("login-user"\)/);
  assert.match(activity,/testTag\("login-password"\)/);
  assert.match(build,/testInstrumentationRunner = "androidx\.test\.runner\.AndroidJUnitRunner"/);
  assert.match(build,/androidx\.compose\.ui:ui-test-junit4/);
  assert.match(uiTest,/createAndroidComposeRule<MainActivity>/);
  assert.match(uiTest,/passwordIsNotRestoredAcrossActivityRecreation/);
  assert.match(screenshotTest,/completeModeRendersForVisualProof/);
  assert.match(harness,/getStringExtra\("mode"\)/);
  assert.match(harness,/getBooleanExtra\("diagnostics"/);
  assert.match(debugManifest,/android:exported="true"/);
  assert.match(debugManifest,/android:permission="android\.permission\.DUMP"/);
  assert.match(workflow,/connectedDebugAndroidTest/);
  assert.match(workflow,/:app:installDebug/);
  assert.match(workflow,/fr\.veriteinterdite\.mel\/\.MainActivity/);
  assert.match(workflow,/fr\.veriteinterdite\.mel\/\.MelUiHarnessActivity/);
  assert.match(workflow,/login-screen\.png/);
  assert.match(workflow,/complete-screen\.png/);
  assert.match(workflow,/screencap -p/);
  assert.match(workflow,/dumpsys activity activities/);
  assert.match(workflow,/system-images;android-35;google_apis;x86_64/);
});


test('Android voice and background session invalidation are fail-closed and self-cleaning',async()=>{
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  const background=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelBackground.kt',root),'utf8');

  const voice=vm.slice(vm.indexOf('fun sendVoice('),vm.indexOf('fun sendFile('));
  assert.match(voice,/isInvalidSession\(error\)/);
  assert.match(voice,/vault\.clear\(\)/);
  assert.match(voice,/MelBackground\.cancel\(appContext\)/);
  assert.match(voice,/SessionStage\.DISCONNECTED/);
  assert.match(voice,/Session expirée/);

  const pairing=vm.slice(vm.indexOf('fun pair('),vm.indexOf('fun disconnect('));
  assert.match(pairing,/MelBackground\.cancel\(appContext\)/);

  assert.match(background,/fun stopHeartbeat\(context: Context\)/);
  assert.match(background,/fun clearSessionAlert\(context: Context\)/);
  assert.match(background,/fun cancel\(context: Context\)[\s\S]*stopHeartbeat\(context\)[\s\S]*clearSessionAlert\(context\)/);
  assert.match(background,/fun schedule\(context: Context\)[\s\S]*clearSessionAlert\(context\)/);
  assert.match(background,/vault\.load\(\)\.isNullOrBlank\(\)[\s\S]*stopHeartbeat\(applicationContext\)/);
  assert.match(background,/vault\.clear\(\)[\s\S]*stopHeartbeat\(applicationContext\)[\s\S]*notifySessionExpired\(applicationContext\)/);
});


test('Android Complete mode exposes an authenticated self diagnostic',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');
  const build=await readFile(new URL('app/build.gradle.kts',root),'utf8');
  assert.match(build,/versionCode = 15/);
  assert.match(build,/versionName = "0\.6\.6"/);
  assert.match(api,/APP_VERSION = "0\.6\.6"/);
  assert.match(vm,/val diagnosticReport: String\? = null/);
  assert.match(vm,/fun runDiagnostics\(\)/);
  assert.match(vm,/client\.heartbeat\(sdkInt = Build\.VERSION\.SDK_INT\)/);
  assert.match(vm,/Heartbeat: OK/);
  assert.match(vm,/Backend accepte version/);
  assert.match(activity,/Text\("Lancer auto-diagnostic"\)/);
  assert.match(activity,/diagnosticReport = state\.diagnosticReport/);
  assert.match(activity,/Text\("Copier diagnostic"\)/);
  assert.match(activity,/ClipboardManager/);
  assert.match(activity,/ClipData\.newPlainText/);
});


test('Android device validation probes are authenticated and bounded',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  const background=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelBackground.kt',root),'utf8');
  const build=await readFile(new URL('app/build.gradle.kts',root),'utf8');
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');

  assert.match(build,/versionCode = 15/);
  assert.match(build,/versionName = "0\.6\.6"/);
  assert.match(api,/APP_VERSION = "0\.6\.6"/);

  assert.match(activity,/private const val MAX_FILE_BYTES = 25_000_000/);
  assert.match(activity,/private fun readUriBounded\(uri: Uri\): ByteArray/);
  assert.match(activity,/ByteArrayOutputStream\(64 \* 1024\)/);
  assert.match(activity,/if \(total > MAX_FILE_BYTES\)/);
  assert.doesNotMatch(activity,/openInputStream\(uri\)\?\.use \{ it\.readBytes\(\) \}/);

  assert.match(vm,/fun runNormalProbe\(\)/);
  assert.match(vm,/uiMode = MelMode\.NORMAL\.wireValue/);
  assert.match(vm,/conversationId \+ "-android-validation"/);
  assert.match(vm,/fun runFileProbe\(\)/);
  assert.match(vm,/client\.uploadFile\(/);
  assert.match(vm,/MEL_ANDROID_FILE_PROBE_/);
  assert.match(vm,/fun runBackgroundProbe\(\)/);
  assert.match(vm,/client\.heartbeat\(sdkInt = Build\.VERSION\.SDK_INT\)/);
  assert.match(vm,/MelBackground\.heartbeatScheduled\(appContext\)/);
  assert.match(background,/fun heartbeatScheduled\(context: Context\): Boolean/);

  assert.match(activity,/Text\("Tester Normal"\)/);
  assert.match(activity,/Text\("Tester fichier"\)/);
  assert.match(activity,/Text\("Tester arrière-plan"\)/);
  assert.match(activity,/Fichier sélectionné · envoi en cours…/);
  assert.doesNotMatch(activity,/Fichier envoyé à MEL/);
});


test('real mic and file successes feed the diagnostic report',async()=>{
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  const build=await readFile(new URL('app/build.gradle.kts',root),'utf8');
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');

  assert.match(build,/versionCode = 15/);
  assert.match(build,/versionName = "0\.6\.6"/);
  assert.match(api,/APP_VERSION = "0\.6\.6"/);

  const voice=vm.slice(vm.indexOf('fun sendVoice('),vm.indexOf('fun sendFile('));
  assert.match(voice,/appendDiagnosticLine\("Micro réel: OK"\)/);

  const file=vm.slice(vm.indexOf('fun sendFile('),vm.indexOf('fun runDiagnostics()'));
  const fileMarks=file.match(/appendDiagnosticLine\("Fichier réel: OK"\)/g) || [];
  assert.equal(fileMarks.length,2);
});


test('Android dark UI keeps readable content contrast',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const harness=await readFile(new URL('app/src/debug/java/fr/veriteinterdite/mel/MelUiHarnessActivity.kt',root),'utf8');
  const build=await readFile(new URL('app/build.gradle.kts',root),'utf8');
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');

  assert.match(build,/versionCode = 15/);
  assert.match(build,/versionName = "0\.6\.6"/);
  assert.match(api,/APP_VERSION = "0\.6\.6"/);

  assert.match(activity,/contentColor = MelInk/);
  assert.match(activity,/CardDefaults\.cardColors\(containerColor = MelPanel, contentColor = MelInk\)/);
  assert.match(activity,/CardDefaults\.cardColors\(containerColor = MelGlass, contentColor = MelInk\)/);
  assert.match(activity,/border = BorderStroke\(1\.dp, MelCyan\.copy\(alpha = \.18f\)\)/);
  assert.match(activity,/StatusPill\("ONLINE", MelSuccess\)/);
  assert.match(activity,/Text\("MEL", color = MelInk/);
  assert.match(activity,/Text\("Connexion à MEL", color = MelInk/);
  assert.match(activity,/Text\("Contrôles complets", color = MelInk/);
  assert.match(activity,/"Validation téléphone",[\s\S]{0,120}color = MelInk/);

  assert.match(harness,/MEL Android \$\{MelApiClient\.APP_VERSION\}/);
  assert.doesNotMatch(harness,/MEL Android 0\.6\.1/);
});


test('Android Complete panel stays height-bounded and internally scrollable',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const screenshotTest=await readFile(new URL('app/src/androidTest/java/fr/veriteinterdite/mel/MelUiHarnessScreenshotTest.kt',root),'utf8');

  assert.match(activity,/heightIn\(max = 300\.dp\)/);
  assert.match(activity,/verticalScroll\(rememberScrollState\(\)\)/);
  assert.match(screenshotTest,/performScrollTo\(\)\.assertIsDisplayed\(\)/);
});



test('Android 0.6.6 keeps critical interaction state truthful and stable',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  assert.match(activity,/LaunchedEffect\(state\.messages\.size, state\.busy\)/);
  assert.match(activity,/ModeSelector\(state\.mode, state\.busy, onMode\)/);
  assert.match(activity,/testTag\("message-input"\)/);
  assert.match(activity,/testTag\("file-button"\)/);
  assert.match(activity,/testTag\("micro-button"\)/);
  assert.match(activity,/testTag\("send-button"\)/);
  assert.match(activity,/Voix envoyée · MEL traite…/);
  assert.match(activity,/Fichier sélectionné · envoi en cours…/);
  assert.match(activity,/SpeechRecognizer\.isRecognitionAvailable/);
  assert.match(activity,/RecognizerIntent\.ACTION_RECOGNIZE_SPEECH/);
  assert.match(activity,/MediaRecorder\.OutputFormat\.WEBM/);
  assert.match(activity,/MediaRecorder\.AudioEncoder\.OPUS/);
  assert.match(activity,/recordingMimeType = if \(useWebm\) "audio\/webm" else "audio\/mp4"/);
  assert.match(activity,/Ouvrir les outils/);
  assert.match(activity,/VOICE LINK/);
  assert.match(vm,/Micro réel: OK · reconnaissance Android/);
  assert.match(vm,/fun setMode\(mode: MelMode\) \{\s*if \(_state\.value\.busy\) return/);
});

test('Android lint is aligned for AndroidX release checks',async()=>{
  const props=await readFile(new URL('gradle.properties',root),'utf8');
  assert.match(props,/android\.experimental\.lint\.version=8\.8\.2/);
});

test('Android CI preflights the unsigned release variant without signing secrets',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/android-apk-build.yml',import.meta.url),'utf8');

  assert.match(workflow,/name: Validate unsigned release variant/);
  assert.match(workflow,/:app:assembleRelease/);
  assert.match(workflow,/ANDROID_KEYSTORE_PATH: ""/);
  assert.match(workflow,/ANDROID_KEYSTORE_PASSWORD: ""/);
  assert.match(workflow,/ANDROID_KEY_ALIAS: ""/);
  assert.match(workflow,/ANDROID_KEY_PASSWORD: ""/);
  assert.match(workflow,/release-preflight-badging\.txt/);
  assert.match(workflow,/release-preflight\.apk\.sha256/);
  assert.match(workflow,/grep -q "package: name='fr\.veriteinterdite\.mel'"/);
  assert.match(workflow,/grep -q "launchable-activity:"/);
});
