package fr.veriteinterdite.mel

import android.app.Activity
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var client: MelApiClient
    private lateinit var vault: TokenVault
    private lateinit var log: TextView
    private lateinit var pairCode: EditText
    private lateinit var message: EditText
    private val conversationId by lazy { "android-" + deviceId() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        vault = TokenVault(this)
        client = MelApiClient(BuildConfig.MEL_BASE_URL, deviceId(), vault)
        setContentView(buildUi())
        show(if (vault.load() == null) "Entre un code de pairing MEL." else "MEL Android prêt.")
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
