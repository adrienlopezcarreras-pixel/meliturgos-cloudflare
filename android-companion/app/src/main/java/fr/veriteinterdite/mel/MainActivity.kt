package fr.veriteinterdite.mel

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.AudioManager
import android.media.MediaRecorder
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.provider.AlarmClock
import android.provider.CalendarContract
import android.provider.OpenableColumns
import android.provider.Settings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.Normalizer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.delay
import org.json.JSONArray

class MainActivity : ComponentActivity() {
    private lateinit var client: MelApiClient
    private lateinit var vault: TokenVault
    private lateinit var model: MelViewModel
    private lateinit var wakePhraseStore: WakePhraseProfileStore
    private var recorder: MediaRecorder? = null
    private var recordingFile: File? = null
    private var recordingMimeType: String = "audio/mp4"
    private var speechRecognizer: SpeechRecognizer? = null
    private var nativeSpeechListening = false
    private var wakeRecognizer: SpeechRecognizer? = null
    private var wakeListening = false
    @Volatile private var wakeDetectorStop = false
    private var wakeDetectorThread: Thread? = null
    private var pushToTalkHeld = false
    private var pendingWakeEnrollment = false
    private var appResumed = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private val recording = mutableStateOf(false)
    private val voiceLevel = mutableStateOf(0f)
    private val voiceMessage = mutableStateOf("Micro prêt")
    private val cameraPhoto = mutableStateOf<Bitmap?>(null)
    private val wakeEnrollmentCount = mutableStateOf(0)
    private val wakeEnrollmentActive = mutableStateOf(false)
    private val wakeEnrolled = mutableStateOf(false)
    private val voiceConversationActive = mutableStateOf(false)

