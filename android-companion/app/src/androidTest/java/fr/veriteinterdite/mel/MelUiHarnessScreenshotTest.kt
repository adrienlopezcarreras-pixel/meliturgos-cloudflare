package fr.veriteinterdite.mel

import android.graphics.Bitmap
import android.os.ParcelFileDescriptor
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class MelUiHarnessScreenshotTest {
    @get:Rule
    val compose = createAndroidComposeRule<MelUiHarnessActivity>()

    @Test
    fun completeModeRendersAndCapturesEvidence() {
        compose.onNodeWithText("Complet").performClick()
        compose.onNodeWithContentDescription("Avatar MEL").assertIsDisplayed()
        compose.onNodeWithText("Contrôles complets").assertIsDisplayed()
        compose.onNodeWithText("Synchroniser").assertIsDisplayed()
        compose.onNodeWithText("Professor").assertIsDisplayed()
        compose.onNodeWithText("Lancer auto-diagnostic").assertIsDisplayed()
        compose.waitForIdle()

        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
            ?: error("SCREENSHOT_UNAVAILABLE")
        val dir = instrumentation.targetContext.getExternalFilesDir(null)
            ?: error("EXTERNAL_FILES_DIR_UNAVAILABLE")
        val file = File(dir, "complete-screen.png")
        file.outputStream().use { output ->
            check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
                "SCREENSHOT_WRITE_FAILED"
            }
        }
        check(file.isFile && file.length() > 0L) { "SCREENSHOT_NOT_WRITTEN" }

        val command = instrumentation.uiAutomation.executeShellCommand(
            "mkdir -p /sdcard/Download && cp ${file.absolutePath} /sdcard/Download/complete-screen.png && " +
                "test -s /sdcard/Download/complete-screen.png && echo SCREENSHOT_EXPORTED"
        )
        val result = ParcelFileDescriptor.AutoCloseInputStream(command)
            .bufferedReader()
            .use { it.readText() }
        check(result.contains("SCREENSHOT_EXPORTED")) { "SCREENSHOT_EXPORT_FAILED" }
    }
}
