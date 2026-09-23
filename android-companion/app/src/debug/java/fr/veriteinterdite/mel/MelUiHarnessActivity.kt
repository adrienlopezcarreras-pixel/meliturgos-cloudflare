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
        setContent {
            var mode by remember { mutableStateOf(MelMode.NORMAL) }
            var messages by remember { mutableStateOf(emptyList<MelChatMessage>()) }
            MelTheme {
                MelApp(
                    state = MelUiState(
                        session = SessionStage.CONNECTED,
                        mode = mode,
                        busy = false,
                        status = "MEL test · connectée",
                        error = null,
                        messages = messages
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
                    onNotifications = {}
                )
            }
        }
    }
}
