package fr.veriteinterdite.mel

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertEquals
import org.junit.Test

class MelTriadReadinessTest {
    @Test fun allUnverifiedWithoutConnections() {
        val view = triadReadiness(SessionStage.DISCONNECTED, miniReadiness(false, false, false))
        assertFalse(view.androidVerified)
        assertFalse(view.miniVerified)
        assertFalse(view.windowsVerified)
        assertEquals("Windows · état indisponible sans session Android", view.windowsLabel)
    }

    @Test fun loginDoesNotImplyMiniOrWindowsReadiness() {
        val view = triadReadiness(SessionStage.CONNECTED, miniReadiness(false, false, false))
        assertTrue(view.androidVerified)
        assertFalse(view.miniVerified)
        assertFalse(view.windowsVerified)
    }

    @Test fun bleGATTIsNotFullMiniSession() {
        val view = triadReadiness(SessionStage.CONNECTED, miniReadiness(true, false, false))
        assertFalse(view.miniVerified)
        assertEquals("MINI · Bluetooth uniquement", view.miniLabel)
    }

    @Test fun verifiedMiniLinkDoesNotClaimOwnerApprovedWindows() {
        val view = triadReadiness(SessionStage.CONNECTED, miniReadiness(true, true, true))
        assertTrue(view.miniVerified)
        assertTrue(view.androidVerified)
        assertFalse(view.windowsVerified)
    }

    @Test fun expiredAndroidSessionDoesNotRemainVerified() {
        val view = triadReadiness(SessionStage.ERROR, miniReadiness(true, true, false))
        assertFalse(view.androidVerified)
        assertTrue(view.miniVerified)
    }
    @Test fun windowsHeartbeatIndicatesPresenceNotControlApproval() {
        val view = triadReadiness(
            SessionStage.CONNECTED,
            miniReadiness(true, true, true),
            MelWindowsPresence(known = true, online = true, halted = false)
        )
        assertTrue(view.windowsLabel.contains("en ligne"))
        assertFalse(view.windowsVerified)
    }

    @Test fun haltAndOfflineRemainDistinct() {
        val mini = miniReadiness(false, false, false)
        val halted = triadReadiness(
            SessionStage.CONNECTED, mini,
            MelWindowsPresence(known = true, online = false, halted = true)
        )
        assertTrue(halted.windowsLabel.contains("HALT"))
        assertFalse(halted.windowsVerified)
        val offline = triadReadiness(
            SessionStage.CONNECTED, mini,
            MelWindowsPresence(known = true, online = false, halted = false)
        )
        assertTrue(offline.windowsLabel.contains("hors ligne"))
        assertFalse(offline.windowsVerified)
    }

    @Test fun cachedWindowsOnlineCannotOutliveAndroidSession() {
        val view = triadReadiness(
            SessionStage.DISCONNECTED,
            miniReadiness(true, true, false),
            MelWindowsPresence(known = true, online = true, halted = false)
        )
        assertTrue(view.windowsLabel.contains("indisponible"))
        assertFalse(view.windowsVerified)
    }

}
