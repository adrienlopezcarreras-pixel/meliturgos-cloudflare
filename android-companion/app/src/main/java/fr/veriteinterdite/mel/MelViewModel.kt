package fr.veriteinterdite.mel

import android.content.Context
import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.net.SocketTimeoutException
import java.net.UnknownHostException

enum class MelMode(val wireValue: String, val label: String) {
    NORMAL("normal", "Normal"),
    COMPLETE("complete", "Complet")
}

enum class SessionStage {
    DISCONNECTED,
    VERIFYING,
    CONNECTED,
    ERROR
}

data class MelChatMessage(
    val role: String,
    val text: String,
    val voice: Boolean = false
)

data class MelCompanionDevice(
    val deviceId: String,
    val name: String,
    val model: String,
    val online: Boolean,
    val phase: String?,
    val firmware: String?,
    val battery: Int?,
    val wifiRssi: Int?,
    val camera: Boolean?,
    val microphone: Boolean?,
    val speaker: Boolean?
)

data class MelUiState(
    val session: SessionStage = SessionStage.DISCONNECTED,
    val mode: MelMode = MelMode.NORMAL,
    val busy: Boolean = false,
    val speaking: Boolean = false,
    val status: String = "",
    val error: String? = null,
    val messages: List<MelChatMessage> = emptyList(),
    val companions: List<MelCompanionDevice> = emptyList(),
    val companionStatus: String = "",
    val diagnosticReport: String? = null
)

