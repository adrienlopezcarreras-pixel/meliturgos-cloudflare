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
            MelWindowsPresence(known = true, online = true, halted = false, receivedAtElapsedMs = 1_000L),
            nowElapsedMs = 1_001L
        )
        assertTrue(view.windowsLabel.contains("en ligne"))
        assertFalse(view.windowsVerified)
    }

    @Test fun haltAndOfflineRemainDistinct() {
        val mini = miniReadiness(false, false, false)
        val halted = triadReadiness(
            SessionStage.CONNECTED, mini,
            MelWindowsPresence(known = true, online = false, halted = true, receivedAtElapsedMs = 1_000L),
            nowElapsedMs = 1_001L
        )
        assertTrue(halted.windowsLabel.contains("HALT"))
        assertFalse(halted.windowsVerified)
        val offline = triadReadiness(
            SessionStage.CONNECTED, mini,
            MelWindowsPresence(known = true, online = false, halted = false, receivedAtElapsedMs = 1_000L),
            nowElapsedMs = 1_001L
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

    @Test fun windowsOnlineEvidenceExpiresAfter35Seconds() {
        val mini = miniReadiness(false, false, false)
        val signal = MelWindowsPresence(known = true, online = true, receivedAtElapsedMs = 1_000L)
        val justFresh = triadReadiness(SessionStage.CONNECTED, mini, signal, nowElapsedMs = 36_000L)
        assertTrue(justFresh.windowsLabel.contains("en ligne"))
        val stale = triadReadiness(SessionStage.CONNECTED, mini, signal, nowElapsedMs = 36_001L)
        assertEquals("Windows · état à actualiser", stale.windowsLabel)
        assertFalse(stale.windowsVerified)
    }

    @Test fun futureOrMissingEvidenceNeverClaimsWindowsIsOnline() {
        val mini = miniReadiness(false, false, false)
        val future = MelWindowsPresence(known = true, online = true, receivedAtElapsedMs = 500L)
        assertEquals("Windows · état à actualiser",
            triadReadiness(SessionStage.CONNECTED, mini, future, nowElapsedMs = 400L).windowsLabel)
        val missing = MelWindowsPresence(known = true, online = true)
        assertEquals("Windows · état à actualiser",
            triadReadiness(SessionStage.CONNECTED, mini, missing, nowElapsedMs = 500L).windowsLabel)
    }

    @Test fun staleHaltRemainsUnverifiedAndRequiresRefresh() {
        val mini = miniReadiness(false, false, false)
        val halted = MelWindowsPresence(known = true, halted = true, receivedAtElapsedMs = 1_000L)
        val view = triadReadiness(SessionStage.CONNECTED, mini, halted, nowElapsedMs = 36_010L)
        assertEquals("Windows · état à actualiser", view.windowsLabel)
        assertFalse(view.windowsVerified)
    }

}
