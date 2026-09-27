package fr.veriteinterdite.mel

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MelLoginHarnessActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        setContent {
            MelTheme {
                MelApp(
                    state = MelUiState(
                        session = SessionStage.DISCONNECTED,
                        mode = MelMode.NORMAL,
                        busy = false,
                        status = "",
                        error = null,
                        messages = emptyList()
                    ),
                    recording = false,
                    voiceLevel = 0f,
                    voiceMessage = "Micro prêt",
                    onLogin = { _, _ -> },
                    onRetrySession = {},
                    onDisconnect = {},
                    onMode = {},
                    onSend = {},
                    onSync = {},
                    onVoicePress = {},
                    onVoiceRelease = {},
                    onFile = {},
                    onNotifications = {},
                    onDiagnostics = {},
                    onCopyDiagnostic = {},
                    onNormalProbe = {},
                    onFileProbe = {},
                    onBackgroundProbe = {},
                    onTestVoice = {}
                )
            }
        }
    }
}
