package fr.veriteinterdite.mel

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.provider.OpenableColumns
import android.provider.Settings
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
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
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
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Locale
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    private lateinit var client: MelApiClient
    private lateinit var vault: TokenVault
    private lateinit var model: MelViewModel
    private var recorder: MediaRecorder? = null
    private var recordingFile: File? = null
    private var recordingMimeType: String = "audio/mp4"
    private var speechRecognizer: SpeechRecognizer? = null
    private var nativeSpeechListening = false
    private val recording = mutableStateOf(false)
    private val voiceLevel = mutableStateOf(0f)
    private val voiceMessage = mutableStateOf("Micro prêt")
    private val cameraPhoto = mutableStateOf<Bitmap?>(null)

    private val microphonePermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startVoice()
        else voiceMessage.value = "Permission micro refusée"
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
        enableEdgeToEdge()

        vault = TokenVault(this)
        client = MelApiClient(BuildConfig.MEL_BASE_URL, deviceId(), vault)
        val factory = MelViewModel.factory(this, client, vault, conversationId)
        model = ViewModelProvider(this, factory)[MelViewModel::class.java]

        setContent {
            val state by model.state.collectAsStateWithLifecycle()
            LaunchedEffect(state.busy, state.error, recording.value) {
                if (!state.busy && !recording.value &&
                    (voiceMessage.value.startsWith("Fichier") ||
                        voiceMessage.value.startsWith("Voix") ||
                        voiceMessage.value == "Transcription…")
                ) {
                    voiceMessage.value = "Micro prêt"
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
                    onSend = { model.send(it) },
                    onSync = model::sync,
                    onVoice = ::toggleVoice,
                    onFile = ::pickFile,
                    onNotifications = ::enableNotifications,
                    onDiagnostics = model::runDiagnostics,
                    onCopyDiagnostic = ::copyDiagnostic,
                    onNormalProbe = model::runNormalProbe,
                    onFileProbe = model::runFileProbe,
                    onBackgroundProbe = model::runBackgroundProbe,
                    cameraPhoto = cameraPhoto.value,
                    onCamera = ::openCamera,
                    onSendCamera = ::sendCameraPhoto,
                    onRefreshCompanions = model::refreshCompanions
                )
            }
        }
    }

    override fun onDestroy() {
        stopSpeechQuietly()
        stopRecorderQuietly()
        super.onDestroy()
    }

    private fun deviceId(): String {
        val raw = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        return "android-" + (raw ?: "unknown").take(64)
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
        if (model.state.value.session != SessionStage.CONNECTED) {
            voiceMessage.value = "Connecte d’abord le téléphone à MEL"
            return
        }
        cameraCapture.launch(null)
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

    private fun toggleVoice() {
        if (recording.value) {
            if (nativeSpeechListening) {
                voiceMessage.value = "Finalisation de la dictée…"
                runCatching { speechRecognizer?.stopListening() }
            } else {
                finishVoice()
            }
            return
        }
        if (model.state.value.session != SessionStage.CONNECTED) {
            voiceMessage.value = "Connecte d’abord le téléphone à MEL"
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        startVoice()
    }

    private fun startVoice() {
        if (SpeechRecognizer.isRecognitionAvailable(this)) {
            startNativeSpeech()
        } else {
            startRecorderFallback("Reconnaissance Android indisponible · secours serveur")
        }
    }

    private fun startNativeSpeech() {
        stopSpeechQuietly()
        val onDevice = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            SpeechRecognizer.isOnDeviceRecognitionAvailable(this)
        val recognizer = runCatching {
            if (onDevice) SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
            else SpeechRecognizer.createSpeechRecognizer(this)
        }.getOrNull()
        if (recognizer == null) {
            startRecorderFallback("Reconnaissance Android indisponible · secours serveur")
            return
        }
        speechRecognizer = recognizer
        nativeSpeechListening = true
        recording.value = true
        voiceLevel.value = .08f
        voiceMessage.value = if (onDevice) "J’écoute · moteur local" else "J’écoute · moteur système"

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
                voiceMessage.value = speechErrorMessage(error)
            }

            override fun onResults(results: Bundle?) {
                val text = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()
                stopSpeechQuietly()
                if (text.isBlank()) {
                    startRecorderFallback("Aucune dictée reconnue · secours serveur")
                    return
                }
                voiceMessage.value = "Voix comprise · envoi à MEL…"
                model.send(text, voice = true)
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
                model.sendVoice(bytes, mimeType)
                runOnUiThread { voiceMessage.value = "Voix envoyée · MEL traite…" }
            } catch (error: Throwable) {
                file.delete()
                runOnUiThread {
                    voiceMessage.value = "Erreur micro : " + (error.message ?: "lecture impossible")
                }
            }
        }.start()
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
    onVoice: () -> Unit,
    onFile: () -> Unit,
    onNotifications: () -> Unit,
    onDiagnostics: () -> Unit,
    onCopyDiagnostic: (String) -> Unit,
    onNormalProbe: () -> Unit,
    onFileProbe: () -> Unit,
    onBackgroundProbe: () -> Unit,
    cameraPhoto: Bitmap? = null,
    onCamera: () -> Unit = {},
    onSendCamera: () -> Unit = {},
    onRefreshCompanions: () -> Unit = {}
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
                onVoice = onVoice,
                onFile = onFile,
                onNotifications = onNotifications,
                onDiagnostics = onDiagnostics,
                onCopyDiagnostic = onCopyDiagnostic,
                onNormalProbe = onNormalProbe,
                onFileProbe = onFileProbe,
                onBackgroundProbe = onBackgroundProbe,
                cameraPhoto = cameraPhoto,
                onCamera = onCamera,
                onSendCamera = onSendCamera,
                onRefreshCompanions = onRefreshCompanions
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
        animationSpec = infiniteRepeatable(
            animation = tween(2600),
            repeatMode = RepeatMode.Reverse
        ),
        label = "mel-breathe"
    )
    val sway by transition.animateFloat(
        initialValue = -1.2f,
        targetValue = 1.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(4300),
            repeatMode = RepeatMode.Reverse
        ),
        label = "mel-sway"
    )
    val gaze by transition.animateFloat(
        initialValue = -1.8f,
        targetValue = 1.8f,
        animationSpec = infiniteRepeatable(
            animation = tween(3600),
            repeatMode = RepeatMode.Reverse
        ),
        label = "mel-gaze"
    )
    val blink by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 6200
                0f at 0
                0f at 2350
                1f at 2420
                0f at 2500
                0f at 4520
                1f at 4590
                0f at 4680
                0f at 6200
            }
        ),
        label = "mel-blink"
    )
    val pulse by transition.animateFloat(
        initialValue = .34f,
        targetValue = .72f,
        animationSpec = infiniteRepeatable(
            animation = tween(if (faceState == MelFaceState.THINKING) 680 else 1300),
            repeatMode = RepeatMode.Reverse
        ),
        label = "mel-pulse"
    )
    val mouthPhase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(if (faceState == MelFaceState.SPEAKING) 220 else 680),
            repeatMode = RepeatMode.Reverse
        ),
        label = "mel-mouth"
    )

    val accent = when (faceState) {
        MelFaceState.LISTENING -> MelSuccess
        MelFaceState.THINKING -> MelViolet
        MelFaceState.SPEAKING -> MelBlue
        MelFaceState.ERROR -> MelDanger
        MelFaceState.IDLE -> MelCyan
    }
    val liveScale = when (faceState) {
        MelFaceState.LISTENING -> 1f + voiceLevel.coerceIn(0f, 1f) * .025f
        MelFaceState.THINKING -> breathe + .008f
        else -> breathe
    }
    val tilt = when (faceState) {
        MelFaceState.LISTENING -> sway * .35f
        MelFaceState.THINKING -> sway * 1.4f
        MelFaceState.SPEAKING -> sway * .55f
        MelFaceState.ERROR -> 0f
        MelFaceState.IDLE -> sway
    }
    val blinkHeight = (size * .042f * blink).dp
    val eyeY = (-size * .062f).dp
    val pupilShift = (gaze * if (faceState == MelFaceState.THINKING) 1.5f else 1f).dp
    val mouthY = (size * .105f).dp
    val mouthWidth = when (faceState) {
        MelFaceState.SPEAKING -> (size * (.14f + mouthPhase * .08f)).dp
        MelFaceState.LISTENING -> (size * (.13f + voiceLevel.coerceIn(0f, 1f) * .05f)).dp
        else -> (size * .14f).dp
    }
    val mouthHeight = when (faceState) {
        MelFaceState.SPEAKING -> (size * (.025f + mouthPhase * .035f)).dp
        MelFaceState.LISTENING -> (size * .026f).dp
        MelFaceState.ERROR -> 2.dp
        else -> (size * .024f).dp
    }

    Box(
        modifier = Modifier
            .size((size + 14).dp)
            .graphicsLayer {
                scaleX = liveScale
                scaleY = liveScale
                rotationZ = tilt
                translationY = if (faceState == MelFaceState.IDLE) sway * .7f else 0f
            }
            .clip(CircleShape)
            .background(
                Brush.radialGradient(
                    listOf(
                        accent.copy(alpha = if (online) pulse else .10f),
                        accent.copy(alpha = .08f),
                        Color.Transparent
                    )
                )
            )
            .testTag("mel-animated-avatar"),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(R.drawable.ic_mel_avatar),
            contentDescription = "Avatar de MEL",
            modifier = Modifier
                .size(size.dp)
                .clip(CircleShape)
                .border(
                    width = if (online) 2.dp else 1.dp,
                    color = if (online) accent.copy(alpha = .92f) else MelMuted.copy(alpha = .55f),
                    shape = CircleShape
                )
                .semantics { contentDescription = "Avatar MEL" }
        )

        if (online) {
            Row(
                modifier = Modifier.offset(y = eyeY),
                horizontalArrangement = Arrangement.spacedBy((size * .10f).dp)
            ) {
                repeat(2) {
                    Box(
                        Modifier
                            .size((size * .078f).dp, (size * .038f).dp)
                            .clip(CircleShape)
                            .background(Color(0xFF14212A))
                    ) {
                        Box(
                            Modifier
                                .align(Alignment.Center)
                                .offset(x = pupilShift)
                                .size((size * .020f).dp)
                                .clip(CircleShape)
                                .background(accent.copy(alpha = .95f))
                        )
                        if (blink > .02f) {
                            Box(
                                Modifier
                                    .align(Alignment.Center)
                                    .fillMaxWidth()
                                    .height(blinkHeight)
                                    .background(Color(0xFFD7A382))
                            )
                        }
                    }
                }
            }

            Box(
                modifier = Modifier
                    .offset(y = mouthY)
                    .size((size * .22f).dp, (size * .085f).dp)
                    .background(Color(0xFFD7A382)),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    Modifier
                        .size(mouthWidth, mouthHeight)
                        .clip(CircleShape)
                        .background(
                            if (faceState == MelFaceState.ERROR) MelDanger.copy(alpha = .85f)
                            else Color(0xFFB87867)
                        )
                )
            }
        }

        Surface(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .size((size * .20f).dp),
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
    onVoice: () -> Unit,
    onFile: () -> Unit,
    onNotifications: () -> Unit,
    onDiagnostics: () -> Unit,
    onCopyDiagnostic: (String) -> Unit,
    onNormalProbe: () -> Unit,
    onFileProbe: () -> Unit,
    onBackgroundProbe: () -> Unit,
    cameraPhoto: Bitmap?,
    onCamera: () -> Unit,
    onSendCamera: () -> Unit,
    onRefreshCompanions: () -> Unit
) {
    var section by rememberSaveable { mutableStateOf(MobileSection.MEL) }
    var draft by rememberSaveable { mutableStateOf("") }
    var speaking by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current

    LaunchedEffect(state.messages.size) {
        if (state.messages.lastOrNull()?.role == "mel") {
            speaking = true
            delay(1800)
            speaking = false
        }
    }
    LaunchedEffect(section) {
        if (section == MobileSection.COMPANION) onRefreshCompanions()
    }

    val faceState = when {
        !state.error.isNullOrBlank() -> MelFaceState.ERROR
        recording -> MelFaceState.LISTENING
        state.busy -> MelFaceState.THINKING
        speaking -> MelFaceState.SPEAKING
        else -> MelFaceState.IDLE
    }

    Scaffold(
        containerColor = Color.Transparent,
        modifier = Modifier
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding(),
        topBar = {
            Surface(
                color = Color(0xE605111F),
                contentColor = MelInk,
                border = BorderStroke(.5.dp, MelCyan.copy(alpha = .10f))
            ) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "MINI // MEL",
                            color = MelInk,
                            fontWeight = FontWeight.Black,
                            fontSize = 19.sp,
                            letterSpacing = 1.8.sp
                        )
                        Text(
                            state.status.ifBlank { "PARLER" },
                            color = MelMuted,
                            fontSize = 10.sp,
                            maxLines = 1
                        )
                    }
                    StatusPill(if (state.mode == MelMode.COMPLETE) "COMPLET" else "NORMAL",
                        if (state.mode == MelMode.COMPLETE) MelViolet else MelCyan)
                    Spacer(Modifier.width(6.dp))
                    TextButton(onClick = onDisconnect) { Text("Quitter", color = MelMuted) }
                }
            }
        },
        bottomBar = {
            MobileNavigationBar(section) { section = it }
        }
    ) { padding ->
        Box(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            when (section) {
                MobileSection.MEL -> MiniHomePanel(
                    state = state,
                    faceState = faceState,
                    voiceLevel = voiceLevel,
                    voiceMessage = voiceMessage,
                    recording = recording,
                    onVoice = onVoice,
                    onKeyboard = { section = MobileSection.KEYBOARD }
                )
                MobileSection.KEYBOARD -> KeyboardPanel(
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
                    onVoice = onVoice,
                    onFile = onFile,
                    recording = recording,
                    voiceMessage = voiceMessage
                )
                MobileSection.CAMERA -> CameraPanel(
                    photo = cameraPhoto,
                    onCamera = onCamera,
                    onSend = onSendCamera
                )
                MobileSection.COMPANION -> CompanionPanel(
                    state = state,
                    onRefresh = onRefreshCompanions
                )
                MobileSection.TOOLS -> NativeToolsPanel(
                    state = state,
                    onMode = onMode,
                    onSync = onSync,
                    onFile = onFile,
                    onNotifications = onNotifications,
                    onDiagnostics = onDiagnostics,
                    onCopyDiagnostic = onCopyDiagnostic,
                    onNormalProbe = onNormalProbe,
                    onFileProbe = onFileProbe,
                    onBackgroundProbe = onBackgroundProbe
                )
            }
        }
    }
}

