package fr.veriteinterdite.mel

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
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

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