    private val bluetoothPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.values.all { it }) startMobileBridge()
    }

    private val enableBluetooth = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        ensureMobileBridge()
    }

    private val microphonePermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            if (pendingWakeEnrollment) {
                pendingWakeEnrollment = false
                captureWakeEnrollmentSample()
            } else if (pushToTalkHeld) startPushToTalkRecording() else ensureWakeWordListening()
        } else {
            pushToTalkHeld = false
            pendingWakeEnrollment = false
            wakeEnrollmentActive.value = false
            voiceMessage.value = "Permission micro refusée"
        }
    }

    private val cameraCapture = registerForActivityResult(
        ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        cameraPhoto.value = bitmap
        voiceMessage.value = if (bitmap != null) "Photo prête · envoie-la à MEL" else "Caméra annulée"
    }

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            MelBackground.schedule(this)
            MelBackground.showBackgroundEnabled(this)
            voiceMessage.value = "Notifications MEL activées"
        } else {
            voiceMessage.value = "Notifications refusées"
        }
    }

    private val filePicker = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) handlePickedFile(uri)
    }

    private val conversationId by lazy { "android-" + deviceId() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        enableEdgeToEdge()

        vault = TokenVault(this)
        wakePhraseStore = WakePhraseProfileStore(this)
        wakeEnrollmentCount.value = wakePhraseStore.sampleCount()
        wakeEnrolled.value = wakePhraseStore.isEnrolled()
        MelVoicePlayer.initialize(this)
        client = MelApiClient(BuildConfig.MEL_BASE_URL, deviceId(), vault)
        val factory = MelViewModel.factory(this, client, vault, conversationId)
        model = ViewModelProvider(this, factory)[MelViewModel::class.java]
        ensureMobileBridge()

        setContent {
            val state by model.state.collectAsStateWithLifecycle()
            LaunchedEffect(state.session, state.busy, state.speaking, state.error, recording.value, voiceConversationActive.value) {
                if (!state.busy && !recording.value &&
                    (voiceMessage.value.startsWith("Fichier") ||
                        voiceMessage.value.startsWith("Voix") ||
                        voiceMessage.value == "Transcription…")
                ) {
                    voiceMessage.value = "Micro prêt"
                }
                if (state.error != null && voiceConversationActive.value) {
                    voiceConversationActive.value = false
                    voiceMessage.value = "Conversation interrompue · dis « OK MEL »"
                    delay(700)
                    ensureWakeWordListening()
                    return@LaunchedEffect
                }
                if (state.session == SessionStage.CONNECTED && !state.busy && !state.speaking && !recording.value) {
                    delay(if (voiceConversationActive.value) 850 else 650)
                    if (state.session == SessionStage.CONNECTED && !model.state.value.busy && !model.state.value.speaking && !recording.value) {
                        if (voiceConversationActive.value) {
                            stopWakeWordListening()
                            voiceMessage.value = "Je t’écoute · conversation"
                            startVoice()
                        } else {
                            ensureWakeWordListening()
                        }
                    }
                } else {
                    stopWakeWordListening()
                }
            }
            MelTheme {
                MelApp(
                    state = state,
                    recording = recording.value,
                    voiceLevel = voiceLevel.value,
                    voiceMessage = voiceMessage.value,
                    onLogin = model::pair,
                    onRetrySession = model::verifyExistingSession,
                    onDisconnect = model::disconnect,
                    onMode = model::setMode,
                    onSend = { dispatchCompanionText(it, voice = false) },
                    onSync = model::sync,
                    onVoicePress = ::beginPushToTalk,
                    onVoiceRelease = ::endPushToTalk,
                    onFile = ::pickFile,
                    onNotifications = ::enableNotifications,
                    onDiagnostics = model::runDiagnostics,
                    onCopyDiagnostic = ::copyDiagnostic,
                    onNormalProbe = model::runNormalProbe,
                    onFileProbe = model::runFileProbe,
                    onBackgroundProbe = model::runBackgroundProbe,
                    onTestVoice = ::testFrenchVoice,
                    cameraPhoto = cameraPhoto.value,
                    onCamera = ::openCamera,
                    onSendCamera = ::sendCameraPhoto,
                    onRefreshCompanions = model::refreshCompanions,
                    onConnectMini = { ensureMobileBridge(true) },
                    onMiniPairCode = model::requestMiniPairCode,
                    wakeEnrollmentCount = wakeEnrollmentCount.value,
                    wakeEnrollmentActive = wakeEnrollmentActive.value,
                    wakeEnrolled = wakeEnrolled.value,
                    onWakeEnroll = ::startWakeEnrollment,
                    onWakeReset = ::resetWakeEnrollment
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        appResumed = true
        if (::model.isInitialized) mainHandler.postDelayed({ ensureWakeWordListening() }, 500L)
    }

    override fun onPause() {
        appResumed = false
        voiceConversationActive.value = false
        stopWakeWordListening()
        super.onPause()
    }

    override fun onDestroy() {
        stopWakeWordListening()
        wakeDetectorThread?.interrupt()
        wakeDetectorThread = null
        stopSpeechQuietly()
        stopRecorderQuietly()
        super.onDestroy()
    }

    private fun ensureMobileBridge(forceRestart: Boolean = false) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val permissions = arrayOf(
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT
            )
            val missing = permissions.filter {
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
            }
            if (missing.isNotEmpty()) {
                bluetoothPermissions.launch(missing.toTypedArray())
                return
            }
        }
        val adapter = getSystemService(BluetoothManager::class.java)?.adapter ?: return
        if (!adapter.isEnabled) {
            enableBluetooth.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
            return
        }
        startMobileBridge(forceRestart)
    }

    private fun startMobileBridge(forceRestart: Boolean = false) {
        val intent = Intent(this, MelBleBridgeService::class.java)
        if (forceRestart) intent.action = MelBleBridgeService.ACTION_RESTART
        ContextCompat.startForegroundService(this, intent)
    }

    private fun deviceId(): String {
        val raw = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        return "android-" + (raw ?: "unknown").take(64)
    }

    private fun testFrenchVoice() {
        voiceMessage.value = "Test de la voix française…"
        Thread {
            try {
                MelVoicePlayer.playSystemFrench(
                    this,
                    "Bonjour Adrien. La voix française de MEL fonctionne correctement."
                )
                runOnUiThread { voiceMessage.value = "Voix française OK" }
            } catch (error: Throwable) {
                runOnUiThread {
                    voiceMessage.value = "Voix française en erreur : ${error.message ?: error.javaClass.simpleName}"
                }
            }
        }.start()
    }

    private fun pickFile() {
        if (model.state.value.session != SessionStage.CONNECTED) {
            voiceMessage.value = "Connecte d’abord le téléphone à MEL"
            return
        }
        filePicker.launch(arrayOf("*/*"))
    }

    private fun handlePickedFile(uri: Uri) {
        Thread {
            try {
                val length = contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
                if (length > MAX_FILE_BYTES.toLong()) {
                    runOnUiThread { voiceMessage.value = "Fichier trop volumineux · limite 25 Mo" }
                    return@Thread
                }
                var name = "fichier"
                contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (index >= 0) name = cursor.getString(index) ?: name
                    }
                }
                val type = contentResolver.getType(uri) ?: "application/octet-stream"
                val bytes = readUriBounded(uri)
                model.sendFile(name, type, bytes)
                runOnUiThread { voiceMessage.value = "Fichier sélectionné · envoi en cours…" }
            } catch (error: Throwable) {
                runOnUiThread {
                    voiceMessage.value = if (error.message == "FILE_TOO_LARGE")
                        "Fichier trop volumineux · limite 25 Mo"
                    else
                        "Fichier : " + (error.message ?: "lecture impossible")
                }
            }
        }.start()
    }

    private fun readUriBounded(uri: Uri): ByteArray {
        val input = contentResolver.openInputStream(uri)
            ?: throw IllegalStateException("Fichier illisible")
        input.use { stream ->
            val output = ByteArrayOutputStream(64 * 1024)
            val buffer = ByteArray(16 * 1024)
            var total = 0
            while (true) {
                val read = stream.read(buffer)
                if (read < 0) break
                total += read
                if (total > MAX_FILE_BYTES) {
                    throw IllegalStateException("FILE_TOO_LARGE")
                }
                output.write(buffer, 0, read)
            }
            return output.toByteArray()
        }
    }

    private fun openCamera() {
        runCatching { cameraCapture.launch(null) }
            .onFailure { voiceMessage.value = "Caméra indisponible sur ce téléphone" }
    }

    private fun sendCameraPhoto() {
        val bitmap = cameraPhoto.value ?: run {
            voiceMessage.value = "Prends d’abord une photo"
            return
        }
        val output = ByteArrayOutputStream()
        val ok = bitmap.compress(Bitmap.CompressFormat.JPEG, 90, output)
        if (!ok) {
            voiceMessage.value = "Impossible de préparer la photo"
            return
        }
        val bytes = output.toByteArray()
        model.sendFile(
            "mel-camera-" + System.currentTimeMillis() + ".jpg",
            "image/jpeg",
            bytes
        )
        cameraPhoto.value = null
        voiceMessage.value = "Photo envoyée à MEL"
    }

    private fun copyDiagnostic(report: String) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Diagnostic MEL Android", report))
        Toast.makeText(this, "Diagnostic MEL copié", Toast.LENGTH_SHORT).show()
    }

    private fun enableNotifications() {
        if (model.state.value.session != SessionStage.CONNECTED) {
            voiceMessage.value = "Connecte d’abord le téléphone à MEL"
            return
        }
        MelBackground.schedule(this)
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        MelBackground.showBackgroundEnabled(this)
        voiceMessage.value = "Notifications MEL activées"
    }

    private fun startWakeEnrollment() {
        if (wakeEnrollmentActive.value || recording.value) return
        if (wakeEnrolled.value) {
            voiceMessage.value = "OK MEL déjà appris · réinitialise pour recommencer"
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingWakeEnrollment = true
            microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        captureWakeEnrollmentSample()
    }

    private fun captureWakeEnrollmentSample() {
        if (wakeEnrollmentActive.value || recording.value) return
        stopWakeWordListening()
        stopSpeechQuietly()
        wakeEnrollmentActive.value = true
        val next = (wakeEnrollmentCount.value + 1).coerceAtMost(WakePhraseTrainer.REQUIRED_SAMPLES)
        voiceMessage.value = "Dis « OK MEL » maintenant · prise $next/${WakePhraseTrainer.REQUIRED_SAMPLES}"
        WakePhraseTrainer.captureAsync { result ->
            runOnUiThread {
                wakeEnrollmentActive.value = false
                result.onSuccess { vector ->
                    val state = wakePhraseStore.addSample(vector)
                    wakeEnrollmentCount.value = state.sampleCount
                    wakeEnrolled.value = state.enrolled
                    if (state.enrolled) {
                        voiceMessage.value = "OK MEL appris · écoute silencieuse active"
                        ensureMobileBridge(true)
                        scheduleWakeWordRestart()
                    } else {
                        voiceMessage.value = "OK MEL enregistré · ${state.sampleCount}/${WakePhraseTrainer.REQUIRED_SAMPLES}"
                    }
                }.onFailure { error ->
                    voiceMessage.value = when (error.message) {
                        "WAKE_PHRASE_TOO_QUIET", "WAKE_PHRASE_NOT_HEARD" -> "Je n’ai pas assez entendu · recommence OK MEL"
                        else -> "Échec apprentissage OK MEL · ${error.message ?: "micro"}"
                    }
                }
            }
        }
    }

    private fun resetWakeEnrollment() {
        if (wakeEnrollmentActive.value) return
        stopWakeWordListening()
        wakePhraseStore.resetEnrollment()
        wakeEnrollmentCount.value = 0
        wakeEnrolled.value = false
        voiceMessage.value = "Apprentissage OK MEL réinitialisé"
        ensureMobileBridge(true)
    }

    private fun beginPushToTalk() {
        pushToTalkHeld = true
        stopWakeWordListening()
        if (model.state.value.session != SessionStage.CONNECTED) {
            pushToTalkHeld = false
            voiceMessage.value = "Connecte d’abord le téléphone à MEL"
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        startPushToTalkRecording()
    }

    private fun startPushToTalkRecording() {
        if (!pushToTalkHeld || recording.value) return
        startVoice()
    }

    private fun endPushToTalk() {
        pushToTalkHeld = false
        if (!recording.value) {
            scheduleWakeWordRestart()
            return
        }
        if (nativeSpeechListening) {
            voiceMessage.value = "Transcription…"
            runCatching { speechRecognizer?.stopListening() }
        } else {
            finishVoice()
        }
    }

    private fun startVoice() {
        stopWakeWordListening()
        if (SpeechRecognizer.isRecognitionAvailable(this)) {
            startNativeSpeech()
        } else {
            voiceConversationActive.value = false
            startRecorderFallback("Reconnaissance Android indisponible · secours serveur")
        }
    }

    private fun ensureWakeWordListening() {
        if (voiceConversationActive.value) return
        if (!appResumed || wakeListening || recording.value || pushToTalkHeld || wakeEnrollmentActive.value) return
        if (!wakeEnrolled.value || !wakePhraseStore.isEnrolled()) return
        if (!::model.isInitialized || model.state.value.session != SessionStage.CONNECTED) return
        if (model.state.value.busy || model.state.value.speaking) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return

        val template = wakePhraseStore.templateFeatures() ?: return
        val threshold = wakePhraseStore.threshold()
        wakeDetectorStop = false
        wakeListening = true
        wakeDetectorThread = Thread({
            var matchedScore: Float? = null
            val result = runCatching {
                WakePhraseTrainer.listenForWake(
                    template = template,
                    threshold = threshold,
                    shouldContinue = {
                        !wakeDetectorStop && appResumed && !recording.value && !pushToTalkHeld
                    },
                    onMatch = { score -> matchedScore = score }
                )
            }
            runOnUiThread {
                wakeDetectorThread = null
                wakeListening = false
                if (matchedScore != null && !wakeDetectorStop && appResumed &&
                    !recording.value && model.state.value.session == SessionStage.CONNECTED && !model.state.value.busy
                ) {
                    voiceMessage.value = "OK MEL reconnu · conversation active"
                    voiceConversationActive.value = true
                } else if (result.isFailure && !wakeDetectorStop) {
                    voiceMessage.value = "Écoute OK MEL indisponible · ${result.exceptionOrNull()?.message ?: "micro"}"
                }
            }
        }, "mel-ok-mel-listener").apply {
            isDaemon = true
            start()
        }
    }

    private fun stopWakeWordListening() {
        wakeDetectorStop = true
        wakeListening = false
        val recognizer = wakeRecognizer
        wakeRecognizer = null
        if (recognizer != null) {
            runCatching { recognizer.cancel() }
            runCatching { recognizer.destroy() }
        }
    }

    private fun scheduleWakeWordRestart() {
        mainHandler.postDelayed({
            if (!recording.value && !pushToTalkHeld && wakeEnrolled.value) ensureWakeWordListening()
        }, 900L)
    }

    private fun startNativeSpeech() {
        stopSpeechQuietly()
        val recognizer = runCatching {
            SpeechRecognizer.createSpeechRecognizer(this)
        }.getOrNull()
        if (recognizer == null) {
            startRecorderFallback("Reconnaissance Android indisponible · secours serveur")
            return
        }
        speechRecognizer = recognizer
        nativeSpeechListening = true
        recording.value = true
        voiceLevel.value = .08f
        voiceMessage.value = "J’écoute · français système"

        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                voiceMessage.value = "J’écoute…"
            }

            override fun onBeginningOfSpeech() {
                voiceMessage.value = "Je t’entends…"
            }

            override fun onRmsChanged(rmsdB: Float) {
                voiceLevel.value = ((rmsdB + 2f) / 12f).coerceIn(.05f, 1f)
            }
            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() {
                voiceLevel.value = .18f
                voiceMessage.value = "Transcription locale…"
            }

            override fun onError(error: Int) {
                stopSpeechQuietly()
                if (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED ||
                    error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE
                ) {
                    voiceConversationActive.value = false
                    startRecorderFallback("Français Android indisponible · secours MEL")
                } else if (voiceConversationActive.value && error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {
                    voiceMessage.value = "Micro occupé · je réessaie…"
                    mainHandler.postDelayed({
                        if (voiceConversationActive.value && appResumed && !recording.value && !model.state.value.busy) {
                            startVoice()
                        }
                    }, 650L)
                } else if (voiceConversationActive.value &&
                    (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)
                ) {
                    voiceConversationActive.value = false
                    voiceMessage.value = "Conversation en pause · dis « OK MEL »"
                    scheduleWakeWordRestart()
                } else {
                    voiceConversationActive.value = false
                    voiceMessage.value = speechErrorMessage(error)
                    scheduleWakeWordRestart()
                }
            }

            override fun onResults(results: Bundle?) {
                val text = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()
                stopSpeechQuietly()
                if (text.isBlank()) {
                    voiceConversationActive.value = false
                    startRecorderFallback("Aucune dictée reconnue · secours serveur")
                    return
                }
                voiceMessage.value = "Voix comprise · traitement…"
                dispatchCompanionText(text, voice = true)
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val partial = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()
                voiceMessage.value = if (partial.isBlank()) "J’écoute…" else "J’écoute · ${partial.take(42)}"
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.FRENCH.toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, Locale.FRENCH.toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        }
        runCatching { recognizer.startListening(intent) }
            .onFailure {
                stopSpeechQuietly()
                startRecorderFallback("Dictée Android impossible · secours serveur")
            }
    }

    @Suppress("DEPRECATION")
    private fun startRecorderFallback(reason: String) {
        stopRecorderQuietly()
        val useWebm = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        val file = File.createTempFile("mel-voice-", if (useWebm) ".webm" else ".m4a", cacheDir)
        recordingFile = file
        recordingMimeType = if (useWebm) "audio/webm" else "audio/mp4"
        val media = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else MediaRecorder()
        recorder = media
        runCatching {
            media.setAudioSource(MediaRecorder.AudioSource.MIC)
            if (useWebm) {
                media.setOutputFormat(MediaRecorder.OutputFormat.WEBM)
                media.setAudioEncoder(MediaRecorder.AudioEncoder.OPUS)
                media.setAudioEncodingBitRate(64_000)
                media.setAudioSamplingRate(48_000)
            } else {
                media.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                media.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                media.setAudioEncodingBitRate(96_000)
                media.setAudioSamplingRate(44_100)
            }
            media.setOutputFile(file.absolutePath)
            media.prepare()
            media.start()
            recording.value = true
            voiceLevel.value = .55f
            voiceMessage.value = "$reason · touche Micro pour envoyer"
        }.onFailure {
            stopRecorderQuietly()
            voiceMessage.value = "Micro indisponible : " + (it.message ?: "erreur")
        }
    }

    private fun finishVoice() {
        val media = recorder ?: return
        recorder = null
        val file = recordingFile
        val mimeType = recordingMimeType
        recordingFile = null
        val stopped = runCatching { media.stop() }.isSuccess
        runCatching { media.release() }
        recording.value = false

        if (!stopped || file == null || !file.exists() || file.length() == 0L) {
            file?.delete()
            voiceMessage.value = "Enregistrement trop court · réessaie"
            return
        }

        voiceMessage.value = "Transcription serveur…"
        Thread {
            try {
                val bytes = file.readBytes()
                file.delete()
                val transcript = client.transcribe(bytes, mimeType).optString("text").trim()
                if (transcript.isBlank()) throw IllegalStateException("TRANSCRIPTION_EMPTY")
                runOnUiThread {
                    voiceMessage.value = "Voix comprise · traitement…"
                    dispatchCompanionText(transcript, voice = true)
                }
            } catch (error: Throwable) {
                file.delete()
                runOnUiThread {
                    voiceMessage.value = "Erreur micro : " + (error.message ?: "lecture impossible")
                }
            }
        }.start()
    }

    private fun dispatchCompanionText(text: String, voice: Boolean) {
        val clean = text.trim()
        if (clean.isBlank()) return
        if (voice && voiceConversationActive.value && isConversationStopPhrase(clean)) {
            voiceConversationActive.value = false
            voiceMessage.value = "Conversation terminée · dis « OK MEL » pour me rappeler"
            model.localCompanionReply(
                clean,
                "D’accord. Je reste à l’écoute de « OK MEL ».",
                true
            )
            return
        }
        val command = MelCompanionCommands.parse(clean)
        if (command == null) {
            model.send(clean, voice = voice)
            return
        }
        executeCompanionCommand(clean, command, voice)
    }

    private fun isConversationStopPhrase(text: String): Boolean {
        val normalized = Normalizer.normalize(text.lowercase(Locale.FRENCH), Normalizer.Form.NFD)
            .replace("\\p{M}+".toRegex(), "")
            .replace(Regex("[^a-z0-9]+"), " ")
            .trim()
        return normalized == "stop mel" ||
            normalized == "arrete mel" ||
            normalized == "arrete la conversation" ||
            normalized == "fin de conversation" ||
            normalized == "c est bon mel" ||
            normalized == "au revoir mel"
    }

    private fun executeCompanionCommand(
        raw: String,
        command: MelCompanionCommand,
        voice: Boolean
    ) {
        when (command) {
            is MelCompanionCommand.Reply -> {
                model.localCompanionReply(raw, command.text, voice)
            }
            is MelCompanionCommand.SetTimer -> {
                val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
                    putExtra(AlarmClock.EXTRA_LENGTH, command.seconds)
                    putExtra(AlarmClock.EXTRA_MESSAGE, command.label)
                    putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                }
                launchCompanionIntent(
                    intent,
                    raw,
                    "Minuteur lancé pour ${spokenDuration(command.seconds)}.",
                    voice
                )
            }
            is MelCompanionCommand.SetAlarm -> {
                val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
                    putExtra(AlarmClock.EXTRA_HOUR, command.hour)
                    putExtra(AlarmClock.EXTRA_MINUTES, command.minute)
                    putExtra(AlarmClock.EXTRA_MESSAGE, command.label)
                    putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                }
                launchCompanionIntent(
                    intent,
                    raw,
                    "Alarme réglée pour %02d:%02d.".format(command.hour, command.minute),
                    voice
                )
            }
            MelCompanionCommand.ShowAlarms -> {
                launchCompanionIntent(
                    Intent(AlarmClock.ACTION_SHOW_ALARMS),
                    raw,
                    "J’ouvre tes alarmes.",
                    voice
                )
            }
            is MelCompanionCommand.Dial -> {
                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${command.number}"))
                launchCompanionIntent(
                    intent,
                    raw,
                    "J’ouvre le téléphone avec le numéro prêt. Tu gardes la validation de l’appel.",
                    voice
                )
            }
            is MelCompanionCommand.Sms -> {
                val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${command.number}")).apply {
                    putExtra("sms_body", command.body)
                }
                launchCompanionIntent(
                    intent,
                    raw,
                    "Je prépare le SMS. Tu gardes la validation de l’envoi.",
                    voice
                )
            }
            is MelCompanionCommand.Email -> {
                val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:${command.address}")).apply {
                    putExtra(Intent.EXTRA_TEXT, command.body)
                }
                launchCompanionIntent(
                    intent,
                    raw,
                    "Je prépare l’e-mail. Tu gardes la validation de l’envoi.",
                    voice
                )
            }
            MelCompanionCommand.OpenDialer -> {
                launchCompanionIntent(
                    Intent(Intent.ACTION_DIAL),
                    raw,
                    "J’ouvre le téléphone.",
                    voice
                )
            }
            is MelCompanionCommand.Navigate -> {
                val uri = Uri.parse("geo:0,0?q=" + Uri.encode(command.query))
                launchCompanionIntent(
                    Intent(Intent.ACTION_VIEW, uri),
                    raw,
                    "J’ouvre l’itinéraire vers ${command.query}.",
                    voice
                )
            }
            MelCompanionCommand.WifiSettings -> {
                launchCompanionIntent(
                    Intent(Settings.ACTION_WIFI_SETTINGS),
                    raw,
                    "J’ouvre les réglages Wi-Fi.",
                    voice
                )
            }
            MelCompanionCommand.BluetoothSettings -> {
                launchCompanionIntent(
                    Intent(Settings.ACTION_BLUETOOTH_SETTINGS),
                    raw,
                    "J’ouvre les réglages Bluetooth.",
                    voice
                )
            }
            MelCompanionCommand.LocationSettings -> {
                launchCompanionIntent(
                    Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS),
                    raw,
                    "J’ouvre les réglages de localisation.",
                    voice
                )
            }
            MelCompanionCommand.Camera -> {
                openCamera()
                model.localCompanionReply(raw, "J’ouvre la caméra.", voice)
            }
            MelCompanionCommand.FilePicker -> {
                pickFile()
                model.localCompanionReply(raw, "J’ouvre les fichiers.", voice)
            }
            MelCompanionCommand.EnableNotifications -> {
                enableNotifications()
                model.localCompanionReply(raw, "J’active les notifications MEL.", voice)
            }
            is MelCompanionCommand.OpenApp -> {
                val intent = Intent.makeMainSelectorActivity(
                    Intent.ACTION_MAIN,
                    appCategory(command.target)
                )
                launchCompanionIntent(
                    intent,
                    raw,
                    "J’ouvre ${command.label}.",
                    voice
                )
            }
            MelCompanionCommand.BatteryStatus -> {
                val percent = batteryPercent()
                val answer = if (percent == null)
                    "Je n’arrive pas à lire la batterie."
                else
                    "La batterie est à $percent pour cent."
                model.localCompanionReply(raw, answer, voice)
            }
            MelCompanionCommand.InternetStatus -> {
                val connected = internetValidated()
                val answer = if (connected)
                    "Oui, Android confirme une connexion Internet active."
                else
                    "Non, Android ne confirme pas de connexion Internet utilisable."
                model.localCompanionReply(raw, answer, voice)
            }
            MelCompanionCommand.VolumeStatus -> {
                val percent = mediaVolumePercent()
                val answer = if (percent == null)
                    "Je n’arrive pas à lire le volume multimédia."
                else
                    "Le volume multimédia est à $percent pour cent."
                model.localCompanionReply(raw, answer, voice)
            }
            MelCompanionCommand.GeneralSettings -> {
                launchCompanionIntent(Intent(Settings.ACTION_SETTINGS), raw, "J’ouvre les réglages Android.", voice)
            }
            MelCompanionCommand.AirplaneSettings -> {
                launchCompanionIntent(Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS), raw, "J’ouvre le mode avion.", voice)
            }
            MelCompanionCommand.DisplaySettings -> {
                launchCompanionIntent(Intent(Settings.ACTION_DISPLAY_SETTINGS), raw, "J’ouvre les réglages d’écran.", voice)
            }
            MelCompanionCommand.SoundSettings -> {
                launchCompanionIntent(Intent(Settings.ACTION_SOUND_SETTINGS), raw, "J’ouvre les réglages du son.", voice)
            }
            is MelCompanionCommand.CalendarEvent -> {
                val intent = Intent(Intent.ACTION_INSERT).apply {
                    data = CalendarContract.Events.CONTENT_URI
                    putExtra(CalendarContract.Events.TITLE, command.title)
                    putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, command.beginMillis)
                    putExtra(CalendarContract.EXTRA_EVENT_END_TIME, command.endMillis)
                }
                launchCompanionIntent(
                    intent,
                    raw,
                    "Je prépare l’événement « ${command.title} » dans ton agenda. Tu gardes la validation finale.",
                    voice
                )
            }
            is MelCompanionCommand.AddShoppingItem -> {
                val items = appendLocalItem("shopping", command.item, 80)
                model.localCompanionReply(
                    raw,
                    "J’ai ajouté ${command.item} à ta liste de courses. Elle contient ${items.size} élément${if (items.size > 1) "s" else ""}.",
                    voice
                )
            }
            MelCompanionCommand.ShowShoppingList -> {
                val items = readLocalItems("shopping")
                val answer = if (items.isEmpty()) {
                    "Ta liste de courses est vide."
                } else {
                    "Ta liste de courses contient : " + items.joinToString(", ") + "."
                }
                model.localCompanionReply(raw, answer, voice)
            }
            MelCompanionCommand.ClearShoppingList -> {
                writeLocalItems("shopping", emptyList())
                model.localCompanionReply(raw, "Ta liste de courses est vidée.", voice)
            }
            is MelCompanionCommand.AddNote -> {
                val notes = appendLocalItem("notes", command.note, 60)
                model.localCompanionReply(
                    raw,
                    "C’est noté. Tu as ${notes.size} note${if (notes.size > 1) "s" else ""} locale${if (notes.size > 1) "s" else ""}.",
                    voice
                )
            }
            MelCompanionCommand.ShowNotes -> {
                val notes = readLocalItems("notes")
                val answer = if (notes.isEmpty()) {
                    "Tu n’as aucune note locale."
                } else {
                    "Tes notes : " + notes.joinToString(". ") + "."
                }
                model.localCompanionReply(raw, answer, voice)
            }
            MelCompanionCommand.ClearNotes -> {
                writeLocalItems("notes", emptyList())
                model.localCompanionReply(raw, "Tes notes locales sont effacées.", voice)
            }
        }
    }

    private fun readLocalItems(key: String): List<String> {
        val prefs = getSharedPreferences("mel_companion_local", Context.MODE_PRIVATE)
        val raw = prefs.getString(key, "[]").orEmpty()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val value = array.optString(index).trim()
                    if (value.isNotBlank()) add(value)
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun writeLocalItems(key: String, items: List<String>) {
        val array = JSONArray()
        items.forEach { array.put(it) }
        getSharedPreferences("mel_companion_local", Context.MODE_PRIVATE)
            .edit()
            .putString(key, array.toString())
            .apply()
    }

    private fun appendLocalItem(key: String, value: String, maxItems: Int): List<String> {
        val clean = value.trim().take(500)
        if (clean.isBlank()) return readLocalItems(key)
        val items = (readLocalItems(key) + clean)
            .distinctBy { it.lowercase(Locale.FRENCH) }
            .takeLast(maxItems)
        writeLocalItems(key, items)
        return items
    }

    private fun appCategory(target: MelAppTarget): String = when (target) {
        MelAppTarget.CALCULATOR -> Intent.CATEGORY_APP_CALCULATOR
        MelAppTarget.CALENDAR -> Intent.CATEGORY_APP_CALENDAR
        MelAppTarget.CONTACTS -> Intent.CATEGORY_APP_CONTACTS
        MelAppTarget.EMAIL -> Intent.CATEGORY_APP_EMAIL
        MelAppTarget.FILES -> Intent.CATEGORY_APP_FILES
        MelAppTarget.GALLERY -> Intent.CATEGORY_APP_GALLERY
        MelAppTarget.MAPS -> Intent.CATEGORY_APP_MAPS
        MelAppTarget.MESSAGING -> Intent.CATEGORY_APP_MESSAGING
        MelAppTarget.MUSIC -> Intent.CATEGORY_APP_MUSIC
    }

    private fun batteryPercent(): Int? {
        val battery = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
        val level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        if (level < 0 || scale <= 0) return null
        return ((level * 100f) / scale).toInt().coerceIn(0, 100)
    }

    private fun internetValidated(): Boolean {
        val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun mediaVolumePercent(): Int? {
        val manager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = manager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        if (max <= 0) return null
        val current = manager.getStreamVolume(AudioManager.STREAM_MUSIC)
        return ((current * 100f) / max).toInt().coerceIn(0, 100)
    }

    private fun launchCompanionIntent(
        intent: Intent,
        raw: String,
        confirmation: String,
        voice: Boolean
    ) {
        if (intent.resolveActivity(packageManager) == null) {
            model.localCompanionReply(
                raw,
                "Je n’ai trouvé aucune application Android compatible pour cette action.",
                voice
            )
            return
        }
        runCatching { startActivity(intent) }
            .onSuccess { model.localCompanionReply(raw, confirmation, voice) }
            .onFailure {
                model.localCompanionReply(
                    raw,
                    "Android a refusé d’ouvrir cette action.",
                    voice
                )
            }
    }

    private fun spokenDuration(seconds: Int): String = when {
        seconds % 3600 == 0 -> {
            val hours = seconds / 3600
            if (hours == 1) "une heure" else "$hours heures"
        }
        seconds % 60 == 0 -> {
            val minutes = seconds / 60
            if (minutes == 1) "une minute" else "$minutes minutes"
        }
        else -> if (seconds == 1) "une seconde" else "$seconds secondes"
    }

    private fun stopSpeechQuietly() {
        val recognizer = speechRecognizer
        speechRecognizer = null
        nativeSpeechListening = false
        if (recognizer != null) {
            runCatching { recognizer.cancel() }
            runCatching { recognizer.destroy() }
        }
        recording.value = false
        voiceLevel.value = 0f
    }

    private fun speechErrorMessage(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Permission micro refusée"
        SpeechRecognizer.ERROR_NO_MATCH -> "Je n’ai pas compris · retouche Micro"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Je n’ai rien entendu · retouche Micro"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Micro occupé · réessaie dans un instant"
        SpeechRecognizer.ERROR_NETWORK,
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Reconnaissance vocale hors ligne · vérifie Internet"
        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED,
        SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "Français indisponible dans le moteur vocal"
        SpeechRecognizer.ERROR_SERVER,
        SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "Service vocal Android indisponible · réessaie"
        SpeechRecognizer.ERROR_TOO_MANY_REQUESTS -> "Trop de requêtes vocales · attends un instant"
        else -> "Micro Android interrompu · code $error"
    }

    private fun stopRecorderQuietly() {
        val media = recorder
        recorder = null
        if (media != null) {
            runCatching { media.stop() }
            runCatching { media.release() }
        }
        recordingFile?.delete()
        recordingFile = null
        recording.value = false
        voiceLevel.value = 0f
    }
}

private const val MAX_FILE_BYTES = 25_000_000

private val MelInk = Color(0xFFF2F8FF)
private val MelMuted = Color(0xFFA8B8CA)
private val MelCyan = Color(0xFF39E7FF)
private val MelBlue = Color(0xFF367CFF)
private val MelViolet = Color(0xFF8B7CFF)
private val MelSuccess = Color(0xFF59E6B1)
private val MelPanel = Color(0xEA0B1726)
private val MelPanelSoft = Color(0xD9142337)
private val MelGlass = Color(0xB8142940)
private val MelDanger = Color(0xFFFF879B)

@Composable
internal fun MelTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = MelCyan,
            secondary = Color(0xFF60A5FA),
            background = Color(0xFF06101D),
            surface = Color(0xFF0B1B2A),
            onPrimary = Color(0xFF00191D),
            onBackground = MelInk,
            onSurface = MelInk,
            error = MelDanger
        ),
        content = content
    )
}

