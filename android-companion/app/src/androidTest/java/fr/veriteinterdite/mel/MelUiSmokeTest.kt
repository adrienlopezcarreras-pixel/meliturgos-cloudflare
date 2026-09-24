package fr.veriteinterdite.mel

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
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
    fun normalModeShowsCoreNativeControls() {
        compose.onNodeWithText("MEL // CORE").assertIsDisplayed()
        compose.onNodeWithText("Normal").assertIsDisplayed()
        compose.onNodeWithText("Complet").assertIsDisplayed()
        compose.onNodeWithText("VOICE LINK").assertIsDisplayed()
        compose.onNodeWithText("Fichier").assertIsDisplayed()
        compose.onNodeWithText("Micro").assertIsDisplayed()
        compose.onNodeWithText("Envoyer").assertIsDisplayed()
    }

    @Test
    fun completeModeExposesAdvancedControls() {
        compose.onNodeWithText("Complet").performClick()
        compose.onNodeWithText("MEL // FULL ACCESS").assertIsDisplayed()
        compose.onNodeWithText("Ouvrir les outils").performClick()
        compose.onNodeWithText("SYSTEM TOOLS").assertIsDisplayed()
        compose.onNodeWithText("Synchroniser").assertIsDisplayed()
        compose.onNodeWithText("Professor").assertIsDisplayed()
        compose.onNodeWithText("Notifications arrière-plan").assertIsDisplayed()
    }

    @Test
    fun composerAcceptsTextAndCanSendLocally() {
        compose.onNodeWithText("Message à MEL").performTextInput("bonjour MEL")
        compose.onNodeWithText("Envoyer").assertIsEnabled().performClick()
        compose.onNodeWithText("bonjour MEL").assertIsDisplayed()
    }
}
