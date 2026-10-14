package fr.veriteinterdite.mel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MelTriadConversationActivityTest {
    @Test fun idleRepresentsOnlyLocalReadiness() {
        val phase = triadConversationActivity(SessionStage.CONNECTED, false, false, false, "", null)
        assertEquals("IDLE", phase.phase)
        assertFalse(phase.active)
        assertTrue(phase.locallyObserved)
    }

    @Test fun realMicCaptureIsShownAsListening() {
        val phase = triadConversationActivity(SessionStage.CONNECTED, true, true, true, "MEL parle", null)
        assertEquals("CAPTURING", phase.phase)
        assertTrue(phase.active)
        assertTrue(phase.label.contains("écoute"))
    }

    @Test fun speakingTakesPrecedenceOverBusy() {
        val phase = triadConversationActivity(SessionStage.CONNECTED, false, true, true, "MEL parle…", null)
        assertEquals("RESPONDING", phase.phase)
        assertTrue(phase.label.contains("vocale"))
    }

    @Test fun inFlightChatDoesNotPretendToBeListening() {
        val phase = triadConversationActivity(SessionStage.CONNECTED, false, true, false, "MEL réfléchit…", null)
        assertEquals("THINKING", phase.phase)
        assertTrue(phase.active)
    }

    @Test fun voiceTranscriptionUsesOwnVerifiedStatus() {
        val phase = triadConversationActivity(SessionStage.CONNECTED, false, true, false, "Transcription de ta voix…", null)
        assertEquals("TRANSCRIBING", phase.phase)
        assertTrue(phase.active)
    }

    @Test fun unrelatedBusyOperationsNeverClaimConversationThinking() {
        for (status in listOf("Synchronisation…", "Envoi de fichier…", "Auto-diagnostic Android…",
            "Test fichier Android…", "Recherche des compagnons…")) {
            val phase = triadConversationActivity(SessionStage.CONNECTED, false, true, false, status, null)
            assertEquals("OTHER_BUSY", phase.phase)
            assertFalse(phase.active)
        }
    }

    @Test fun errorSuppressesAnyLiveLocalClaim() {
        val phase = triadConversationActivity(SessionStage.CONNECTED, true, true, false, "MEL réfléchit", "Erreur")
        assertEquals("ERROR", phase.phase)
        assertFalse(phase.active)
    }

    @Test fun disconnectedSessionNeverClaimsActiveConversation() {
        for (session in listOf(SessionStage.DISCONNECTED, SessionStage.ERROR, SessionStage.VERIFYING)) {
            val phase = triadConversationActivity(session, true, true, true, "MEL parle", null)
            assertEquals("UNAVAILABLE", phase.phase)
            assertFalse(phase.active)
        }
    }
}