@Composable
internal fun MelApp(
    state: MelUiState,
    recording: Boolean,
    voiceLevel: Float,
    voiceMessage: String,
    onLogin: (String, String) -> Unit,
    onRetrySession: () -> Unit,
    onDisconnect: () -> Unit,
    onMode: (MelMode) -> Unit,
    onSend: (String) -> Unit,
    onSync: () -> Unit,
    onVoicePress: () -> Unit,
    onVoiceRelease: () -> Unit,
    onFile: () -> Unit,
    onNotifications: () -> Unit,
    onDiagnostics: () -> Unit,
    onCopyDiagnostic: (String) -> Unit,
    onNormalProbe: () -> Unit,
    onFileProbe: () -> Unit,
    onBackgroundProbe: () -> Unit,
    onTestVoice: () -> Unit,
    cameraPhoto: Bitmap? = null,
    onCamera: () -> Unit = {},
    onSendCamera: () -> Unit = {},
    onRefreshCompanions: () -> Unit = {},
    onConnectMini: () -> Unit = {},
    onMiniPairCode: (String, String) -> Unit = { _, _ -> },
    wakeEnrollmentCount: Int = 0,
    wakeEnrollmentActive: Boolean = false,
    wakeEnrolled: Boolean = false,
    onWakeEnroll: () -> Unit = {},
    onWakeReset: () -> Unit = {}
) {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Color.Transparent,
        contentColor = MelInk
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(Color(0xFF02050A), Color(0xFF061322), Color(0xFF090B18))
                    )
                )
        ) {
        TechBackdrop()
        when (state.session) {
            SessionStage.DISCONNECTED -> LoginScreen(state, onLogin)
            SessionStage.VERIFYING -> LoadingScreen(state.status)
            SessionStage.ERROR -> SessionErrorScreen(state, onRetrySession, onDisconnect)
            SessionStage.CONNECTED -> ConversationScreen(
                state = state,
                recording = recording,
                voiceLevel = voiceLevel,
                voiceMessage = voiceMessage,
                onDisconnect = onDisconnect,
                onMode = onMode,
                onSend = onSend,
                onSync = onSync,
                onVoicePress = onVoicePress,
                onVoiceRelease = onVoiceRelease,
                onFile = onFile,
                onNotifications = onNotifications,
                onDiagnostics = onDiagnostics,
                onCopyDiagnostic = onCopyDiagnostic,
                onNormalProbe = onNormalProbe,
                onFileProbe = onFileProbe,
                onBackgroundProbe = onBackgroundProbe,
                onTestVoice = onTestVoice,
                cameraPhoto = cameraPhoto,
                onCamera = onCamera,
                onSendCamera = onSendCamera,
                onRefreshCompanions = onRefreshCompanions,
                onConnectMini = onConnectMini,
                onMiniPairCode = onMiniPairCode,
                wakeEnrollmentCount = wakeEnrollmentCount,
                wakeEnrollmentActive = wakeEnrollmentActive,
                wakeEnrolled = wakeEnrolled,
                onWakeEnroll = onWakeEnroll,
                onWakeReset = onWakeReset
            )
        }
    }
    }
}

