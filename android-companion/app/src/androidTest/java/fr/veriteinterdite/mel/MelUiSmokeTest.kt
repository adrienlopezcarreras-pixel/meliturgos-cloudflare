package fr.veriteinterdite.mel

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
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
    fun miniHomeShowsNativeMobileNavigation() {
        compose.onNodeWithTag("mini-stage").assertIsDisplayed()
        compose.onNodeWithTag("mini-talk-button").assertIsDisplayed()
        compose.onNodeWithTag("nav-keyboard").assertIsDisplayed()
        compose.onNodeWithTag("nav-camera").assertIsDisplayed()
        compose.onNodeWithTag("nav-companion").assertIsDisplayed()
        compose.onNodeWithTag("nav-tools").assertIsDisplayed()
    }

    @Test
    fun completeModeIsNativeAndExposesToolsWithoutBrowser() {
        compose.onNodeWithTag("nav-tools").performClick()
        compose.onNodeWithText("Complet").performClick()
        compose.onNodeWithText("PROFESSOR / MODE COMPLET NATIF").assertIsDisplayed()
        compose.onNodeWithText("Synchroniser").assertIsDisplayed()
        compose.onNodeWithText("Arrière-plan / notifications").assertIsDisplayed()
        compose.onNodeWithText("AUTO-DIAGNOSTIC").assertIsDisplayed()
    }

    @Test
    fun keyboardScreenAcceptsTextAndCanSendLocally() {
        compose.onNodeWithTag("nav-keyboard").performClick()
        compose.onNodeWithText("Message à MEL").performTextInput("bonjour MEL")
        compose.onNodeWithText("Envoyer").assertIsEnabled().performClick()
        compose.onNodeWithText("bonjour MEL").assertIsDisplayed()
    }

}
