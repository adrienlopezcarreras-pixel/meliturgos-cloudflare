package fr.veriteinterdite.mel

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MelUiHarnessScreenshotTest {
    @get:Rule
    val compose = createAndroidComposeRule<MelUiHarnessActivity>()

    @Test
    fun completeModeRendersForVisualProof() {
        compose.onNodeWithText("Complet").performClick()
        compose.onNodeWithContentDescription("Avatar MEL").assertIsDisplayed()
        compose.onNodeWithText("Contrôles complets").assertIsDisplayed()
        compose.onNodeWithText("Synchroniser").assertIsDisplayed()
        compose.onNodeWithText("Professor").assertIsDisplayed()
        compose.onNodeWithText("Lancer auto-diagnostic").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("message-input").assertIsDisplayed()
        compose.onNodeWithTag("file-button").assertIsDisplayed()
        compose.onNodeWithTag("micro-button").assertIsDisplayed()
        compose.onNodeWithTag("send-button").assertIsDisplayed()
        compose.waitForIdle()
    }
}