@Composable
private fun TechBackdrop() {
    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(220.dp)
                .background(
                    Brush.radialGradient(
                        listOf(MelCyan.copy(alpha = .13f), Color.Transparent)
                    )
                )
        )
        Box(
            Modifier
                .fillMaxWidth()
                .height(320.dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.radialGradient(
                        listOf(MelViolet.copy(alpha = .10f), Color.Transparent)
                    )
                )
        )
    }
}

@Composable
private fun HudLabel(
    primary: String,
    secondary: String,
    accent: Color = MelCyan
) {
    Surface(
        color = Color(0x99040A12),
        border = BorderStroke(1.dp, accent.copy(alpha = .24f)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 7.dp)) {
            Text(
                primary,
                color = accent,
                fontSize = 10.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.4.sp
            )
            Text(
                secondary,
                color = MelMuted,
                fontSize = 9.sp,
                letterSpacing = .5.sp
            )
        }
    }
}

private enum class MelFaceState { IDLE, LISTENING, THINKING, SPEAKING, ERROR }

@Composable
private fun MelAvatar(
    size: Int = 84,
    online: Boolean = true,
    faceState: MelFaceState = if (online) MelFaceState.IDLE else MelFaceState.ERROR,
    voiceLevel: Float = 0f
) {
    val transition = rememberInfiniteTransition(label = "mel-face")
    val breathe by transition.animateFloat(
        initialValue = .985f,
        targetValue = 1.018f,
        animationSpec = infiniteRepeatable(animation = tween(2600), repeatMode = RepeatMode.Reverse),
        label = "mel-breathe"
    )
    val sway by transition.animateFloat(
        initialValue = -1.1f,
        targetValue = 1.1f,
        animationSpec = infiniteRepeatable(animation = tween(4300), repeatMode = RepeatMode.Reverse),
        label = "mel-sway"
    )
    val accent = when (faceState) {
        MelFaceState.LISTENING -> MelSuccess
        MelFaceState.THINKING -> MelViolet
        MelFaceState.SPEAKING -> MelBlue
        MelFaceState.ERROR -> MelDanger
        MelFaceState.IDLE -> MelCyan
    }
    val scale = when (faceState) {
        MelFaceState.LISTENING -> breathe + voiceLevel.coerceIn(0f, 1f) * .018f
        MelFaceState.THINKING -> breathe + .008f
        else -> breathe
    }
    Box(
        modifier = Modifier
            .size((size + 14).dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                rotationZ = if (faceState == MelFaceState.ERROR) 0f else sway * .35f
            }
            .clip(CircleShape)
            .background(
                Brush.radialGradient(
                    listOf(accent.copy(alpha = if (online) .48f else .12f), Color.Transparent)
                )
            )
            .testTag("mel-animated-avatar"),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(R.drawable.mel_futuristic_new),
            contentDescription = "Avatar de MEL",
            modifier = Modifier
                .size(size.dp)
                .clip(CircleShape)
                .border(
                    width = if (online) 2.dp else 1.dp,
                    color = if (online) accent.copy(alpha = .88f) else MelMuted.copy(alpha = .45f),
                    shape = CircleShape
                )
                .semantics { contentDescription = "Avatar MEL" },
            contentScale = ContentScale.Crop
        )
        Surface(
            modifier = Modifier.align(Alignment.BottomEnd).size((size * .20f).dp),
            shape = CircleShape,
            color = if (online) accent else Color(0xFF64748B),
            border = BorderStroke(2.dp, Color(0xFF071523))
        ) {}
    }
}

