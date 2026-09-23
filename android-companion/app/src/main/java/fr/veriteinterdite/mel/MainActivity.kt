package fr.veriteinterdite.mel

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.weight
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.io.File

class MainActivity : ComponentActivity() {
    private lateinit var client: MelApiClient
    private lateinit var vault: TokenVault
    private lateinit var model: MelViewModel
    private var recorder: MediaRecorder? = null
    private var recordingFile: File? = null
    private val recording = mutableStateOf(false)
    private val voiceMessage = mutableStateOf("Micro prêt")

    private val microphonePermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startVoice()
        else voiceMessage.value = "Permission micro refusée"
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
            MelTheme {
                MelApp(
                    state = state,
                    recording = recording.value,
                    voiceMessage = voiceMessage.value,
                    onLogin = model::pair,
                    onRetrySession = model::verifyExistingSession,
                    onDisconnect = model::disconnect,
                    onMode = model::setMode,
                    onSend = { model.send(it) },
                    onSync = model::sync,
                    onVoice = ::toggleVoice
                )
            }
        }
    }

    override fun onDestroy() {
        stopRecorderQuietly()
        super.onDestroy()
    }

    private fun deviceId(): String {
        val raw = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        return "android-" + (raw ?: "unknown").take(64)
    }

    private fun toggleVoice() {
        if (recording.value) {
            finishVoice()
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

    @Suppress("DEPRECATION")
    private fun startVoice() {
        val file = File.createTempFile("mel-voice-", ".m4a", cacheDir)
        recordingFile = file
        val media = MediaRecorder()
        recorder = media
        runCatching {
            media.setAudioSource(MediaRecorder.AudioSource.MIC)
            media.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            media.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            media.setAudioEncodingBitRate(96_000)
            media.setAudioSamplingRate(44_100)
            media.setOutputFile(file.absolutePath)
            media.prepare()
            media.start()
            recording.value = true
            voiceMessage.value = "J’écoute… touche à nouveau pour envoyer"
        }.onFailure {
            stopRecorderQuietly()
            voiceMessage.value = "Micro indisponible : " + (it.message ?: "erreur")
        }
    }

    private fun finishVoice() {
        val media = recorder ?: return
        recorder = null
        val file = recordingFile
        recordingFile = null
        val stopped = runCatching { media.stop() }.isSuccess
        runCatching { media.release() }
        recording.value = false

        if (!stopped || file == null || !file.exists() || file.length() == 0L) {
            file?.delete()
            voiceMessage.value = "Enregistrement trop court"
            return
        }

        voiceMessage.value = "Transcription…"
        Thread {
            try {
                val bytes = file.readBytes()
                file.delete()
                model.sendVoice(bytes, "audio/mp4")
                runOnUiThread { voiceMessage.value = "Micro prêt" }
            } catch (error: Throwable) {
                file.delete()
                runOnUiThread {
                    voiceMessage.value = "Erreur micro : " + (error.message ?: "lecture impossible")
                }
            }
        }.start()
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
    }
}

private val MelInk = Color(0xFFE6F7FF)
private val MelMuted = Color(0xFF9FB5C8)
private val MelCyan = Color(0xFF22D3EE)
private val MelBlue = Color(0xFF2563EB)
private val MelPanel = Color(0xE6122235)
private val MelPanelSoft = Color(0xCC0B1B2A)
private val MelDanger = Color(0xFFFF8A9A)

@Composable
private fun MelTheme(content: @Composable () -> Unit) {
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
private fun MelApp(
    state: MelUiState,
    recording: Boolean,
    voiceMessage: String,
    onLogin: (String, String) -> Unit,
    onRetrySession: () -> Unit,
    onDisconnect: () -> Unit,
    onMode: (MelMode) -> Unit,
    onSend: (String) -> Unit,
    onSync: () -> Unit,
    onVoice: () -> Unit
) {
    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF06101D), Color(0xFF0A1F34), Color(0xFF05111C))
                )
            )
    ) {
        when (state.session) {
            SessionStage.DISCONNECTED -> LoginScreen(state, onLogin)
            SessionStage.VERIFYING -> LoadingScreen(state.status)
            SessionStage.ERROR -> SessionErrorScreen(state, onRetrySession, onDisconnect)
            SessionStage.CONNECTED -> ConversationScreen(
                state = state,
                recording = recording,
                voiceMessage = voiceMessage,
                onDisconnect = onDisconnect,
                onMode = onMode,
                onSend = onSend,
                onSync = onSync,
                onVoice = onVoice
            )
        }
    }
}