@Composable
private fun MobileNavigationBar(
    selected: MobileSection,
    onSelect: (MobileSection) -> Unit
) {
    Surface(
        color = Color(0xF505111F),
        border = BorderStroke(.5.dp, MelCyan.copy(alpha = .10f))
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            MobileSection.entries.forEach { item ->
                val active = item == selected
                TextButton(
                    onClick = { onSelect(item) },
                    modifier = Modifier.weight(1f).testTag("nav-" + item.name.lowercase()),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text(
                        item.label,
                        color = if (active) MelCyan else MelMuted,
                        fontSize = 10.sp,
                        fontWeight = if (active) FontWeight.Black else FontWeight.Medium
                    )
                }
            }
        }
    }
}

@Composable
private fun MiniHomePanel(
    state: MelUiState,
    faceState: MelFaceState,
    voiceLevel: Float,
    voiceMessage: String,
    recording: Boolean,
    onVoice: () -> Unit,
    onKeyboard: () -> Unit
) {
    val lastMel = state.messages.lastOrNull { it.role == "mel" }?.text
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(8.dp))
        MelCoreVisual(faceState, voiceLevel)
        Spacer(Modifier.height(8.dp))

        if (!lastMel.isNullOrBlank()) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MelGlass,
                border = BorderStroke(1.dp, MelCyan.copy(alpha = .14f)),
                shape = RoundedCornerShape(20.dp)
            ) {
                Column(Modifier.padding(14.dp)) {
                    Text("MEL", color = MelCyan, fontSize = 10.sp, fontWeight = FontWeight.Black)
                    Spacer(Modifier.height(4.dp))
                    Text(lastMel, color = MelInk, fontSize = 14.sp, lineHeight = 20.sp, maxLines = 5)
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        Button(
            onClick = onVoice,
            modifier = Modifier
                .fillMaxWidth(.74f)
                .height(62.dp)
                .testTag("mini-talk-button"),
            enabled = !state.busy || recording,
            shape = RoundedCornerShape(24.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (recording) MelDanger else MelBlue,
                contentColor = Color.White
            )
        ) {
            Text(
                if (recording) "ARRÊTER" else "PARLER",
                fontWeight = FontWeight.Black,
                fontSize = 16.sp,
                letterSpacing = 2.sp
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(voiceMessage, color = if (recording) MelCyan else MelMuted, fontSize = 11.sp)
        Spacer(Modifier.height(10.dp))
        OutlinedButton(
            onClick = onKeyboard,
            modifier = Modifier.fillMaxWidth(.74f),
            shape = RoundedCornerShape(18.dp)
        ) {
            Text("CLAVIER", letterSpacing = 1.2.sp)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            StatusPill("VOICE", MelCyan)
            StatusPill("CAMERA", MelBlue)
            StatusPill("MINI", MelViolet)
        }
    }
}

@Composable
private fun KeyboardPanel(
    state: MelUiState,
    draft: String,
    onDraft: (String) -> Unit,
    onSend: () -> Unit,
    onVoice: () -> Unit,
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
                        onClick = onVoice,
                        modifier = Modifier.weight(.28f).height(46.dp).testTag("micro-button"),
                        enabled = !state.busy || recording,
                        shape = RoundedCornerShape(14.dp)
                    ) { Text(if (recording) "Stop" else "Micro", fontSize = 11.sp) }
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
    onRefresh: () -> Unit
) {
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            HudLabel("COMPAGNON // MINI", state.companionStatus.ifBlank { "APPAREILS MEL" }, MelViolet)
            Spacer(Modifier.weight(1f))
            OutlinedButton(onClick = onRefresh, shape = RoundedCornerShape(14.dp)) { Text("Actualiser") }
        }
        Spacer(Modifier.height(10.dp))
        if (state.companions.isEmpty()) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MelGlass,
                border = BorderStroke(1.dp, MelViolet.copy(alpha = .22f)),
                shape = RoundedCornerShape(22.dp)
            ) {
                Column(Modifier.padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    MelAvatar(104, online = false, faceState = MelFaceState.IDLE)
                    Spacer(Modifier.height(10.dp))
                    Text("Aucun MINI détecté", color = MelInk, fontWeight = FontWeight.Bold)
                    Text("Appaire MINI à MEL puis actualise.", color = MelMuted, fontSize = 12.sp)
                }
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                itemsIndexed(state.companions) { _, device ->
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = MelPanel,
                        border = BorderStroke(
                            1.dp,
                            (if (device.online) MelSuccess else MelMuted).copy(alpha = .24f)
                        ),
                        shape = RoundedCornerShape(20.dp)
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(device.name, color = MelInk, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                StatusPill(if (device.online) "ONLINE" else "OFFLINE",
                                    if (device.online) MelSuccess else MelMuted)
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
    onBackgroundProbe: () -> Unit
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
            enabled = !state.busy,
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MelViolet)
        ) { Text("PROFESSOR / MODE COMPLET NATIF", fontWeight = FontWeight.Bold, fontSize = 12.sp) }
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