@Composable
private fun LoginScreen(state: MelUiState, onLogin: (String, String) -> Unit) {
    var user by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val focus = LocalFocusManager.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 22.dp, vertical = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        HudLabel("MEL // SECURE NODE", "ANDROID TERMINAL", MelViolet)
        Spacer(Modifier.height(18.dp))
        MelAvatar(112, online = false)
        Spacer(Modifier.height(14.dp))
        Text("MEL", color = MelInk, fontSize = 40.sp, fontWeight = FontWeight.Black, letterSpacing = 6.sp)
        Text(
            "PERSONAL INTELLIGENCE SYSTEM",
            color = MelCyan,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.2.sp,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "Interface Android sécurisée",
            color = MelMuted,
            fontSize = 13.sp,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MelPanel, contentColor = MelInk),
            border = BorderStroke(1.dp, MelCyan.copy(alpha = .18f)),
            shape = RoundedCornerShape(28.dp)
        ) {
            Column(Modifier.padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("MEL // LINK", color = MelCyan, fontSize = 12.sp, fontWeight = FontWeight.Black, letterSpacing = 1.5.sp)
                    Spacer(Modifier.width(8.dp))
                    StatusPill("CHIFFRÉ", MelSuccess)
                }
                Spacer(Modifier.height(10.dp))
                Text("Connexion à MEL", color = MelInk, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(5.dp))
                Text(
                    "Association sécurisée de ce téléphone. Ton mot de passe n’est jamais conservé.",
                    color = MelMuted,
                    fontSize = 13.sp,
                    lineHeight = 19.sp
                )
                Spacer(Modifier.height(18.dp))
                OutlinedTextField(
                    value = user,
                    onValueChange = { user = it },
                    modifier = Modifier.fillMaxWidth().testTag("login-user"),
                    label = { Text("Utilisateur (optionnel)") },
                    singleLine = true,
                    shape = RoundedCornerShape(18.dp)
                )
                Spacer(Modifier.height(11.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    modifier = Modifier.fillMaxWidth().testTag("login-password"),
                    label = { Text("Mot de passe MEL") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    shape = RoundedCornerShape(18.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = {
                        focus.clearFocus()
                        if (password.isNotBlank()) {
                            onLogin(user, password)
                            password = ""
                        }
                    })
                )
                if (!state.error.isNullOrBlank()) {
                    Spacer(Modifier.height(10.dp))
                    Surface(
                        color = MelDanger.copy(alpha = .10f),
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(1.dp, MelDanger.copy(alpha = .28f))
                    ) {
                        Text(state.error, modifier = Modifier.padding(11.dp), color = MelDanger, fontSize = 12.sp)
                    }
                }
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = {
                        focus.clearFocus()
                        onLogin(user, password)
                        password = ""
                    },
                    modifier = Modifier.fillMaxWidth().height(54.dp).testTag("login-submit"),
                    enabled = !state.busy && password.isNotBlank(),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MelCyan, contentColor = Color(0xFF001419))
                ) {
                    Text(if (state.busy) "Connexion…" else "Entrer dans MEL", fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    "Jeton local protégé par Android Keystore",
                    modifier = Modifier.fillMaxWidth(),
                    color = MelMuted,
                    fontSize = 11.sp,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun LoadingScreen(label: String) {
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        MelAvatar(82, online = false)
        Spacer(Modifier.height(20.dp))
        CircularProgressIndicator(color = MelCyan)
        Spacer(Modifier.height(16.dp))
        Text(label.ifBlank { "Connexion à MEL…" }, color = MelMuted)
    }
}

@Composable
private fun SessionErrorScreen(
    state: MelUiState,
    onRetry: () -> Unit,
    onReset: () -> Unit
) {
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        MelAvatar(82, online = false)
        Spacer(Modifier.height(20.dp))
        Text(
            "MEL est momentanément inaccessible",
            color = MelInk,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        Text(state.error ?: state.status, color = MelMuted, textAlign = TextAlign.Center)
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = onRetry,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(17.dp)
        ) { Text("Réessayer") }
        TextButton(onClick = onReset) { Text("Réassocier le téléphone") }
    }
}

@Composable
private fun StatusPill(label: String, accent: Color = MelSuccess) {
    Surface(
        color = accent.copy(alpha = .10f),
        contentColor = accent,
        border = BorderStroke(1.dp, accent.copy(alpha = .26f)),
        shape = CircleShape
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp
        )
    }
}

private enum class MobileSection(val label: String) {
    MEL("MEL"),
    KEYBOARD("Clavier"),
    CAMERA("Caméra"),
    COMPANION("MINI"),
    WEB("Web"),
    TOOLS("Outils")
}

@Composable
private fun ConversationScreen(
    state: MelUiState,
    recording: Boolean,
    voiceLevel: Float,
    voiceMessage: String,
    onDisconnect: () -> Unit,
    onMode: (MelMode) -> Unit,
    onSend: (String) -> Unit,
    onSync: () -> Unit,
    onVoicePress: () -> Unit,
    onVoiceRelease: () -> Unit,
    onFile: () -> Unit,
    onNotifications: () -> Unit,
    onDiagnostics: () -> Unit,
    onCopyDiagnostic: (String) -> Unit,
    onNormalProbe: () -> Unit,
    onFileProbe: () -> Unit,
    onBackgroundProbe: () -> Unit,
    onTestVoice: () -> Unit,
    cameraPhoto: Bitmap?,
    onCamera: () -> Unit,
    onSendCamera: () -> Unit,
    onRefreshCompanions: () -> Unit,
    onConnectMini: () -> Unit,
    onMiniPairCode: (String, String) -> Unit,
    wakeEnrollmentCount: Int,
    wakeEnrollmentActive: Boolean,
    wakeEnrolled: Boolean,
    onWakeEnroll: () -> Unit,
    onWakeReset: () -> Unit
) {
    var section by rememberSaveable { mutableStateOf(MobileSection.MEL) }
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    var draft by rememberSaveable { mutableStateOf("") }
    var clock by remember { mutableStateOf(SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())) }
    val focus = LocalFocusManager.current

    LaunchedEffect(Unit) {
        while (true) {
            clock = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
            delay(30_000)
        }
    }
    LaunchedEffect(section) {
        settingsOpen = false
        if (section == MobileSection.COMPANION) onRefreshCompanions()
    }

    val faceState = when {
        !state.error.isNullOrBlank() -> MelFaceState.ERROR
        recording -> MelFaceState.LISTENING
        state.speaking -> MelFaceState.SPEAKING
        state.busy -> MelFaceState.THINKING
        else -> MelFaceState.IDLE
    }

    Box(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
    ) {
        when (section) {
            MobileSection.MEL -> MiniHomePanel(
                state = state,
                faceState = faceState,
                voiceLevel = voiceLevel,
                voiceMessage = voiceMessage,
                recording = recording,
                onVoicePress = onVoicePress,
                onVoiceRelease = onVoiceRelease
            )
            MobileSection.KEYBOARD -> SectionSurface("CLAVIER // CHAT") {
                KeyboardPanel(
                    state = state,
                    draft = draft,
                    onDraft = { draft = it },
                    onSend = {
                        val outgoing = draft.trim()
                        if (outgoing.isNotBlank() && !state.busy) {
                            draft = ""
                            focus.clearFocus()
                            onSend(outgoing)
                        }
                    },
                    onVoicePress = onVoicePress,
                    onVoiceRelease = onVoiceRelease,
                    onFile = onFile,
                    recording = recording,
                    voiceMessage = voiceMessage
                )
            }
            MobileSection.CAMERA -> SectionSurface("CAMERA // MEL") {
                CameraPanel(photo = cameraPhoto, onCamera = onCamera, onSend = onSendCamera)
            }
            MobileSection.COMPANION -> SectionSurface("COMPAGNON // MINI") {
                CompanionPanel(
                    state = state,
                    onRefresh = onRefreshCompanions,
                    onConnectMini = onConnectMini,
                    onMiniPairCode = onMiniPairCode
                )
            }
            MobileSection.WEB -> SectionSurface("NAVIGATION // WEB") {
                WebPanel()
            }
            MobileSection.TOOLS -> SectionSurface("OUTILS // MEL") {
                NativeToolsPanel(
                    state = state,
                    onMode = onMode,
                    onSync = onSync,
                    onFile = onFile,
                    onNotifications = onNotifications,
                    onDiagnostics = onDiagnostics,
                    onCopyDiagnostic = onCopyDiagnostic,
                    onNormalProbe = onNormalProbe,
                    onFileProbe = onFileProbe,
                    onBackgroundProbe = onBackgroundProbe,
                    onTestVoice = onTestVoice
                )
            }
        }

        MiniReferenceTopBar(
            modifier = Modifier.align(Alignment.TopCenter),
            time = clock,
            onHome = { section = MobileSection.MEL },
            onSettings = { settingsOpen = !settingsOpen }
        )

        if (settingsOpen) {
            MiniSettingsPanel(
                modifier = Modifier.align(Alignment.TopEnd),
                state = state,
                onClose = { settingsOpen = false },
                onMode = onMode,
                onSelect = { section = it },
                onDisconnect = onDisconnect,
                wakeEnrollmentCount = wakeEnrollmentCount,
                wakeEnrollmentActive = wakeEnrollmentActive,
                wakeEnrolled = wakeEnrolled,
                onWakeEnroll = onWakeEnroll,
                onWakeReset = onWakeReset
            )
        }
    }
}

