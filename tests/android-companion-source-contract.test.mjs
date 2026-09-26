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
  assert.match(activity,/MobileSection\(val label: String\)/);
  assert.match(activity,/ACTIVER LE MODE COMPLET/);
  assert.doesNotMatch(activity,/Intent\(Intent\.ACTION_VIEW,\s*Uri\.parse\("https?:/);
  assert.doesNotMatch(activity,/\/professor/);
  assert.match(api,/\.put\("ui_mode", mode\)/);
  assert.match(api,/uiMode: String = "normal"/);
});

test('Android app exposes native file selection and a useful Complete control surface',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  assert.match(activity,/ActivityResultContracts\.OpenDocument/);
  assert.match(activity,/Text\("Fichier"\)/);
  assert.match(activity,/ACTIVER LE MODE COMPLET/);
  assert.match(activity,/CAMERA\("Caméra"\)/);
  assert.match(activity,/COMPANION\("MINI"\)/);
  assert.match(activity,/ActivityResultContracts\.TakePicturePreview/);
  assert.doesNotMatch(activity,/Intent\(Intent\.ACTION_VIEW,\s*Uri\.parse\("https?:/);
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
    '/api/android/v1/files/upload',
    '/api/android/v1/companions'
  ];
  for(const route of routes) assert.ok(api.includes(route),route);
});


test('Android app uses the MEL techno portrait for launcher and Compose UI',async()=>{
  const manifest=await readFile(new URL('app/src/main/AndroidManifest.xml',root),'utf8');
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const foreground=await readFile(new URL('app/src/main/res/drawable/ic_mel_techno_foreground.xml',root),'utf8');
  const adaptive=await readFile(new URL('app/src/main/res/mipmap-anydpi-v26/ic_mel_techno.xml',root),'utf8');
  const adaptiveRound=await readFile(new URL('app/src/main/res/mipmap-anydpi-v26/ic_mel_techno_round.xml',root),'utf8');
  assert.match(manifest,/android:icon="@mipmap\/ic_mel_techno"/);
  assert.match(manifest,/android:roundIcon="@mipmap\/ic_mel_techno_round"/);
  assert.match(foreground,/@drawable\/mel_futuristic_new/);
  assert.match(adaptive,/@drawable\/ic_mel_techno_foreground/);
  assert.match(adaptiveRound,/@drawable\/ic_mel_techno_foreground/);
  assert.match(activity,/painterResource\(R\.drawable\.mel_futuristic_new\)/);
  assert.match(activity,/MelAvatar\(/);
  assert.match(activity,/MelPortraitStage\(/);
});


test('Android and MINI use the exact same canonical MEL techno image bytes',async()=>{
  const android=await readFile(new URL('app/src/main/res/drawable-nodpi/mel_futuristic_new.webp',root));
  const mini=await readFile(new URL('../dist/assets/avatars/mel-full.webp',import.meta.url));
  assert.deepEqual(android,mini);
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


test('Android 0.6.15 matches the MINI reference shell with realistic MEL portrait',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  assert.match(activity,/private fun MelPortraitStage\(/);
  assert.match(activity,/painterResource\(R\.drawable\.mel_futuristic_new\)/);
  assert.match(activity,/private fun MiniReferenceTopBar\(/);
  assert.match(activity,/private fun MiniSettingsPanel\(/);
  assert.match(activity,/private fun VoiceWaveform\(/);
  assert.match(activity,/testTag\("mini-talk-button"\)/);
  assert.match(activity,/testTag\("voice-waveform"\)/);
  assert.match(activity,/testTag\("settings-button"\)/);
  assert.match(activity,/testTag\("settings-panel"\)/);
  assert.match(activity,/MelFaceState\.IDLE -> "PARLER"/);
  assert.match(activity,/MelFaceState\.LISTENING -> "ÉCOUTE"/);
  assert.match(activity,/MelFaceState\.THINKING -> "RÉFLEXION"/);
  assert.match(activity,/MelFaceState\.SPEAKING -> "MEL"/);
});

test('Android voice keeps French speech fallback and uses silent personalized OK MEL multi-turn conversation',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const trainer=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/WakePhraseTrainer.kt',root),'utf8');
  const store=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/WakePhraseProfileStore.kt',root),'utf8');
  assert.match(activity,/SpeechRecognizer\.createSpeechRecognizer/);
  assert.doesNotMatch(activity,/SpeechRecognizer\.createOnDeviceSpeechRecognizer/);
  assert.match(activity,/EXTRA_PREFER_OFFLINE, false/);
  assert.match(activity,/private fun beginPushToTalk\(\)/);
  assert.match(activity,/private fun endPushToTalk\(\)/);
  assert.match(activity,/private fun ensureWakeWordListening\(\)/);
  assert.match(activity,/WakePhraseTrainer\.listenForWake/);
  assert.match(activity,/private val voiceConversationActive = mutableStateOf\(false\)/);
  assert.match(activity,/OK MEL reconnu · conversation active/);
  assert.match(activity,/Je t’écoute · conversation/);
  assert.match(activity,/isConversationStopPhrase/);
  assert.match(activity,/Conversation en pause · dis « OK MEL »/);
  assert.match(trainer,/AudioRecord\(/);
  assert.match(trainer,/fun listenForWake\(/);
  assert.match(store,/fun templateFeatures\(\)/);
  assert.match(store,/\.commit\(\)/);
  assert.match(store,/createDeviceProtectedStorageContext\(\)/);
  assert.match(store,/fun importProfile\(profile: JSONObject\)/);
  assert.match(store,/fun resetRequested\(\): Boolean/);
  assert.match(store,/KEY_RESET_REQUESTED/);
  assert.match(activity,/refreshWakeEnrollmentState\(\)/);
  assert.match(activity,/wakeProfileRevision/);
  assert.match(activity,/private val voiceLevel = mutableStateOf\(0f\)/);
  assert.match(activity,/override fun onRmsChanged\(rmsdB: Float\)/);
  assert.match(activity,/voiceLevel\.value = \(\(rmsdB \+ 2f\) \/ 12f\)\.coerceIn/);
  assert.match(activity,/speechErrorMessage\(error\)/);
  assert.match(activity,/ERROR_NO_MATCH -> "Je n’ai pas compris · retouche Micro"/);
  assert.match(activity,/ERROR_SPEECH_TIMEOUT -> "Je n’ai rien entendu · retouche Micro"/);
  const nativeStart=activity.indexOf('private fun startNativeSpeech()');
  const nativeError=activity.indexOf('override fun onError(error: Int)',nativeStart);
  const errorBlock=activity.slice(nativeError,activity.indexOf('override fun onResults',nativeError));
  assert.match(errorBlock,/ERROR_LANGUAGE_NOT_SUPPORTED/);
  assert.match(errorBlock,/ERROR_LANGUAGE_UNAVAILABLE/);
  assert.match(errorBlock,/startRecorderFallback\("Français Android indisponible · secours MEL"\)/);
  assert.match(activity,/MelFaceState\.LISTENING -> breathe \+ voiceLevel\.coerceIn/);
  assert.match(activity,/translationX = sway/);
  assert.doesNotMatch(activity,/label = "mel-photo-mouth"/);
  assert.match(activity,/SettingsAction\("Clavier \/ Chat"/);
  assert.match(activity,/SettingsAction\("Caméra"/);
  assert.match(activity,/SettingsAction\("Compagnon MINI"/);
  assert.doesNotMatch(activity,/SettingsAction\("Espace multimédia \/ Web"/);
});

test('Android native microphone uses SpeechRecognizer with declared package visibility and WebM fallback',async()=>{
  const manifest=await readFile(new URL('app/src/main/AndroidManifest.xml',root),'utf8');
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  assert.match(manifest,/android\.speech\.RecognitionService/);
  assert.match(manifest,/android\.permission\.RECORD_AUDIO/);
  assert.match(activity,/SpeechRecognizer\.createSpeechRecognizer/);
  assert.match(activity,/EXTRA_LANGUAGE_MODEL/);
  assert.match(activity,/EXTRA_PARTIAL_RESULTS/);
  assert.match(activity,/dispatchCompanionText\(text, voice = true\)/);
  assert.match(activity,/MediaRecorder\.OutputFormat\.WEBM/);
  assert.match(activity,/MediaRecorder\.AudioEncoder\.OPUS/);
});

test('Android 0.6.15 handles everyday assistant commands locally before the network',async()=>{
  const manifest=await readFile(new URL('app/src/main/AndroidManifest.xml',root),'utf8');
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  const commands=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelCompanionCommands.kt',root),'utf8');
  const unit=await readFile(new URL('app/src/test/java/fr/veriteinterdite/mel/MelCompanionCommandsTest.kt',root),'utf8');
  const build=await readFile(new URL('app/build.gradle.kts',root),'utf8');
  const workflow=await readFile(new URL('../.github/workflows/android-apk-build.yml',import.meta.url),'utf8');

  assert.match(manifest,/com\.android\.alarm\.permission\.SET_ALARM/);
  assert.match(manifest,/android\.permission\.ACCESS_NETWORK_STATE/);
  assert.match(manifest,/android\.intent\.action\.TTS_SERVICE/);
  assert.match(activity,/private fun dispatchCompanionText\(/);
  assert.match(activity,/MelCompanionCommands\.parse\(clean\)/);
  assert.match(activity,/AlarmClock\.ACTION_SET_TIMER/);
  assert.match(activity,/AlarmClock\.ACTION_SET_ALARM/);
  assert.match(activity,/AlarmClock\.ACTION_SHOW_ALARMS/);
  assert.match(activity,/Intent\.ACTION_DIAL/);
  assert.match(activity,/Intent\.ACTION_SENDTO/);
  assert.match(activity,/mailto:/);
  assert.match(activity,/Intent\.ACTION_DIAL/);
  assert.match(activity,/geo:0,0\?q=/);
  assert.match(activity,/Settings\.ACTION_WIFI_SETTINGS/);
  assert.match(activity,/Settings\.ACTION_BLUETOOTH_SETTINGS/);
  assert.match(activity,/Settings\.ACTION_LOCATION_SOURCE_SETTINGS/);
  assert.match(activity,/Intent\.makeMainSelectorActivity/);
  assert.match(activity,/Intent\.CATEGORY_APP_CALCULATOR/);
  assert.match(activity,/Intent\.CATEGORY_APP_CALENDAR/);
  assert.match(activity,/Intent\.CATEGORY_APP_CONTACTS/);
  assert.match(activity,/Intent\.CATEGORY_APP_EMAIL/);
  assert.match(activity,/Intent\.CATEGORY_APP_FILES/);
  assert.match(activity,/Intent\.CATEGORY_APP_GALLERY/);
  assert.match(activity,/Intent\.CATEGORY_APP_MAPS/);
  assert.match(activity,/Intent\.CATEGORY_APP_MESSAGING/);
  assert.match(activity,/Intent\.CATEGORY_APP_MUSIC/);
  assert.match(activity,/BatteryManager\.EXTRA_LEVEL/);
  assert.match(activity,/NetworkCapabilities\.NET_CAPABILITY_VALIDATED/);
  assert.match(activity,/AudioManager\.STREAM_MUSIC/);
  assert.match(activity,/Settings\.ACTION_AIRPLANE_MODE_SETTINGS/);
  assert.match(activity,/Settings\.ACTION_DISPLAY_SETTINGS/);
  assert.match(activity,/Settings\.ACTION_SOUND_SETTINGS/);
  assert.match(activity,/CalendarContract\.Events\.CONTENT_URI/);
  assert.match(activity,/CalendarContract\.EXTRA_EVENT_BEGIN_TIME/);
  assert.match(activity,/getSharedPreferences\("mel_companion_local"/);
  assert.match(activity,/JSONArray/);
  assert.match(activity,/appendLocalItem\("shopping"/);
  assert.match(activity,/appendLocalItem\("notes"/);
  assert.match(activity,/client\.transcribe\(bytes, mimeType\)/);
  assert.match(activity,/dispatchCompanionText\(transcript, voice = true\)/);
  assert.match(vm,/fun localCompanionReply\(/);
  assert.match(vm,/Compagnon local: OK/);
  assert.match(commands,/quelle\?\\s\+heure/);
  assert.match(commands,/minuteur\|timer/);
  assert.match(commands,/rappelle\[- \]moi\\s\+dans/);
  assert.match(commands,/arithmetic/);
  assert.match(commands,/conversion/);
  assert.match(commands,/MelCompanionCommand\.Navigate/);
  assert.match(commands,/MelCompanionCommand\.Email/);
  assert.match(commands,/MelCompanionCommand\.OpenDialer/);
  assert.match(commands,/MelCompanionCommand\.Camera/);
  assert.match(commands,/MelCompanionCommand\.EnableNotifications/);
  assert.match(commands,/MelCompanionCommand\.OpenApp/);
  assert.match(commands,/MelCompanionCommand\.BatteryStatus/);
  assert.match(commands,/MelCompanionCommand\.InternetStatus/);
  assert.match(commands,/MelCompanionCommand\.VolumeStatus/);
  assert.match(commands,/MelCompanionCommand\.CalendarEvent/);
  assert.match(commands,/MelCompanionCommand\.AddShoppingItem/);
  assert.match(commands,/MelCompanionCommand\.ShowShoppingList/);
  assert.match(commands,/MelCompanionCommand\.AddNote/);
  assert.match(commands,/MelCompanionCommand\.ShowNotes/);
  assert.match(build,/testImplementation\("junit:junit:4\.13\.2"\)/);
  assert.match(workflow,/:app:testDebugUnitTest/);
  assert.match(unit,/fun arithmeticIsLocal\(\)/);
  assert.match(unit,/fun timerAndRelativeReminderAreLocal\(\)/);
  assert.match(unit,/fun communicationActionsRequireAndroidHandoff\(\)/);
  assert.match(unit,/fun calendarEventIsPreparedLocally\(\)/);
  assert.match(unit,/fun shoppingListCommandsAreLocal\(\)/);
  assert.match(unit,/fun notesCommandsAreLocal\(\)/);
  assert.match(unit,/fun unknownRequestFallsBackToMel\(\)/);
});

test('Android keeps soft MEL portrait motion but removes the generated mouth animation',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  assert.match(activity,/enum class MelFaceState \{ IDLE, LISTENING, THINKING, SPEAKING, ERROR \}/);
  assert.match(activity,/rememberInfiniteTransition\(label = "mel-photo-motion"\)/);
  assert.match(activity,/label = "mel-photo-breathe"/);
  assert.match(activity,/label = "mel-photo-sway"/);
  assert.match(activity,/translationX = sway/);
  assert.match(activity,/translationY = if \(faceState == MelFaceState\.IDLE\)/);
  assert.match(activity,/rotationZ = if \(faceState == MelFaceState\.THINKING\)/);
  assert.doesNotMatch(activity,/label = "mel-photo-mouth"/);
  assert.doesNotMatch(activity,/mouthPhase/);
  assert.match(activity,/rememberInfiniteTransition\(label = "mel-wave"\)/);
  assert.match(activity,/override fun onRmsChanged\(rmsdB: Float\)/);
  assert.match(activity,/testTag\("mel-animated-avatar"\)/);
  assert.match(activity,/testTag\("mini-stage"\)/);
  assert.match(activity,/testTag\("voice-waveform"\)/);
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
  assert.match(activity,/Arrière-plan \/ notifications/);
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
  assert.match(workflow,/launcher-icon-proof\.png/);
  assert.match(workflow,/APPLICATION_DETAILS_SETTINGS/);
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
  assert.match(build,/versionCode = 50/);
  assert.match(build,/versionName = "0\.6\.41-ble-stability"/);
  assert.match(api,/APP_VERSION = "0\.6\.41-ble-stability"/);
  assert.match(vm,/val diagnosticReport: String\? = null/);
  assert.match(vm,/fun runDiagnostics\(\)/);
  assert.match(vm,/client\.heartbeat\(sdkInt = Build\.VERSION\.SDK_INT\)/);
  assert.match(vm,/Heartbeat: OK/);
  assert.match(vm,/Backend accepte version/);
  assert.match(activity,/Text\("AUTO-DIAGNOSTIC"\)/);
  assert.match(activity,/state\.diagnosticReport/);
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

  assert.match(build,/versionCode = 50/);
  assert.match(build,/versionName = "0\.6\.41-ble-stability"/);
  assert.match(api,/APP_VERSION = "0\.6\.41-ble-stability"/);

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

  assert.match(activity,/onClick = onNormalProbe/);
  assert.match(activity,/onClick = onFileProbe/);
  assert.match(activity,/onClick = onBackgroundProbe/);
  assert.match(activity,/Fichier sélectionné · envoi en cours…/);
  assert.doesNotMatch(activity,/Fichier envoyé à MEL/);
});


test('real mic and file successes feed the diagnostic report',async()=>{
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  const build=await readFile(new URL('app/build.gradle.kts',root),'utf8');
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');

  assert.match(build,/versionCode = 50/);
  assert.match(build,/versionName = "0\.6\.41-ble-stability"/);
  assert.match(api,/APP_VERSION = "0\.6\.41-ble-stability"/);

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

  assert.match(build,/versionCode = 50/);
  assert.match(build,/versionName = "0\.6\.41-ble-stability"/);
  assert.match(api,/APP_VERSION = "0\.6\.41-ble-stability"/);

  assert.match(activity,/contentColor = MelInk/);
  assert.match(activity,/CardDefaults\.cardColors\(containerColor = MelPanel, contentColor = MelInk\)/);
  assert.match(activity,/color = MelGlass/);
  assert.match(activity,/border = BorderStroke\(1\.dp, MelCyan\.copy\(alpha = \.18f\)\)/);
  assert.match(activity,/Text\(\s*"MEL",\s*color = Color\.White/);
  assert.match(activity,/Text\("Connexion à MEL", color = MelInk/);
  assert.match(activity,/HudLabel\("OUTILS \/\/ MEL", "MODE COMPLET NATIF", MelViolet\)/);
  assert.match(activity,/HudLabel\("CAMERA \/\/ MEL", "CAPTURE NATIVE ANDROID", MelBlue\)/);

  assert.match(harness,/MEL Android \$\{MelApiClient\.APP_VERSION\}/);
  assert.doesNotMatch(harness,/MEL Android 0\.6\.1/);
});


test('Android MINI mobile shell keeps settings-driven native navigation and complete tools inside the app',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const bridge=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelBleBridgeService.kt',root),'utf8');
  const screenshotTest=await readFile(new URL('app/src/androidTest/java/fr/veriteinterdite/mel/MelUiHarnessScreenshotTest.kt',root),'utf8');

  assert.match(activity,/enum class MobileSection/);
  assert.match(activity,/MEL\("MEL"\)/);
  assert.match(activity,/KEYBOARD\("Clavier"\)/);
  assert.match(activity,/CAMERA\("Caméra"\)/);
  assert.match(activity,/COMPANION\("MINI"\)/);
  assert.match(activity,/WEB\("Web"\)/);
  assert.match(activity,/TOOLS\("Outils"\)/);
  assert.match(activity,/private fun MiniSettingsPanel\(/);
  assert.match(activity,/testTag\("settings-button"\)/);
  assert.match(activity,/"settings-keyboard"/);
  assert.match(activity,/"settings-camera"/);
  assert.match(activity,/"settings-companion"/);
  assert.doesNotMatch(activity,/"settings-web"/);
  assert.match(activity,/MobileSection\.WEB -> SectionSurface\("NAVIGATION \/\/ WEB"\)/);
  assert.match(activity,/"settings-tools"/);
  assert.match(screenshotTest,/settings-tools/);
  assert.doesNotMatch(activity,/Intent\(Intent\.ACTION_VIEW,\s*Uri\.parse\("https?:/);
  assert.doesNotMatch(activity,/CODE MINI/);
  assert.doesNotMatch(activity,/GÉNÉRER LE CODE MINI/);
  assert.match(bridge,/request\.path == "\/api\/device\/v1\/manifest"/);
  assert.match(bridge,/MEL relay local manifest -> 200/);
  assert.match(bridge,/request\.path == "\/api\/device\/v1\/render\/card"/);
  assert.match(bridge,/renderMiniCardMimg\(/);
  assert.match(bridge,/payload\.optString\("image_url", ""\)/);
  assert.match(bridge,/application\/x-mel-mimg/);
  assert.match(bridge,/fetchMiniCardImage\(/);
  assert.match(bridge,/safeMiniImageUrl\(/);
  assert.match(bridge,/protocol\.equals\("https", ignoreCase = true\)/);
  assert.match(bridge,/BitmapFactory\.decodeByteArray/);
  assert.match(bridge,/rgb565/);
  assert.match(bridge,/MINI CONNECTÉE · INTERNET OK/);
});



test('Android 0.6.15 keeps critical interaction state truthful and stable',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  assert.doesNotMatch(activity,/LaunchedEffect\(state\.messages\.size\)/);
  assert.match(vm,/val speaking: Boolean = false/);
  assert.match(activity,/state\.speaking -> MelFaceState\.SPEAKING/);
  assert.match(activity,/ModeSelector\(state\.mode, state\.busy, onMode\)/);
  assert.match(activity,/testTag\("message-input"\)/);
  assert.match(activity,/testTag\("file-button"\)/);
  assert.match(activity,/testTag\("micro-button"\)/);
  assert.match(activity,/testTag\("send-button"\)/);
  assert.match(activity,/Voix comprise · traitement…/);
  assert.match(activity,/Fichier sélectionné · envoi en cours…/);
  assert.match(activity,/SpeechRecognizer\.isRecognitionAvailable/);
  assert.match(activity,/RecognizerIntent\.ACTION_RECOGNIZE_SPEECH/);
  assert.match(activity,/MediaRecorder\.OutputFormat\.WEBM/);
  assert.match(activity,/MediaRecorder\.AudioEncoder\.OPUS/);
  assert.match(activity,/recordingMimeType = if \(useWebm\) "audio\/webm" else "audio\/mp4"/);
  assert.match(activity,/testTag\("mini-talk-button"\)/);
  assert.match(activity,/ACTIVER LE MODE COMPLET/);
  assert.match(vm,/Micro réel: OK · reconnaissance Android/);
  assert.match(vm,/fun setMode\(mode: MelMode\) \{\s*if \(_state\.value\.busy\) return/);
});

test('Android 0.6.15 exposes native keyboard camera companion and tools surfaces',async()=>{
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  assert.match(activity,/ActivityResultContracts\.TakePicturePreview/);
  assert.match(activity,/private fun sendCameraPhoto\(\)/);
  assert.match(activity,/CameraPanel\(/);
  assert.match(activity,/KeyboardPanel\(/);
  assert.match(activity,/CompanionPanel\(/);
  assert.match(activity,/NativeToolsPanel\(/);
  assert.match(activity,/WebPanel\(/);
  assert.match(activity,/AndroidView\(/);
  assert.match(activity,/WebView\(context\)/);
  assert.doesNotMatch(activity,/"settings-web"/);
  assert.match(activity,/MobileSection\.WEB -> SectionSurface\("NAVIGATION \/\/ WEB"\)/);
  assert.match(api,/fun companions\(\): JSONArray/);
  assert.match(api,/\/api\/android\/v1\/companions/);
  assert.match(vm,/data class MelCompanionDevice/);
  assert.match(vm,/fun refreshCompanions\(\)/);
  assert.doesNotMatch(activity,/Intent\(Intent\.ACTION_VIEW,\s*Uri\.parse\("https?:/);
});

test('Android 0.6.15 plays the same Luna PCM voice contract as MINI for chat and microphone replies',async()=>{
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');
  const vm=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',root),'utf8');
  const activity=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',root),'utf8');
  const player=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelVoicePlayer.kt',root),'utf8');
  const server=await readFile(new URL('../src/devices/android-companion-api.js',import.meta.url),'utf8');

  assert.match(api,/fun tts\(text: String, speaker: String = "luna", format: String = "mp3"\): ByteArray/);
  assert.match(api,/\/api\/android\/v1\/voice\/tts/);
  assert.match(server,/@cf\/deepgram\/aura-1/);
  assert.match(server,/speaker = safe\(body\.speaker,32\) \|\| "luna"/);
  assert.match(server,/encoding:"mp3"/);
  assert.match(server,/format = safe\(body\.format,16\)/);
  assert.match(server,/x-mel-audio-format.*mp3/);
  assert.match(server,/content-type.*audio\/mpeg/);
  assert.match(player,/AudioTrack\.Builder\(\)/);
  assert.match(player,/AudioFormat\.ENCODING_PCM_16BIT/);
  assert.match(player,/AudioFormat\.CHANNEL_OUT_MONO/);
  assert.match(player,/SAMPLE_RATE = 48_000/);
  assert.match(vm,/client\.tts\(answer, speaker = "luna", format = "mp3"\)/);
  assert.match(vm,/MelVoicePlayer\.playMp3\(appContext, audio\)/);
  assert.match(vm,/MelVoicePlayer\.playSystemFrench\(appContext, answer\)/);
  assert.match(vm,/status = "MEL parle…"/);
  assert.match(vm,/Audio MEL: OK · Android fr-FR/);
  assert.match(vm,/Audio MEL: secours Luna MP3/);
  assert.match(player,/TextToSpeech/);
  assert.match(player,/Locale\.FRANCE/);
  assert.match(player,/splitForTts\(text, maxChunk\)/);
  assert.match(player,/MelPlaybackInterruptedException/);
  assert.match(player,/coerceIn\(20L, 240L\)/);
  assert.doesNotMatch(player,/coerceIn\(10L, 60L\)/);
  assert.match(vm,/fun interruptSpeechForBargeIn\(\)/);
  assert.match(vm,/catch \(error: MelPlaybackInterruptedException\)/);
  assert.match(activity,/startBargeInListening\(\)/);
  assert.match(activity,/model\.interruptSpeechForBargeIn\(\)/);
  const barge=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelBargeInDetector.kt',root),'utf8');
  assert.match(barge,/AudioSource\.VOICE_COMMUNICATION/);
  assert.match(barge,/AcousticEchoCanceler/);
  assert.match(barge,/NoiseSuppressor/);
  assert.match(activity,/state\.speaking -> MelFaceState\.SPEAKING/);
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
