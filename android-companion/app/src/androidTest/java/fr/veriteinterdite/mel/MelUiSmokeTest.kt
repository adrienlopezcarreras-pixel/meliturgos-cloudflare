package fr.veriteinterdite.mel

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertDoesNotExist
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MelUiSmokeTest {
    @get:Rule
    val compose = createAndroidComposeRule<MelUiHarnessActivity>()

    @Test
    fun miniHomeMatchesReferenceShell() {
        compose.onNodeWithTag("mini-stage").assertIsDisplayed()
        compose.onNodeWithTag("mel-animated-avatar").assertIsDisplayed()
        compose.onNodeWithTag("mini-talk-button").assertIsDisplayed()
        compose.onNodeWithTag("voice-waveform").assertIsDisplayed()
        compose.onNodeWithTag("settings-button").assertIsDisplayed()
    }

    @Test
    fun completeModeIsNativeAndExposesToolsWithoutBrowser() {
        compose.onNodeWithTag("settings-button").performClick()
        compose.onNodeWithTag("settings-tools").performClick()
        compose.onNodeWithText("Complet").performClick()
        compose.onNodeWithText("PROFESSOR / MODE COMPLET NATIF").assertIsDisplayed()
        compose.onNodeWithText("Synchroniser").assertIsDisplayed()
        compose.onNodeWithText("Arrière-plan / notifications").assertIsDisplayed()
        compose.onNodeWithText("AUTO-DIAGNOSTIC").assertIsDisplayed()
    }

    @Test
    fun keyboardScreenAcceptsTextAndCanSendLocally() {
        compose.onNodeWithTag("settings-button").performClick()
        compose.onNodeWithTag("settings-keyboard").performClick()
        compose.onNodeWithText("Message à MEL").performTextInput("bonjour MEL")
        compose.onNodeWithText("Envoyer").assertIsEnabled().performClick()
        compose.onNodeWithText("bonjour MEL").assertIsDisplayed()
    }

    @Test
    fun multimediaWebIsHiddenUntilExplicitlyRequested() {
        compose.onNodeWithTag("settings-button").performClick()
        compose.onNodeWithTag("settings-web").assertDoesNotExist()
        compose.onNodeWithTag("web-url").assertDoesNotExist()
        compose.onNodeWithTag("web-go").assertDoesNotExist()
    }
}