@Composable
private fun SectionSurface(
    title: String,
    content: @Composable () -> Unit
) {
    Column(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF030914))
            .padding(top = 70.dp, start = 12.dp, end = 12.dp, bottom = 10.dp)
    ) {
        Text(
            title,
            color = MelCyan,
            fontSize = 10.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 1.4.sp,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        Box(Modifier.weight(1f).fillMaxWidth()) { content() }
    }
}

@Composable
private fun MiniReferenceTopBar(
    modifier: Modifier = Modifier,
    time: String,
    onHome: () -> Unit,
    onSettings: () -> Unit
) {
    Surface(
        modifier = modifier,
        color = Color(0xC7030A13),
        border = BorderStroke(.5.dp, MelCyan.copy(alpha = .15f))
    ) {
        Row(
            Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = onHome, modifier = Modifier.testTag("home-button")) {
                Text("◈", color = MelCyan, fontSize = 23.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.width(6.dp))
                Text(
                    "MEL",
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 2.sp
                )
            }
            Spacer(Modifier.weight(1f))
            WifiGlyph()
            Spacer(Modifier.width(10.dp))
            Text(time, color = MelInk, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(10.dp))
            OutlinedButton(
                onClick = onSettings,
                modifier = Modifier.size(46.dp).testTag("settings-button"),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, MelCyan.copy(alpha = .72f))
            ) {
                Text("⚙", color = Color.White, fontSize = 22.sp)
            }
        }
    }
}

@Composable
private fun WifiGlyph() {
    Canvas(Modifier.size(28.dp)) {
        val stroke = size.width * .075f
        val color = Color.White.copy(alpha = .94f)
        drawArc(
            color = color,
            startAngle = 218f,
            sweepAngle = 104f,
            useCenter = false,
            topLeft = Offset(size.width * .06f, size.height * .04f),
            size = Size(size.width * .88f, size.height * .72f),
            style = Stroke(width = stroke)
        )
        drawArc(
            color = color,
            startAngle = 218f,
            sweepAngle = 104f,
            useCenter = false,
            topLeft = Offset(size.width * .23f, size.height * .27f),
            size = Size(size.width * .54f, size.height * .44f),
            style = Stroke(width = stroke)
        )
        drawCircle(
            color = MelCyan,
            radius = size.width * .065f,
            center = Offset(size.width * .50f, size.height * .72f)
        )
    }
}

@Composable
private fun MiniSettingsPanel(
    modifier: Modifier = Modifier,
    state: MelUiState,
    onClose: () -> Unit,
    onMode: (MelMode) -> Unit,
    onSelect: (MobileSection) -> Unit,
    onDisconnect: () -> Unit,
    wakeEnrollmentCount: Int,
    wakeEnrollmentActive: Boolean,
    wakeEnrolled: Boolean,
    onWakeEnroll: () -> Unit,
    onWakeReset: () -> Unit
) {
    Surface(
        modifier = modifier
            .padding(top = 66.dp, end = 10.dp)
            .width(304.dp)
            .heightIn(max = 620.dp)
            .testTag("settings-panel"),
        color = Color(0xF20A1626),
        border = BorderStroke(1.dp, MelCyan.copy(alpha = .72f)),
        shape = RoundedCornerShape(20.dp)
    ) {
        Column(
            Modifier.padding(12.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Paramètres", modifier = Modifier.weight(1f), color = MelInk, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                TextButton(onClick = onClose) { Text("×", color = MelCyan, fontSize = 25.sp) }
            }
            Surface(
                color = MelSuccess.copy(alpha = .08f),
                border = BorderStroke(1.dp, MelSuccess.copy(alpha = .24f)),
                shape = RoundedCornerShape(14.dp)
            ) {
                Column(Modifier.fillMaxWidth().padding(11.dp)) {
                    Text("Connexion", color = MelInk, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Text(state.status.ifBlank { "MEL connectée" }, color = MelSuccess, fontSize = 11.sp)
                }
            }
            SettingsAction("Clavier / Chat", "⌨", "settings-keyboard") { onSelect(MobileSection.KEYBOARD) }
            SettingsAction("Caméra", "◉", "settings-camera") { onSelect(MobileSection.CAMERA) }
            SettingsAction("Compagnon MINI", "◇", "settings-companion") { onSelect(MobileSection.COMPANION) }
            SettingsAction(
                label = when {
                    wakeEnrolled -> "OK MEL appris · 6/6"
                    wakeEnrollmentActive -> "Écoute OK MEL… ${wakeEnrollmentCount + 1}/6"
                    else -> "Enregistrer OK MEL · $wakeEnrollmentCount/6"
                },
                symbol = "◎",
                tag = "settings-wake-enroll",
                accent = if (wakeEnrolled) MelSuccess else MelCyan,
                enabled = !wakeEnrollmentActive && !wakeEnrolled
            ) { onWakeEnroll() }
            if (wakeEnrolled || wakeEnrollmentCount > 0) {
                SettingsAction(
                    "Réinitialiser OK MEL",
                    "↻",
                    "settings-wake-reset",
                    MelViolet,
                    enabled = !wakeEnrollmentActive
                ) { onWakeReset() }
            }
            SettingsAction("Tests / Outils", "⌁", "settings-tools") { onSelect(MobileSection.TOOLS) }
            SettingsAction(
                if (state.mode == MelMode.COMPLETE) "Passer en mode Normal" else "Activer le mode Complet",
                if (state.mode == MelMode.COMPLETE) "N" else "C",
                "settings-mode"
            ) {
                val next = if (state.mode == MelMode.COMPLETE) MelMode.NORMAL else MelMode.COMPLETE
                onMode(next)
                if (next == MelMode.COMPLETE) onSelect(MobileSection.TOOLS)
            }
            SettingsAction("Déconnexion", "×", "settings-disconnect", MelDanger) { onDisconnect() }
        }
    }
}

@Composable
private fun SettingsAction(
    label: String,
    symbol: String,
    tag: String,
    accent: Color = MelCyan,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().height(50.dp).testTag(tag),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, accent.copy(alpha = .42f))
    ) {
        Text(symbol, color = accent, fontSize = 18.sp)
        Spacer(Modifier.width(9.dp))
        Text(label, modifier = Modifier.weight(1f), color = MelInk, textAlign = TextAlign.Start, fontSize = 12.sp)
        Text("›", color = accent, fontSize = 18.sp)
    }
}

@Composable
private fun MiniHomePanel(
    state: MelUiState,
    faceState: MelFaceState,
    voiceLevel: Float,
    voiceMessage: String,
    recording: Boolean,
    onVoicePress: () -> Unit,
    onVoiceRelease: () -> Unit
) {
    val accent = when (faceState) {
        MelFaceState.LISTENING -> MelSuccess
        MelFaceState.THINKING -> MelViolet
        MelFaceState.SPEAKING -> MelBlue
        MelFaceState.ERROR -> MelDanger
        MelFaceState.IDLE -> MelCyan
    }
    val stateLabel = when (faceState) {
        MelFaceState.LISTENING -> "ÉCOUTE"
        MelFaceState.THINKING -> "RÉFLEXION"
        MelFaceState.SPEAKING -> "MEL"
        MelFaceState.ERROR -> "ERREUR"
        MelFaceState.IDLE -> "PARLER"
    }

    Box(Modifier.fillMaxSize().testTag("mini-stage")) {
        MelPortraitStage(faceState = faceState, voiceLevel = voiceLevel)

        VoiceWaveform(
            active = recording || faceState == MelFaceState.SPEAKING,
            level = if (recording) voiceLevel else if (faceState == MelFaceState.SPEAKING) .58f else .12f,
            accent = accent,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 176.dp)
        )

        ReferenceVoiceButton(
            label = if (recording) "ARRÊTER" else stateLabel,
            accent = accent,
            enabled = !state.busy || recording,
            onPress = onVoicePress,
            onRelease = onVoiceRelease,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 145.dp)
        )

        Text(
            voiceMessage,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 108.dp),
            color = if (recording) accent else MelMuted,
            fontSize = 10.sp,
            maxLines = 1
        )
    }
}

