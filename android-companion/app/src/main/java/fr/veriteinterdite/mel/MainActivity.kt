package fr.veriteinterdite.mel

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.io.File

class MainActivity : Activity() {
    companion object {
        private const val RECORD_AUDIO_REQUEST = 7001
    }

    private lateinit var client: MelApiClient
    private lateinit var vault: TokenVault
    private lateinit var log: TextView
    private lateinit var pairCode: EditText
    private lateinit var message: EditText
    private lateinit var voiceButton: Button
    private var recorder: MediaRecorder? = null
    private var recordingFile: File? = null
    private val conversationId by lazy { "android-" + deviceId() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        vault = TokenVault(this)
        client = MelApiClient(BuildConfig.MEL_BASE_URL, deviceId(), vault)
        setContentView(buildUi())
        show(if (vault.load() == null) "Entre un code de pairing MEL." else "MEL Android prêt.")
    }

    override fun onDestroy() {
        stopRecorderQuietly()
        super.onDestroy()
    }

    private fun deviceId(): String {
        val raw = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        return "android-" + (raw ?: "unknown").take(64)
    }

    private fun buildUi(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 32)
        }
        pairCode = EditText(this).apply {
            hint = "Code de pairing"
            inputType = InputType.TYPE_CLASS_TEXT
        }
        val pair = Button(this).apply {
            text = "Associer le téléphone"
            setOnClickListener { pairPhone() }
        }
        message = EditText(this).apply {
            hint = "Parler à MEL"
            minLines = 3
        }
        val send = Button(this).apply {
            text = "Envoyer"
            setOnClickListener { sendMessage() }
        }
        voiceButton = Button(this).apply {
            text = "Micro"
            setOnClickListener { toggleVoice() }
        }
        val sync = Button(this).apply {
            text = "Synchroniser"
            setOnClickListener { syncMessages() }
        }
        log = TextView(this).apply { textSize = 16f }
        val scroll = ScrollView(this).apply { addView(log) }
        root.addView(pairCode)
        root.addView(pair)
        root.addView(message)
        root.addView(send)
        root.addView(voiceButton)
        root.addView(sync)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        return root
    }

    private fun pairPhone() = background {
        val code = pairCode.text.toString().trim()
        if (code.isBlank()) error("Code de pairing requis")
        client.pair(code)
        show("Téléphone associé. Le jeton est chiffré par Android Keystore.")
    }

    private fun sendMessage() = background {
        val text = message.text.toString().trim()
        if (text.isBlank()) error("Message vide")
        val response = client.chat(text, conversationId)
        val answer = response.optString("text", "Réponse vide")
        runOnUiThread { message.setText("") }
        show("Adrien : $text\n\nMEL : $answer")
    }

    private fun syncMessages() = background {
        val rows = client.syncAndAck(conversationId)
        val out = buildString {
            for (i in 0 until rows.length()) {
                val row = rows.getJSONObject(i)
                append(row.optString("role")).append(" : ").append(row.optString("content")).append("\n")
            }
        }
        show(if (out.isBlank()) "Aucun nouveau message." else out)
    }

    private fun toggleVoice() {
        if (recorder != null) {
            finishVoice()
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), RECORD_AUDIO_REQUEST)
            return
        }
        startVoice()
    }

    private fun startVoice() {
        if (vault.load() == null) {
            show("Associe d'abord le téléphone à MEL.")
            return
        }
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
            voiceButton.text = "Arrêter et envoyer"
            show("Écoute en cours…")
        }.onFailure {
            stopRecorderQuietly()
            show("Erreur micro : " + (it.message ?: it.javaClass.simpleName))
        }
    }

    private fun finishVoice() {
        val media = recorder ?: return
        recorder = null
        runCatching { media.stop() }
            .onFailure {
                media.release()
                recordingFile?.delete()
                recordingFile = null
                voiceButton.text = "Micro"
                show("Enregistrement trop court ou invalide.")
                return
            }
        media.release()
        voiceButton.text = "Micro"
        val file = recordingFile
        recordingFile = null
        if (file == null || !file.exists() || file.length() == 0L) {
            show("Aucun son enregistré.")
            return
        }
        background {
            try {
                val transcript = client.transcribe(file.readBytes(), "audio/mp4").optString("text").trim()
                if (transcript.isBlank()) error("Transcription vide")
                val response = client.chat(transcript, conversationId, voice = true)
                val answer = response.optString("text", "Réponse vide")
                show("Adrien (voix) : $transcript\n\nMEL : $answer")
            } finally {
                file.delete()
            }
        }
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
        if (::voiceButton.isInitialized) voiceButton.text = "Micro"
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != RECORD_AUDIO_REQUEST) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) startVoice()
        else show("Permission micro refusée.")
    }

    private fun background(block: () -> Unit) {
        Thread {
            runCatching(block).onFailure { show("Erreur : " + (it.message ?: it.javaClass.simpleName)) }
        }.start()
    }

    private fun show(text: String) {
        runOnUiThread {
            log.text = text + "\n\n" + log.text
        }
    }
}