class MelViewModel(
    context: Context,
    private val client: MelApiClient,
    private val vault: TokenVault,
    private val conversationId: String
) : ViewModel() {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("mel_ui", Context.MODE_PRIVATE)
    private val initialMode = runCatching {
        MelMode.valueOf(prefs.getString("mode", MelMode.NORMAL.name) ?: MelMode.NORMAL.name)
    }.getOrDefault(MelMode.NORMAL)

    private val _state = MutableStateFlow(MelUiState(mode = initialMode))
    val state: StateFlow<MelUiState> = _state.asStateFlow()

    init {
        verifyExistingSession()
    }

    fun setMode(mode: MelMode) {
        if (_state.value.busy) return
        prefs.edit().putString("mode", mode.name).apply()
        _state.value = _state.value.copy(mode = mode, error = null)
    }

    fun verifyExistingSession() {
        if (vault.load().isNullOrBlank()) {
            MelBackground.cancel(appContext)
            _state.value = _state.value.copy(
                session = SessionStage.DISCONNECTED,
                status = "Connexion requise",
                error = null
            )
            return
        }
        _state.value = _state.value.copy(
            session = SessionStage.VERIFYING,
            busy = true,
            status = "Vérification sécurisée…",
            error = null
        )
        viewModelScope.launch(Dispatchers.IO) {
            try {
                client.heartbeat(sdkInt = Build.VERSION.SDK_INT)
                MelBackground.schedule(appContext)
                _state.value = _state.value.copy(
                    session = SessionStage.CONNECTED,
                    busy = false,
                    status = "MEL connectée",
                    error = null
                )
            } catch (error: Throwable) {
                if (isInvalidSession(error)) {
                    vault.clear()
                    MelBackground.cancel(appContext)
                    _state.value = _state.value.copy(
                        session = SessionStage.DISCONNECTED,
                        busy = false,
                        status = "Session expirée",
                        error = explain(error)
                    )
                } else {
                    _state.value = _state.value.copy(
                        session = SessionStage.ERROR,
                        busy = false,
                        status = "Serveur momentanément indisponible",
                        error = explain(error)
                    )
                }
            }
        }
    }

    fun pair(username: String, password: String) {
        if (password.isBlank()) {
            _state.value = _state.value.copy(error = "Le mot de passe MEL est requis.")
            return
        }
        _state.value = _state.value.copy(
            session = SessionStage.VERIFYING,
            busy = true,
            status = "Association sécurisée du téléphone…",
            error = null
        )
        viewModelScope.launch(Dispatchers.IO) {
            try {
                client.pairWithOwnerCredentials(username.trim(), password)
                client.heartbeat(sdkInt = Build.VERSION.SDK_INT)
                MelBackground.schedule(appContext)
                _state.value = _state.value.copy(
                    session = SessionStage.CONNECTED,
                    busy = false,
                    status = "Téléphone associé et vérifié",
                    error = null
                )
            } catch (error: Throwable) {
                vault.clear()
                MelBackground.cancel(appContext)
                _state.value = _state.value.copy(
                    session = SessionStage.DISCONNECTED,
                    busy = false,
                    status = "Association refusée",
                    error = explain(error)
                )
            }
        }
    }

    fun disconnect() {
        MelVoicePlayer.stop()
        vault.clear()
        MelBackground.cancel(appContext)
        _state.value = MelUiState(
            session = SessionStage.DISCONNECTED,
            mode = _state.value.mode,
            status = "Téléphone déconnecté"
        )
    }

    fun localCompanionReply(userText: String, answer: String, voice: Boolean) {
        val cleanUser = userText.trim()
        val cleanAnswer = answer.trim()
        if (cleanUser.isBlank() || cleanAnswer.isBlank() || _state.value.busy || _state.value.speaking) return
        val mode = _state.value.mode
        _state.value = _state.value.copy(
            busy = voice,
            speaking = voice,
            status = if (voice) "MEL répond…" else "Commande locale exécutée",
            error = null,
            messages = _state.value.messages +
                MelChatMessage("user", cleanUser, voice) +
                MelChatMessage("mel", cleanAnswer)
        )
        if (!voice) return
        viewModelScope.launch(Dispatchers.IO) {
            try {
                speakAnswer(cleanAnswer, mode)
                appendDiagnosticLine("Compagnon local: OK · voix MEL")
            } catch (error: Throwable) {
                _state.value = _state.value.copy(
                    busy = false,
                    speaking = false,
                    status = "Commande locale exécutée",
                    error = null
                )
                appendDiagnosticLine("Compagnon local: action OK · voix locale indisponible")
            }
        }
    }

    fun send(text: String, voice: Boolean = false) {
        val clean = text.trim()
        if (clean.isBlank() || _state.value.busy || _state.value.speaking) return
        val mode = _state.value.mode
        _state.value = _state.value.copy(
            busy = true,
            status = "MEL réfléchit…",
            error = null,
            messages = _state.value.messages + MelChatMessage("user", clean, voice)
        )
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val response = client.chat(
                    text = clean,
                    conversationId = conversationId,
                    voice = voice,
                    uiMode = mode.wireValue
                )
                val answer = response.optString("text", response.optString("response", "")).trim()
                if (answer.isBlank()) throw MelApiException("EMPTY_RESPONSE", 502)
                _state.value = _state.value.copy(
                    busy = true,
                    speaking = false,
                    status = "MEL prépare sa voix…",
                    messages = _state.value.messages + MelChatMessage("mel", answer)
                )
                speakAnswer(answer, mode)
                if (voice) appendDiagnosticLine("Micro réel: OK · reconnaissance Android")
            } catch (error: Throwable) {
                if (isInvalidSession(error)) {
                    vault.clear()
                    MelBackground.cancel(appContext)
                    _state.value = _state.value.copy(
                        session = SessionStage.DISCONNECTED,
                        busy = false,
                        status = "Session expirée",
                        error = explain(error)
                    )
                } else {
                    _state.value = _state.value.copy(
                        busy = false,
                        status = "Envoi interrompu",
                        error = explain(error)
                    )
                }
            }
        }
    }

    fun sendVoice(audioBytes: ByteArray, mimeType: String = "audio/mp4") {
        if (audioBytes.isEmpty() || _state.value.busy || _state.value.speaking) return
        _state.value = _state.value.copy(
            busy = true,
            status = "Transcription de ta voix…",
            error = null
        )
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val transcript = client.transcribe(audioBytes, mimeType).optString("text").trim()
                if (transcript.isBlank()) throw MelApiException("TRANSCRIPTION_EMPTY", 502)
                val mode = _state.value.mode
                _state.value = _state.value.copy(
                    status = "MEL réfléchit…",
                    messages = _state.value.messages + MelChatMessage("user", transcript, voice = true)
                )
                val response = client.chat(
                    text = transcript,
                    conversationId = conversationId,
                    voice = true,
                    uiMode = mode.wireValue
                )
                val answer = response.optString("text", response.optString("response", "")).trim()
                if (answer.isBlank()) throw MelApiException("EMPTY_RESPONSE", 502)
                _state.value = _state.value.copy(
                    busy = true,
                    speaking = false,
                    status = "MEL prépare sa voix…",
                    messages = _state.value.messages + MelChatMessage("mel", answer)
                )
                speakAnswer(answer, mode)
                appendDiagnosticLine("Micro réel: OK")
            } catch (error: Throwable) {
                if (isInvalidSession(error)) {
                    vault.clear()
                    MelBackground.cancel(appContext)
                    _state.value = _state.value.copy(
                        session = SessionStage.DISCONNECTED,
                        busy = false,
                        status = "Session expirée",
                        error = explain(error)
                    )
                } else {
                    _state.value = _state.value.copy(
                        busy = false,
                        status = "Voix interrompue",
                        error = explain(error)
                    )
                }
            }
        }
    }

    private fun speakAnswer(answer: String, mode: MelMode) {
        var frenchFailure: Throwable? = null
        try {
            _state.value = _state.value.copy(
                busy = true,
                speaking = true,
                status = "MEL parle.",
                error = null
            )
            MelVoicePlayer.playSystemFrench(appContext, answer)
            _state.value = _state.value.copy(
                busy = false,
                speaking = false,
                status = "MEL connectée · mode ${mode.label}",
                error = null
            )
            appendDiagnosticLine("Audio MEL: OK · Android fr-FR")
            return
        } catch (error: Throwable) {
            frenchFailure = error
            MelVoicePlayer.stop()
        }

        try {
            val audio = client.tts(answer, speaker = "luna", format = "mp3")
            if (audio.isEmpty()) throw MelApiException("TTS_AUDIO_EMPTY", 502)
            _state.value = _state.value.copy(
                busy = true,
                speaking = true,
                status = "MEL parle.",
                error = null
            )
            MelVoicePlayer.playMp3(appContext, audio)
            _state.value = _state.value.copy(
                busy = false,
                speaking = false,
                status = "MEL connectée · mode ${mode.label}",
                error = null
            )
            appendDiagnosticLine("Audio MEL: secours Luna MP3")
        } catch (fallbackError: Throwable) {
            MelVoicePlayer.stop()
            _state.value = _state.value.copy(
                busy = false,
                speaking = false,
                status = "MEL connectée · audio indisponible",
                error = "Réponse reçue · audio indisponible · " +
                    explain(frenchFailure ?: fallbackError)
            )
        }
    }

    fun sendFile(name: String, mimeType: String, bytes: ByteArray) {
        if (_state.value.busy) return
        if (bytes.isEmpty()) {
            _state.value = _state.value.copy(error = "Le fichier est vide.")
            return
        }
        if (bytes.size > 25_000_000) {
            _state.value = _state.value.copy(error = "Le fichier dépasse la limite de 25 Mo.")
            return
        }
        _state.value = _state.value.copy(
            busy = true,
            status = "Envoi de " + name + "…",
            error = null
        )
        viewModelScope.launch(Dispatchers.IO) {
            try {
                var stored = false
                var compatibilityFallback = false
                val preview = try {
                    val upload = client.uploadFile(name, mimeType, bytes)
                    stored = upload.optBoolean("stored", false)
                    upload.optString("preview_text").trim()
                } catch (error: MelApiException) {
                    if (error.code != "ANDROID_ROUTE_NOT_FOUND" && error.status != 404) throw error
                    compatibilityFallback = true
                    localTextPreview(name, mimeType, bytes)
                        ?: throw MelApiException("ANDROID_FILE_BACKEND_UPDATE_REQUIRED", 404)
                }

                _state.value = _state.value.copy(
                    messages = _state.value.messages + MelChatMessage("user", "📎 " + name)
                )

                if (preview.isNotBlank()) {
                    val mode = _state.value.mode
                    val prompt = "Analyse ce fichier en tenant compte de son contenu.\n\nFichier : " +
                        name + "\n--- contenu extrait ---\n" + preview
                    _state.value = _state.value.copy(
                        status = if (compatibilityFallback)
                            "Analyse locale compatible de " + name + "…"
                        else
                            "MEL analyse " + name + "…"
                    )
                    val response = client.chat(
                        text = prompt,
                        conversationId = conversationId,
                        voice = false,
                        uiMode = mode.wireValue
                    )
                    val answer = response.optString("text", response.optString("response", "")).trim()
                    if (answer.isBlank()) throw MelApiException("EMPTY_RESPONSE", 502)
                    _state.value = _state.value.copy(
                        busy = false,
                        status = if (compatibilityFallback)
                            "Fichier texte analysé · serveur ancien compatible"
                        else
                            "Fichier analysé · mode " + mode.label,
                        messages = _state.value.messages + MelChatMessage("mel", answer)
                    )
                    appendDiagnosticLine("Fichier réel: OK")
                } else {
                    _state.value = _state.value.copy(
                        busy = false,
                        status = if (stored)
                            "Fichier privé chargé. Aucun texte directement extractible."
                        else
                            "Fichier reçu. Aucun texte directement extractible."
                    )
                    appendDiagnosticLine("Fichier réel: OK")
                }
            } catch (error: Throwable) {
                if (isInvalidSession(error)) {
                    vault.clear()
                    MelBackground.cancel(appContext)
                    _state.value = _state.value.copy(
                        session = SessionStage.DISCONNECTED,
                        busy = false,
                        status = "Session expirée",
                        error = explain(error)
                    )
                } else {
                    _state.value = _state.value.copy(
                        busy = false,
                        status = "Envoi du fichier interrompu",
                        error = explain(error)
                    )
                }
            }
        }
    }

    fun runDiagnostics() {
        if (_state.value.busy) return
        if (_state.value.session != SessionStage.CONNECTED) {
            _state.value = _state.value.copy(
                diagnosticReport = "Session: NON CONNECTÉE\nAction: reconnecter le téléphone à MEL."
            )
            return
        }
        val mode = _state.value.mode
        _state.value = _state.value.copy(
            busy = true,
            status = "Auto-diagnostic Android…",
            error = null,
            diagnosticReport = "Diagnostic en cours…"
        )
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val response = client.heartbeat(sdkInt = Build.VERSION.SDK_INT)
                val accepted = response.optJSONObject("accepted")
                val serverTime = response.optLong("server_time", 0L)
                val acceptedVersion = accepted?.optString("app_version").orEmpty().ifBlank { "non renvoyée" }
                val serverDeviceId = response.optString("device_id").ifBlank { "non renvoyé" }
                val report = buildString {
                    appendLine("MEL Android ${MelApiClient.APP_VERSION}")
                    appendLine("Session: OK")
                    appendLine("Heartbeat: OK")
                    appendLine("Mode: ${mode.label}")
                    appendLine("SDK Android: ${Build.VERSION.SDK_INT}")
                    appendLine("Backend accepte version: $acceptedVersion")
                    appendLine("Device ID serveur: $serverDeviceId")
                    appendLine("Heure serveur: " + if (serverTime > 0L) serverTime.toString() else "non renvoyée")
                    append("Jeton local: Android Keystore")
                }
                _state.value = _state.value.copy(
                    busy = false,
                    status = "Auto-diagnostic terminé",
                    diagnosticReport = report,
                    error = null
                )
            } catch (error: Throwable) {
                if (isInvalidSession(error)) {
                    vault.clear()
                    MelBackground.cancel(appContext)
                    _state.value = _state.value.copy(
                        session = SessionStage.DISCONNECTED,
                        busy = false,
                        status = "Session expirée pendant le diagnostic",
                        diagnosticReport = "Session: ÉCHEC\nHeartbeat: ÉCHEC\nCause: " + explain(error),
                        error = explain(error)
                    )
                } else {
                    _state.value = _state.value.copy(
                        busy = false,
                        status = "Auto-diagnostic en échec",
                        diagnosticReport = "Session: ${_state.value.session}\nHeartbeat: ÉCHEC\nCause: " + explain(error),
                        error = explain(error)
                    )
                }
            }
        }
    }

    fun runNormalProbe() {
        if (_state.value.busy || _state.value.session != SessionStage.CONNECTED) return
        _state.value = _state.value.copy(busy = true, status = "Test Mode Normal…", error = null)
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val response = client.chat(
                    text = "Test technique Android. Réponds simplement OK.",
                    conversationId = conversationId + "-android-validation",
                    voice = false,
                    uiMode = MelMode.NORMAL.wireValue
                )
                val answer = response.optString("text", response.optString("response", "")).trim()
                if (answer.isBlank()) throw MelApiException("EMPTY_RESPONSE", 502)
                appendDiagnosticLine("Mode Normal: OK")
                _state.value = _state.value.copy(busy = false, status = "Mode Normal validé")
            } catch (error: Throwable) {
                handleProbeFailure("Mode Normal", error)
            }
        }
    }

    fun runFileProbe() {
        if (_state.value.busy || _state.value.session != SessionStage.CONNECTED) return
        _state.value = _state.value.copy(busy = true, status = "Test fichier Android…", error = null)
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val marker = "MEL_ANDROID_FILE_PROBE_" + System.currentTimeMillis()
                val upload = client.uploadFile(
                    "mel-android-validation.txt",
                    "text/plain; charset=utf-8",
                    marker.toByteArray(Charsets.UTF_8)
                )
                val preview = upload.optString("preview_text").trim()
                if (preview.isBlank() || !preview.contains(marker)) {
                    throw MelApiException("FILE_PROBE_PREVIEW_MISSING", 502)
                }
                appendDiagnosticLine("Fichier texte: OK")
                _state.value = _state.value.copy(busy = false, status = "Fichier texte validé")
            } catch (error: Throwable) {
                handleProbeFailure("Fichier texte", error)
            }
        }
    }

    fun runBackgroundProbe() {
        if (_state.value.busy || _state.value.session != SessionStage.CONNECTED) return
        _state.value = _state.value.copy(busy = true, status = "Test arrière-plan…", error = null)
        viewModelScope.launch(Dispatchers.IO) {
            try {
                client.heartbeat(sdkInt = Build.VERSION.SDK_INT)
                MelBackground.schedule(appContext)
                val scheduled = MelBackground.heartbeatScheduled(appContext)
                val notifications = MelBackground.notificationsAllowed(appContext)
                appendDiagnosticLine("Heartbeat immédiat: OK")
                appendDiagnosticLine("Heartbeat arrière-plan planifié: " + if (scheduled) "OK" else "ÉCHEC")
                appendDiagnosticLine("Notifications: " + if (notifications) "OK" else "À AUTORISER")
                _state.value = _state.value.copy(
                    busy = false,
                    status = if (scheduled) "Arrière-plan validé" else "Planification arrière-plan à vérifier"
                )
            } catch (error: Throwable) {
                handleProbeFailure("Arrière-plan", error)
            }
        }
    }

    private fun appendDiagnosticLine(line: String) {
        val current = _state.value.diagnosticReport.orEmpty().trimEnd()
        _state.value = _state.value.copy(
            diagnosticReport = if (current.isBlank()) line else current + "\n" + line
        )
    }

    private fun handleProbeFailure(label: String, error: Throwable) {
        if (isInvalidSession(error)) {
            vault.clear()
            MelBackground.cancel(appContext)
            _state.value = _state.value.copy(
                session = SessionStage.DISCONNECTED,
                busy = false,
                status = "Session expirée pendant " + label,
                diagnosticReport = (_state.value.diagnosticReport.orEmpty().trimEnd() + "\n" + label + ": ÉCHEC").trim(),
                error = explain(error)
            )
        } else {
            appendDiagnosticLine(label + ": ÉCHEC · " + explain(error))
            _state.value = _state.value.copy(
                busy = false,
                status = label + " en échec",
                error = explain(error)
            )
        }
    }

    fun refreshCompanions() {
        if (_state.value.session != SessionStage.CONNECTED || _state.value.busy) return
        _state.value = _state.value.copy(companionStatus = "Recherche des compagnons…", error = null)
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val rows = client.companions()
                val devices = buildList {
                    for (i in 0 until rows.length()) {
                        val row = rows.getJSONObject(i)
                        fun nullableBoolean(key: String): Boolean? =
                            if (row.has(key) && !row.isNull(key)) row.optBoolean(key) else null
                        add(
                            MelCompanionDevice(
                                deviceId = row.optString("device_id"),
                                name = row.optString("name").ifBlank { "MINI" },
                                model = row.optString("model").ifBlank { "waveshare-terminal" },
                                online = row.optBoolean("online", false),
                                phase = row.optString("phase").takeIf { it.isNotBlank() },
                                firmware = row.optString("firmware").takeIf { it.isNotBlank() },
                                battery = if (row.has("battery") && !row.isNull("battery")) row.optInt("battery") else null,
                                wifiRssi = if (row.has("wifi_rssi") && !row.isNull("wifi_rssi")) row.optInt("wifi_rssi") else null,
                                camera = nullableBoolean("camera"),
                                microphone = nullableBoolean("microphone"),
                                speaker = nullableBoolean("speaker")
                            )
                        )
                    }
                }
                _state.value = _state.value.copy(
                    companions = devices,
                    companionStatus = if (devices.isEmpty()) "Aucun MINI appairé" else "${devices.size} compagnon(s) détecté(s)"
                )
            } catch (error: Throwable) {
                _state.value = _state.value.copy(
                    companionStatus = "Compagnon indisponible",
                    error = explain(error)
                )
            }
        }
    }

    fun sync() {
        if (_state.value.busy) return
        _state.value = _state.value.copy(busy = true, status = "Synchronisation…", error = null)
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val rows = client.syncAndAck(conversationId)
                val incoming = buildList {
                    for (i in 0 until rows.length()) {
                        val row = rows.getJSONObject(i)
                        val role = row.optString("role").lowercase()
                        if (role == "user" || role == "assistant" || role == "mel") {
                            add(
                                MelChatMessage(
                                    role = if (role == "user") "user" else "mel",
                                    text = row.optString("content", row.optString("text"))
                                )
                            )
                        }
                    }
                }
                _state.value = _state.value.copy(
                    busy = false,
                    status = if (incoming.isEmpty()) "Déjà synchronisé" else "${incoming.size} message(s) synchronisé(s)",
                    messages = _state.value.messages + incoming
                )
            } catch (error: Throwable) {
                if (isInvalidSession(error)) {
                    vault.clear()
                    MelBackground.cancel(appContext)
                    _state.value = _state.value.copy(
                        session = SessionStage.DISCONNECTED,
                        busy = false,
                        status = "Session expirée",
                        error = explain(error)
                    )
                } else {
                    _state.value = _state.value.copy(
                        busy = false,
                        status = "Synchronisation impossible",
                        error = explain(error)
                    )
                }
            }
        }
    }

    private fun localTextPreview(name: String, mimeType: String, bytes: ByteArray): String? {
        if (bytes.size > 512_000) return null
        val extension = name.substringAfterLast('.', "").lowercase()
        val textExtensions = setOf(
            "txt", "md", "json", "csv", "tsv", "js", "mjs", "cjs", "ts", "tsx", "jsx",
            "css", "html", "htm", "xml", "yml", "yaml", "toml", "ini", "log", "sql", "py",
            "sh", "ps1", "java", "c", "h", "cpp", "hpp", "rs", "go", "php", "rb"
        )
        if (!mimeType.startsWith("text/", ignoreCase = true) && extension !in textExtensions) return null
        return bytes.toString(Charsets.UTF_8).take(120_000).trim().takeIf { it.isNotBlank() }
    }

    private fun isInvalidSession(error: Throwable): Boolean {
        val code = (error as? MelApiException)?.code ?: return false
        return code in setOf("DEVICE_AUTH_REQUIRED", "DEVICE_AUTH_INVALID", "DEVICE_NOT_PAIRED")
    }

    private fun explain(error: Throwable): String {
        return when (error) {
            is MelApiException -> when (error.code) {
                "AUTH_REQUIRED" -> "Identifiant ou mot de passe MEL refusé."
                "AUTH_NOT_CONFIGURED" -> "L’authentification MEL n’est pas configurée sur le serveur."
                "PAIR_CODE_INVALID_OR_EXPIRED" -> "Le code d’association a expiré. Relance la connexion."
                "DEVICE_AUTH_INVALID", "DEVICE_AUTH_REQUIRED", "DEVICE_NOT_PAIRED" ->
                    "La session de ce téléphone n’est plus valide. Reconnecte-le."
                "PROTOCOL_UNSUPPORTED" -> "Cette version de l’application n’est pas compatible avec le serveur MEL."
                "TRANSCRIPTION_EMPTY" -> "Je n’ai pas réussi à comprendre l’enregistrement."
                "FILE_TOO_LARGE" -> "Le fichier dépasse la limite autorisée."
                "FILE_REQUIRED", "FILE_EMPTY" -> "Le fichier sélectionné est vide ou illisible."
                "ANDROID_FILE_BACKEND_UPDATE_REQUIRED" ->
                    "Le serveur MEL doit être mis à jour pour stocker ou analyser ce type de fichier."
                "EMPTY_RESPONSE" -> "MEL n’a renvoyé aucune réponse."
                else -> "Erreur MEL : ${error.code}" + if (error.detail.isNotBlank()) " · ${error.detail}" else ""
            }
            is SocketTimeoutException -> "Le serveur met trop de temps à répondre."
            is UnknownHostException -> "Impossible de joindre MEL. Vérifie la connexion Internet."
            else -> error.message?.takeIf { it.isNotBlank() } ?: "Erreur inconnue."
        }
    }

    companion object {
        fun factory(
            context: Context,
            client: MelApiClient,
            vault: TokenVault,
            conversationId: String
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
                return MelViewModel(context, client, vault, conversationId) as T
            }
        }
    }
}