@Composable
private fun ReferenceVoiceButton(
    label: String,
    accent: Color,
    enabled: Boolean,
    onPress: () -> Unit,
    onRelease: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(158.dp)
            .testTag("mini-talk-button")
            .background(
                Brush.radialGradient(
                    listOf(
                        accent.copy(alpha = .20f),
                        Color(0xF0081828),
                        Color(0xE6040B14)
                    )
                ),
                CircleShape
            )
            .border(2.dp, accent.copy(alpha = .92f), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Box(
            Modifier
                .size(142.dp)
                .border(1.5.dp, accent.copy(alpha = .78f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Button(
                onClick = {},
                enabled = enabled,
                modifier = Modifier
                    .size(126.dp)
                    .pointerInput(enabled) {
                        awaitEachGesture {
                            if (!enabled) return@awaitEachGesture
                            awaitFirstDown(requireUnconsumed = false)
                            onPress()
                            waitForUpOrCancellation()
                            onRelease()
                        }
                    },
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xDA071522),
                    contentColor = Color.White,
                    disabledContainerColor = Color(0xAA071522),
                    disabledContentColor = Color.White.copy(alpha = .60f)
                ),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    MicrophoneGlyph(accent)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        label,
                        color = Color.White,
                        fontWeight = FontWeight.Black,
                        fontSize = 13.sp,
                        letterSpacing = 1.4.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun MicrophoneGlyph(accent: Color) {
    Canvas(Modifier.size(40.dp)) {
        val stroke = size.width * .075f
        val white = Color.White
        drawRoundRect(
            color = white,
            topLeft = Offset(size.width * .36f, size.height * .08f),
            size = Size(size.width * .28f, size.height * .48f),
            cornerRadius = CornerRadius(size.width * .14f, size.width * .14f),
            style = Stroke(width = stroke)
        )
        drawArc(
            color = accent,
            startAngle = 0f,
            sweepAngle = 180f,
            useCenter = false,
            topLeft = Offset(size.width * .23f, size.height * .28f),
            size = Size(size.width * .54f, size.height * .48f),
            style = Stroke(width = stroke)
        )
        drawLine(
            color = white,
            start = Offset(size.width * .50f, size.height * .75f),
            end = Offset(size.width * .50f, size.height * .90f),
            strokeWidth = stroke
        )
        drawLine(
            color = white,
            start = Offset(size.width * .36f, size.height * .90f),
            end = Offset(size.width * .64f, size.height * .90f),
            strokeWidth = stroke
        )
    }
}

@Composable
private fun MelPortraitStage(
    faceState: MelFaceState,
    voiceLevel: Float
) {
    val transition = rememberInfiniteTransition(label = "mel-photo-motion")
    val breathe by transition.animateFloat(
        initialValue = .995f,
        targetValue = 1.012f,
        animationSpec = infiniteRepeatable(animation = tween(3200), repeatMode = RepeatMode.Reverse),
        label = "mel-photo-breathe"
    )
    val sway by transition.animateFloat(
        initialValue = -1.0f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(animation = tween(4800), repeatMode = RepeatMode.Reverse),
        label = "mel-photo-sway"
    )
    val scale = when (faceState) {
        MelFaceState.LISTENING -> breathe + voiceLevel.coerceIn(0f, 1f) * .008f
        MelFaceState.THINKING -> breathe + .006f
        else -> breathe
    }
    val portraitTop = 54.dp

    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        Color(0xFF020812),
                        Color(0xFF06101C),
                        Color(0xFF020812)
                    )
                )
            )
            .testTag("mel-animated-avatar")
    ) {
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .padding(top = portraitTop)
                .fillMaxWidth()
                .aspectRatio(.78f)
                .clip(RoundedCornerShape(bottomStart = 34.dp, bottomEnd = 34.dp))
        ) {
            Image(
                painter = painterResource(R.drawable.mel_futuristic_new),
                contentDescription = "MEL",
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        translationX = sway * 1.2f
                        translationY = if (faceState == MelFaceState.IDLE) sway * .55f else 0f
                        rotationZ = if (faceState == MelFaceState.THINKING) sway * .12f else 0f
                    },
                contentScale = ContentScale.Fit,
                alignment = Alignment.TopCenter
            )

            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(
                                Color.Transparent,
                                Color.Transparent,
                                Color(0x08030A12),
                                Color(0xA8030912)
                            )
                        )
                    )
            )
        }

        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(350.dp)
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color.Transparent,
                            Color(0x88030912),
                            Color(0xFF030912)
                        )
                    )
                )
        )
    }
}

@Composable
private fun VoiceWaveform(
    active: Boolean,
    level: Float,
    accent: Color,
    modifier: Modifier = Modifier
) {
    val transition = rememberInfiniteTransition(label = "mel-wave")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(900), repeatMode = RepeatMode.Restart),
        label = "mel-wave-phase"
    )
    Canvas(modifier.size(width = 330.dp, height = 86.dp).testTag("voice-waveform")) {
        val bars = 35
        val step = size.width / bars
        val center = size.height / 2f
        for (i in 0 until bars) {
            val x = step * (i + .5f)
            val distance = kotlin.math.abs(i - (bars - 1) / 2f) / (bars / 2f)
            val envelope = (1f - distance * .70f).coerceIn(.18f, 1f)
            val oscillation = ((kotlin.math.sin((i * .72f + phase * 6.28318f).toDouble()) + 1.0) / 2.0).toFloat()
            val signal = if (active) (.30f + level.coerceIn(0f, 1f) * .70f) else (.13f + oscillation * .10f)
            val h = center * envelope * signal
            drawLine(
                color = accent.copy(alpha = if (active) .92f else .46f),
                start = Offset(x, center - h),
                end = Offset(x, center + h),
                strokeWidth = if (active) 3.2f else 2.2f
            )
        }
    }
}

@Composable
private fun WebPanel() {
    var input by rememberSaveable { mutableStateOf("https://www.google.com") }
    var target by rememberSaveable { mutableStateOf("https://www.google.com") }
    Column(Modifier.fillMaxSize()) {
        HudLabel("WEB // MEL", "NAVIGATION NATIVE · AUCUN NAVIGATEUR EXTERNE", MelCyan)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier.weight(1f).testTag("web-url"),
                singleLine = true,
                label = { Text("Adresse") }
            )
            Button(
                onClick = {
                    val clean = input.trim()
                    target = when {
                        clean.startsWith("https://") -> clean
                        clean.startsWith("http://") -> "https://" + clean.removePrefix("http://")
                        else -> "https://" + clean
                    }
                },
                modifier = Modifier.height(56.dp).testTag("web-go"),
                shape = RoundedCornerShape(14.dp)
            ) { Text("GO") }
        }
        Spacer(Modifier.height(8.dp))
        Surface(
            modifier = Modifier.fillMaxWidth().weight(1f),
            color = Color.Black,
            border = BorderStroke(1.dp, MelCyan.copy(alpha = .28f)),
            shape = RoundedCornerShape(18.dp)
        ) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    WebView(context).apply {
                        webViewClient = WebViewClient()
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        loadUrl(target)
                    }
                },
                update = { web ->
                    if (web.url != target) web.loadUrl(target)
                }
            )
        }
    }
}

@Composable
private fun KeyboardPanel(
    state: MelUiState,
    draft: String,
    onDraft: (String) -> Unit,
    onSend: () -> Unit,
    onVoicePress: () -> Unit,
    onVoiceRelease: () -> Unit,
    onFile: () -> Unit,
    recording: Boolean,
    voiceMessage: String
) {
    val listState = rememberLazyListState()
    LaunchedEffect(state.messages.size, state.busy) {
        if (state.messages.isNotEmpty()) {
            runCatching { listState.animateScrollToItem(state.messages.lastIndex) }
        }
    }
    Column(Modifier.fillMaxSize()) {
        HudLabel("CLAVIER // CHAT", if (state.mode == MelMode.COMPLETE) "MODE COMPLET" else "MODE NORMAL", MelCyan)
        Spacer(Modifier.height(8.dp))
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (state.messages.isEmpty()) {
                item {
                    Text(
                        "Écris directement à MEL. Le clavier Android s’ouvre dans cette vue.",
                        color = MelMuted,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }
            itemsIndexed(state.messages) { _, message -> MessageBubble(message) }
            if (state.busy) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = MelCyan)
                        Spacer(Modifier.width(8.dp))
                        Text(state.status, color = MelMuted, fontSize = 12.sp)
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Surface(
            color = MelPanel,
            border = BorderStroke(1.dp, Color.White.copy(alpha = .10f)),
            shape = RoundedCornerShape(22.dp)
        ) {
            Column(Modifier.padding(10.dp)) {
                Text(voiceMessage, color = if (recording) MelCyan else MelMuted, fontSize = 10.sp)
                Spacer(Modifier.height(5.dp))
                OutlinedTextField(
                    value = draft,
                    onValueChange = onDraft,
                    modifier = Modifier.fillMaxWidth().testTag("message-input"),
                    label = { Text("Message à MEL") },
                    minLines = 1,
                    maxLines = 5,
                    shape = RoundedCornerShape(16.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { onSend() })
                )
                Spacer(Modifier.height(7.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    OutlinedButton(
                        onClick = onFile,
                        modifier = Modifier.weight(.28f).height(46.dp).testTag("file-button"),
                        enabled = !state.busy,
                        shape = RoundedCornerShape(14.dp)
                    ) { Text("Fichier", fontSize = 11.sp) }
                    OutlinedButton(
                        onClick = {},
                        modifier = Modifier
                            .weight(.28f)
                            .height(46.dp)
                            .testTag("micro-button")
                            .pointerInput(state.busy, recording) {
                                awaitEachGesture {
                                    if (state.busy && !recording) return@awaitEachGesture
                                    awaitFirstDown(requireUnconsumed = false)
                                    onVoicePress()
                                    waitForUpOrCancellation()
                                    onVoiceRelease()
                                }
                            },
                        enabled = !state.busy || recording,
                        shape = RoundedCornerShape(14.dp)
                    ) { Text(if (recording) "Relâche" else "Maintenir", fontSize = 11.sp) }
                    Button(
                        onClick = onSend,
                        modifier = Modifier.weight(.44f).height(46.dp).testTag("send-button"),
                        enabled = draft.isNotBlank() && !state.busy,
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MelBlue)
                    ) { Text("Envoyer", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                }
            }
        }
    }
}

@Composable
private fun CameraPanel(
    photo: Bitmap?,
    onCamera: () -> Unit,
    onSend: () -> Unit
) {
    Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        HudLabel("CAMERA // MEL", "CAPTURE NATIVE ANDROID", MelBlue)
        Spacer(Modifier.height(12.dp))
        if (photo != null) {
            Image(
                bitmap = photo.asImageBitmap(),
                contentDescription = "Photo capturée pour MEL",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(360.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .border(1.dp, MelBlue.copy(alpha = .35f), RoundedCornerShape(24.dp)),
                contentScale = ContentScale.Crop
            )
        } else {
            Surface(
                modifier = Modifier.fillMaxWidth().height(360.dp),
                color = MelGlass,
                border = BorderStroke(1.dp, MelBlue.copy(alpha = .24f)),
                shape = RoundedCornerShape(24.dp)
            ) {
                Column(
                    Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    MelAvatar(118, online = true, faceState = MelFaceState.IDLE)
                    Spacer(Modifier.height(14.dp))
                    Text("Caméra prête", color = MelInk, fontWeight = FontWeight.Bold)
                    Text("Prends une photo puis envoie-la à MEL.", color = MelMuted, fontSize = 12.sp)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = onCamera,
            modifier = Modifier.fillMaxWidth().height(52.dp).testTag("camera-open"),
            shape = RoundedCornerShape(18.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MelBlue)
        ) { Text(if (photo == null) "OUVRIR LA CAMÉRA" else "REPRENDRE LA PHOTO", fontWeight = FontWeight.Bold) }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = onSend,
            modifier = Modifier.fillMaxWidth().height(50.dp).testTag("camera-send"),
            enabled = photo != null,
            shape = RoundedCornerShape(18.dp)
        ) { Text("ENVOYER À MEL") }
    }
}

@Composable
private fun CompanionPanel(
    state: MelUiState,
    onRefresh: () -> Unit,
    onConnectMini: () -> Unit,
    onMiniPairCode: (String, String) -> Unit
) {
    val bridgeState by MelBleBridgeService.bridgeState.collectAsStateWithLifecycle()
    val bleReady = bridgeState.contains("MINI CONNECTÉE") || bridgeState.contains("INTERNET OK")

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            HudLabel("COMPAGNON // MINI", if (bleReady) "BLUETOOTH CONNECTÉ" else "BLUETOOTH À CONNECTER", MelViolet)
            Spacer(Modifier.weight(1f))
            OutlinedButton(onClick = onRefresh, shape = RoundedCornerShape(14.dp)) { Text("Actualiser") }
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = if (bleReady) MelSuccess.copy(alpha = .08f) else MelGlass,
            border = BorderStroke(1.dp, (if (bleReady) MelSuccess else MelViolet).copy(alpha = .30f)),
            shape = RoundedCornerShape(20.dp)
        ) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Lien Bluetooth réel", color = MelInk, fontWeight = FontWeight.Bold)
                Text(bridgeState, color = if (bleReady) MelSuccess else MelMuted, fontSize = 12.sp)
                Button(
                    onClick = onConnectMini,
                    modifier = Modifier.fillMaxWidth().height(48.dp).testTag("mini-connect-button"),
                    colors = ButtonDefaults.buttonColors(containerColor = if (bleReady) MelBlue else MelViolet)
                ) {
                    Text(if (bleReady) "RELANCER LA CONNEXION MINI" else "CONNECTER MINI", fontWeight = FontWeight.Bold)
                }
            }
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MelPanel,
            border = BorderStroke(1.dp, MelCyan.copy(alpha = .20f)),
            shape = RoundedCornerShape(20.dp)
        ) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Internet de la MINI", color = MelInk, fontWeight = FontWeight.Bold)
                Text(
                    if (bridgeState.contains("INTERNET OK", ignoreCase = true))
                        "Relais Internet actif"
                    else if (bleReady)
                        "MINI connectée · activation Internet automatique"
                    else
                        "Le relais Internet s’active automatiquement dès que la MINI se connecte.",
                    color = if (bridgeState.contains("INTERNET OK", ignoreCase = true)) MelSuccess else MelMuted,
                    fontSize = 12.sp
                )
                state.miniPairError?.let { Text(it, color = MelDanger, fontSize = 12.sp) }
            }
        }

        Text("Appareils MEL", color = MelInk, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        if (state.companions.isEmpty()) {
            Text("Aucun appareil remonté par le serveur.", color = MelMuted, fontSize = 12.sp)
        } else {
            state.companions.forEach { device ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MelPanel,
                    border = BorderStroke(1.dp, (if (device.online) MelSuccess else MelMuted).copy(alpha = .24f)),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(device.name, color = MelInk, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                            StatusPill(if (device.online) "ONLINE" else "OFFLINE", if (device.online) MelSuccess else MelMuted)
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(device.phase ?: device.model, color = MelMuted, fontSize = 11.sp)
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            StatusPill("CAM " + hardwareState(device.camera), if (device.camera == true) MelSuccess else MelMuted)
                            StatusPill("MIC " + hardwareState(device.microphone), if (device.microphone == true) MelSuccess else MelMuted)
                            device.battery?.let { StatusPill("BAT $it%", MelBlue) }
                        }
                    }
                }
            }
        }
    }
}