@Composable
private fun TechMark(size: Int = 76) {
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(
                Brush.linearGradient(
                    listOf(Color(0xFF0D304A), Color(0xFF103A5F), Color(0xFF082238))
                )
            )
            .border(1.dp, MelCyan.copy(alpha = .7f), CircleShape)
            .semantics { contentDescription = "Logo MEL" },
        contentAlignment = Alignment.Center
    ) {
        Text("M", fontSize = (size * .48f).sp, fontWeight = FontWeight.Black, color = MelCyan)
    }
}

@Composable
private fun LoginScreen(state: MelUiState, onLogin: (String, String) -> Unit) {
    var user by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    val focus = LocalFocusManager.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        TechMark()
        Spacer(Modifier.height(14.dp))
        Text("MEL", fontSize = 34.sp, fontWeight = FontWeight.Black, letterSpacing = 4.sp)
        Text("Intelligence personnelle", color = MelMuted)
        Spacer(Modifier.height(26.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MelPanel),
            shape = RoundedCornerShape(24.dp)
        ) {
            Column(Modifier.padding(20.dp)) {
                Text("Connexion sécurisée", fontSize = 21.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                Text(
                    "Le mot de passe sert uniquement à associer ce téléphone. Il n’est jamais enregistré.",
                    color = MelMuted,
                    lineHeight = 20.sp
                )
                Spacer(Modifier.height(18.dp))
                OutlinedTextField(
                    value = user,
                    onValueChange = { user = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Utilisateur MEL (optionnel)") },
                    singleLine = true
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Mot de passe MEL") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
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
                    Spacer(Modifier.height(12.dp))
                    Text(state.error, color = MelDanger)
                }
                Spacer(Modifier.height(18.dp))
                Button(
                    onClick = {
                        focus.clearFocus()
                        onLogin(user, password)
                        password = ""
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !state.busy && password.isNotBlank(),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text(if (state.busy) "Connexion…" else "Connecter ce téléphone")
                }
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
        TechMark(64)
        Spacer(Modifier.height(20.dp))
        CircularProgressIndicator()
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
        TechMark(64)
        Spacer(Modifier.height(20.dp))
        Text("MEL est momentanément inaccessible", fontSize = 22.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(state.error ?: state.status, color = MelMuted, textAlign = TextAlign.Center)
        Spacer(Modifier.height(20.dp))
        Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) { Text("Réessayer") }
        TextButton(onClick = onReset) { Text("Réassocier le téléphone") }
    }
}

@Composable
private fun ConversationScreen(
    state: MelUiState,
    recording: Boolean,
    voiceMessage: String,
    onDisconnect: () -> Unit,
    onMode: (MelMode) -> Unit,
    onSend: (String) -> Unit,
    onSync: () -> Unit,
    onVoice: () -> Unit
) {
    var draft by rememberSaveable { mutableStateOf("") }
    val listState = rememberLazyListState()
    val focus = LocalFocusManager.current

    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.lastIndex)
    }

    Scaffold(
        containerColor = Color.Transparent,
        modifier = Modifier
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding(),
        topBar = {
            Surface(color = Color(0xCC071523)) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TechMark(46)
                    Spacer(Modifier.width(11.dp))
                    Column(Modifier.weight(1f)) {
                        Text("MEL", fontWeight = FontWeight.Black, fontSize = 20.sp, letterSpacing = 2.sp)
                        Text(state.status.ifBlank { "Connectée" }, color = MelMuted, fontSize = 12.sp)
                    }
                    TextButton(onClick = onDisconnect) { Text("Déconnexion") }
                }
            }
        }
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 14.dp)
        ) {
            Spacer(Modifier.height(12.dp))
            ModeSelector(state.mode, onMode)
            Spacer(Modifier.height(9.dp))
            Text(
                if (state.mode == MelMode.NORMAL)
                    "Mode Normal · conversation simple, rapide et lisible."
                else
                    "Mode Complet · conversation + synchronisation et contrôles avancés.",
                color = MelMuted,
                fontSize = 13.sp
            )
            if (state.mode == MelMode.COMPLETE) {
                Spacer(Modifier.height(10.dp))
                CompletePanel(state.busy, onSync)
            }
            Spacer(Modifier.height(10.dp))

            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                if (state.messages.isEmpty()) {
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MelPanelSoft),
                            shape = RoundedCornerShape(20.dp)
                        ) {
                            Column(Modifier.padding(18.dp)) {
                                Text(
                                    if (state.mode == MelMode.NORMAL) "Bonjour Adrien." else "Mode complet actif.",
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(Modifier.height(5.dp))
                                Text(
                                    if (state.mode == MelMode.NORMAL)
                                        "Écris ou utilise le micro pour parler à MEL."
                                    else
                                        "Le mode complet conserve le même dialogue et ajoute les fonctions avancées.",
                                    color = MelMuted
                                )
                            }
                        }
                    }
                }
                itemsIndexed(state.messages) { _, message ->
                    MessageBubble(message)
                }
                if (state.busy) {
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(9.dp))
                            Text(state.status, color = MelMuted, fontSize = 13.sp)
                        }
                    }
                }
            }

            if (!state.error.isNullOrBlank()) {
                Text(
                    state.error,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 7.dp),
                    color = MelDanger,
                    fontSize = 13.sp
                )
            }

            Text(voiceMessage, color = if (recording) MelCyan else MelMuted, fontSize = 12.sp)
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Message à MEL") },
                minLines = 2,
                maxLines = 6,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = {
                    if (draft.isNotBlank() && !state.busy) {
                        val outgoing = draft
                        draft = ""
                        focus.clearFocus()
                        onSend(outgoing)
                    }
                })
            )
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onVoice,
                    modifier = Modifier.weight(.42f),
                    enabled = !state.busy || recording
                ) {
                    Text(if (recording) "Arrêter" else "Micro")
                }
                Button(
                    onClick = {
                        if (draft.isNotBlank()) {
                            val outgoing = draft
                            draft = ""
                            focus.clearFocus()
                            onSend(outgoing)
                        }
                    },
                    modifier = Modifier.weight(.58f),
                    enabled = draft.isNotBlank() && !state.busy,
                    colors = ButtonDefaults.buttonColors(containerColor = MelBlue)
                ) {
                    Text("Envoyer")
                }
            }
            Spacer(Modifier.height(10.dp))
        }
    }
}

