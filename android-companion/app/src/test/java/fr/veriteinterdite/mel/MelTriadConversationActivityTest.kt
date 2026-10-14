package fr.veriteinterdite.mel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MelTriadConversationActivityTest {
    @Test fun idleRepresentsOnlyLocalReadiness() {
        val phase = triadConversationActivity(SessionStage.CONNECTED, false, false, false, null)
        assertEquals("IDLE", phase.phase)
        assertFalse(phase.active)
        assertTrue(phase.locallyObserved)
    }

    @Test fun realMicCaptureIsShownAsListening() {
        val phase = triadConversationActivity(SessionStage.CONNECTED, true, true, true, null)
        assertEquals("CAPTURING", phase.phase)
        assertTrue(phase.active)
        assertTrue(phase.label.contains("écoute"))
    }

    @Test fun speakingTakesPrecedenceOverBusy() {
        val phase = triadConversationActivity(SessionStage.CONNECTED, false, true, true, null)
        assertEquals("RESPONDING", phase.phase)
        assertTrue(phase.label.contains("vocale"))
    }

    @Test fun inFlightChatDoesNotPretendToBeListening() {
        val phase = triadConversationActivity(SessionStage.CONNECTED, false, true, false, null)
        assertEquals("THINKING", phase.phase)
        assertTrue(phase.active)
    }

    @Test fun errorSuppressesAnyLiveLocalClaim() {
        val phase = triadConversationActivity(SessionStage.CONNECTED, true, true, false, "Erreur")
        assertEquals("ERROR", phase.phase)
        assertFalse(phase.active)
    }

    @Test fun disconnectedSessionNeverClaimsActiveConversation() {
        for (session in listOf(SessionStage.DISCONNECTED, SessionStage.ERROR, SessionStage.VERIFYING)) {
            val phase = triadConversationActivity(session, true, true, true, null)
            assertEquals("UNAVAILABLE", phase.phase)
            assertFalse(phase.active)
        }
    }
}
