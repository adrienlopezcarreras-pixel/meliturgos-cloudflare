package fr.veriteinterdite.mel

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

class MelUiHarnessActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val initialMode = if (intent.getStringExtra("mode") == "complete") {
            MelMode.COMPLETE
        } else {
            MelMode.NORMAL
        }
        val showDiagnostics = intent.getBooleanExtra("diagnostics", false)

        setContent {
            var mode by remember { mutableStateOf(initialMode) }
            var messages by remember { mutableStateOf(emptyList<MelChatMessage>()) }
            MelTheme {
                MelApp(
                    state = MelUiState(
                        session = SessionStage.CONNECTED,
                        mode = mode,
                        busy = false,
                        status = "MEL test · connectée",
                        error = null,
                        messages = messages,
                        diagnosticReport = if (showDiagnostics) {
                            "MEL Android ${MelApiClient.APP_VERSION}\nSession: CONNECTED\nHeartbeat: OK\nKeystore: OK"
                        } else {
                            null
                        }
                    ),
                    recording = false,
                    voiceMessage = "Micro prêt",
                    onLogin = { _, _ -> },
                    onRetrySession = {},
                    onDisconnect = {},
                    onMode = { mode = it },
                    onSend = { text ->
                        messages = messages + MelChatMessage("user", text)
                    },
                    onSync = {},
                    onVoice = {},
                    onFile = {},
                    onProfessor = {},
                    onNotifications = {},
                    onDiagnostics = {},
                    onCopyDiagnostic = {},
                    onNormalProbe = {},
                    onFileProbe = {},
                    onBackgroundProbe = {}
                )
            }
        }
    }
}