@Composable
private fun ModeSelector(mode: MelMode, onMode: (MelMode) -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        MelMode.entries.forEach { item ->
            if (item == mode) {
                Button(
                    onClick = { onMode(item) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text(item.label, fontWeight = FontWeight.Bold)
                }
            } else {
                OutlinedButton(
                    onClick = { onMode(item) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text(item.label)
                }
            }
        }
    }
}

@Composable
private fun CompletePanel(busy: Boolean, onSync: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xB30C2940)),
        shape = RoundedCornerShape(18.dp)
    ) {
        Row(
            Modifier.padding(13.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text("Contrôles complets", fontWeight = FontWeight.Bold)
                Text("Synchronise les messages reçus depuis les autres surfaces MEL.", color = MelMuted, fontSize = 12.sp)
            }
            Spacer(Modifier.width(10.dp))
            OutlinedButton(onClick = onSync, enabled = !busy) { Text("Synchroniser") }
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
            color = if (user) Color(0xFF173B63) else Color(0xE6122235),
            shape = RoundedCornerShape(
                topStart = 18.dp,
                topEnd = 18.dp,
                bottomStart = if (user) 18.dp else 5.dp,
                bottomEnd = if (user) 5.dp else 18.dp
            ),
            tonalElevation = 2.dp,
            modifier = Modifier.fillMaxWidth(.88f)
        ) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 11.dp)) {
                Text(
                    if (user) if (message.voice) "Adrien · voix" else "Adrien" else "MEL",
                    color = if (user) Color(0xFFBEE3FF) else MelCyan,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(3.dp))
                Text(message.text, color = MelInk, lineHeight = 20.sp)
            }
        }
    }
}