private fun hardwareState(value: Boolean?): String = when (value) {
    true -> "OK"
    false -> "NON"
    null -> "?"
}

@Composable
private fun NativeToolsPanel(
    state: MelUiState,
    onMode: (MelMode) -> Unit,
    onSync: () -> Unit,
    onFile: () -> Unit,
    onNotifications: () -> Unit,
    onDiagnostics: () -> Unit,
    onCopyDiagnostic: (String) -> Unit,
    onNormalProbe: () -> Unit,
    onFileProbe: () -> Unit,
    onBackgroundProbe: () -> Unit,
    onTestVoice: () -> Unit
) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        HudLabel("OUTILS // MEL", "MODE COMPLET NATIF", MelViolet)
        Spacer(Modifier.height(10.dp))
        Text("Mode d’exécution", color = MelInk, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        Spacer(Modifier.height(6.dp))
        ModeSelector(state.mode, state.busy, onMode)
        Spacer(Modifier.height(10.dp))
        Button(
            onClick = { onMode(MelMode.COMPLETE) },
            modifier = Modifier.fillMaxWidth().height(50.dp).testTag("native-complete-button"),
            enabled = !state.busy && state.mode != MelMode.COMPLETE,
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MelViolet)
        ) {
            Text(
                if (state.mode == MelMode.COMPLETE) "MODE COMPLET ACTIF" else "ACTIVER LE MODE COMPLET",
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp
            )
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = onTestVoice,
            modifier = Modifier.fillMaxWidth().testTag("test-french-voice-button"),
            enabled = !state.busy
        ) { Text("TEST VOIX FRANÇAISE") }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            OutlinedButton(onClick = onSync, modifier = Modifier.weight(1f), enabled = !state.busy) { Text("Synchroniser") }
            OutlinedButton(onClick = onFile, modifier = Modifier.weight(1f), enabled = !state.busy) { Text("Fichier") }
        }
        Spacer(Modifier.height(7.dp))
        OutlinedButton(
            onClick = onNotifications,
            modifier = Modifier.fillMaxWidth(),
            enabled = !state.busy
        ) { Text("Arrière-plan / notifications") }
        Spacer(Modifier.height(10.dp))
        Button(
            onClick = onDiagnostics,
            modifier = Modifier.fillMaxWidth(),
            enabled = !state.busy,
            colors = ButtonDefaults.buttonColors(containerColor = MelBlue)
        ) { Text("AUTO-DIAGNOSTIC") }
        Spacer(Modifier.height(7.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton(onClick = onNormalProbe, modifier = Modifier.weight(1f), enabled = !state.busy) { Text("Normal", fontSize = 11.sp) }
            OutlinedButton(onClick = onFileProbe, modifier = Modifier.weight(1f), enabled = !state.busy) { Text("Fichier", fontSize = 11.sp) }
            OutlinedButton(onClick = onBackgroundProbe, modifier = Modifier.weight(1f), enabled = !state.busy) { Text("Fond", fontSize = 11.sp) }
        }
        if (!state.diagnosticReport.isNullOrBlank()) {
            Spacer(Modifier.height(10.dp))
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MelPanel,
                border = BorderStroke(1.dp, MelCyan.copy(alpha = .14f)),
                shape = RoundedCornerShape(18.dp)
            ) {
                Text(
                    state.diagnosticReport,
                    modifier = Modifier.padding(12.dp),
                    color = MelInk,
                    fontSize = 11.sp,
                    lineHeight = 16.sp
                )
            }
            Spacer(Modifier.height(6.dp))
            OutlinedButton(
                onClick = { onCopyDiagnostic(state.diagnosticReport) },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Copier diagnostic") }
        }
    }
}

@Composable
private fun ModeSelector(mode: MelMode, busy: Boolean, onMode: (MelMode) -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MelPanelSoft,
        border = BorderStroke(1.dp, Color.White.copy(alpha = .08f)),
        shape = RoundedCornerShape(20.dp)
    ) {
        Row(
            Modifier.padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            MelMode.entries.forEach { item ->
                if (item == mode) {
                    Button(
                        onClick = { onMode(item) },
                        modifier = Modifier.weight(1f).height(44.dp).testTag("mode-${item.wireValue}"),
                        enabled = !busy,
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (item == MelMode.NORMAL) MelBlue else MelViolet,
                            contentColor = Color.White
                        )
                    ) {
                        Text(item.label, fontWeight = FontWeight.Bold)
                    }
                } else {
                    TextButton(
                        onClick = { onMode(item) },
                        modifier = Modifier.weight(1f).height(44.dp).testTag("mode-${item.wireValue}"),
                        enabled = !busy,
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text(item.label, color = MelMuted)
                    }
                }
            }
        }
    }
}

@Composable
private fun MelCoreVisual(faceState: MelFaceState, voiceLevel: Float) {
    val label = when (faceState) {
        MelFaceState.LISTENING -> "ÉCOUTE"
        MelFaceState.THINKING -> "RÉFLEXION"
        MelFaceState.SPEAKING -> "MEL"
        MelFaceState.ERROR -> "ERREUR"
        MelFaceState.IDLE -> "PARLER"
    }
    val accent = when (faceState) {
        MelFaceState.LISTENING -> MelSuccess
        MelFaceState.THINKING -> MelViolet
        MelFaceState.SPEAKING -> MelBlue
        MelFaceState.ERROR -> MelDanger
        MelFaceState.IDLE -> MelCyan
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .testTag("mini-stage"),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            "MINI // MEL",
            color = MelMuted,
            fontSize = 10.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 2.sp
        )
        Spacer(Modifier.height(8.dp))
        MelAvatar(
            size = 176,
            online = true,
            faceState = faceState,
            voiceLevel = voiceLevel
        )
        Spacer(Modifier.height(10.dp))
        Surface(
            color = accent.copy(alpha = .12f),
            border = BorderStroke(1.dp, accent.copy(alpha = .34f)),
            shape = RoundedCornerShape(18.dp)
        ) {
            Text(
                label,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 9.dp),
                color = accent,
                fontSize = 13.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 2.2.sp
            )
        }
    }
}

@Composable
private fun MessageBubble(message: MelChatMessage) {
    val user = message.role == "user"
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (user) Arrangement.End else Arrangement.Start
    ) {
        Surface(
            color = if (user) Color(0xE621436E) else MelPanel,
            border = BorderStroke(
                1.dp,
                if (user) MelBlue.copy(alpha = .18f) else MelCyan.copy(alpha = .14f)
            ),
            shape = RoundedCornerShape(
                topStart = 20.dp,
                topEnd = 20.dp,
                bottomStart = if (user) 20.dp else 6.dp,
                bottomEnd = if (user) 6.dp else 20.dp
            ),
            modifier = Modifier.fillMaxWidth(.90f)
        ) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 11.dp)) {
                Text(
                    if (user) if (message.voice) "Adrien · voix" else "Adrien" else "MEL",
                    color = if (user) Color(0xFFC8E4FF) else MelCyan,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = .5.sp
                )
                Spacer(Modifier.height(3.dp))
                Text(message.text, color = MelInk, lineHeight = 20.sp, fontSize = 14.sp)
            }
        }
    }
}

// VISUAL_SHELL: 0.6.11-mini-reference-luna-audio
