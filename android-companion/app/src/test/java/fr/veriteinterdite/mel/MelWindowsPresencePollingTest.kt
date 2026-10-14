package fr.veriteinterdite.mel

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MelWindowsPresencePollingTest {
    @Test fun keepsPollingDuringBusyVoiceAndLongTasks() {
        assertTrue(shouldPollWindowsPresence(MelUiState(
            session = SessionStage.CONNECTED, busy = true, speaking = true)))
        assertTrue(shouldPollWindowsPresence(MelUiState(
            session = SessionStage.CONNECTED, busy = true, speaking = false)))
        assertTrue(shouldPollWindowsPresence(MelUiState(
            session = SessionStage.CONNECTED, busy = false)))
    }

    @Test fun neverPollsWindowsWithoutAuthenticatedAndroidSession() {
        for (session in listOf(SessionStage.DISCONNECTED, SessionStage.VERIFYING, SessionStage.ERROR)) {
            assertFalse(shouldPollWindowsPresence(MelUiState(session = session, busy = false)))
            assertFalse(shouldPollWindowsPresence(MelUiState(session = session, busy = true)))
        }
    }
}
