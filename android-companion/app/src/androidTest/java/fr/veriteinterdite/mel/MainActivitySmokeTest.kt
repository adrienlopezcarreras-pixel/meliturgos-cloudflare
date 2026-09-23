package fr.veriteinterdite.mel

import android.graphics.Bitmap
import android.os.ParcelFileDescriptor
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.text.AnnotatedString
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class MainActivitySmokeTest {
    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun loginScreenLaunchesWithMelIdentity() {
        compose.onNodeWithContentDescription("Avatar MEL").assertIsDisplayed()
        compose.onNodeWithText("MEL").assertIsDisplayed()
        compose.onNodeWithText("Connexion sécurisée").assertIsDisplayed()
        compose.onNodeWithTag("login-user").assertIsDisplayed()
        compose.onNodeWithTag("login-password").assertIsDisplayed()
        compose.onNodeWithTag("login-submit").assertIsDisplayed()
        saveScreenshot("login-screen.png")
    }

    private fun saveScreenshot(name: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
            ?: error("SCREENSHOT_UNAVAILABLE")
        val dir = instrumentation.targetContext.getExternalFilesDir(null)
            ?: error("EXTERNAL_FILES_DIR_UNAVAILABLE")
        val file = File(dir, name)
        file.outputStream().use { output ->
            check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
                "SCREENSHOT_WRITE_FAILED"
            }
        }
        check(file.isFile && file.length() > 0L) { "SCREENSHOT_NOT_WRITTEN" }

        val command = instrumentation.uiAutomation.executeShellCommand(
            "mkdir -p /sdcard/Download && cp ${file.absolutePath} /sdcard/Download/$name && " +
                "test -s /sdcard/Download/$name && echo SCREENSHOT_EXPORTED"
        )
        val result = ParcelFileDescriptor.AutoCloseInputStream(command)
            .bufferedReader()
            .use { it.readText() }
        check(result.contains("SCREENSHOT_EXPORTED")) { "SCREENSHOT_EXPORT_FAILED" }
    }

    @Test
    fun passwordIsNotRestoredAcrossActivityRecreation() {
        compose.onNodeWithTag("login-user").performTextInput("adrien")
        compose.onNodeWithTag("login-password").performTextInput("secret-ci-only")

        compose.activityRule.scenario.recreate()
        compose.waitForIdle()

        compose.onNodeWithTag("login-user").assert(
            SemanticsMatcher.expectValue(
                SemanticsProperties.EditableText,
                AnnotatedString("adrien")
            )
        )
        compose.onNodeWithTag("login-password").assert(
            SemanticsMatcher.expectValue(
                SemanticsProperties.EditableText,
                AnnotatedString("")
            )
        )
    }
}
