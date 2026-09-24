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
        compose.onNodeWithTag("mini-stage").assertIsDisplayed()
        compose.onNodeWithTag("mel-animated-avatar").assertIsDisplayed()
        compose.onNodeWithTag("nav-keyboard").assertIsDisplayed()
        compose.onNodeWithTag("nav-camera").assertIsDisplayed()
        compose.onNodeWithTag("nav-companion").assertIsDisplayed()
        compose.onNodeWithTag("nav-tools").assertIsDisplayed()

        compose.onNodeWithTag("nav-tools").performClick()
        compose.onNodeWithText("PROFESSOR / MODE COMPLET NATIF").assertIsDisplayed()
        compose.onNodeWithText("Synchroniser").assertIsDisplayed()
        compose.onNodeWithText("AUTO-DIAGNOSTIC").assertIsDisplayed()
        compose.waitForIdle()
    }

}
