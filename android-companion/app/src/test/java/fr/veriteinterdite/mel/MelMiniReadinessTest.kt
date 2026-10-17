package fr.veriteinterdite.mel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MelMiniReadinessTest {
    @Test fun disconnectedNeverVerified() {
        val status = miniReadiness(bleConnected = false, protocolReady = true, internetReady = true)
        assertFalse(status.bleConnected)
        assertFalse(status.linkV2Verified)
        assertFalse(status.melInternetVerified)
        assertEquals("MINI DÉCONNECTÉE", status.statusLabel)
    }

    @Test fun bluetoothAloneDoesNotProveLinkV2() {
        val status = miniReadiness(bleConnected = true, protocolReady = false, internetReady = true)
        assertTrue(status.bleConnected)
        assertFalse(status.linkV2Verified)
        assertFalse(status.melInternetVerified)
        assertTrue(status.sessionDescription.contains("SESSION_OK"))
    }

    @Test fun confirmedLinkV2DoesNotClaimInternet() {
        val status = miniReadiness(bleConnected = true, protocolReady = true, internetReady = false)
        assertTrue(status.linkV2Verified)
        assertFalse(status.melInternetVerified)
        assertEquals("SESSION LINK V2 VÉRIFIÉE", status.statusLabel)
    }

    @Test fun fullReadinessRequiresAllThreeFacts() {
        val status = miniReadiness(bleConnected = true, protocolReady = true, internetReady = true)
        assertTrue(status.bleConnected)
        assertTrue(status.linkV2Verified)
        assertTrue(status.melInternetVerified)
    }

    @Test fun heartbeatAcceptsOnlyMatchingAuthenticatedAck() {
        assertTrue(miniHeartbeatAccepted(
            acknowledged = true,
            returnedDeviceId = "android-phone123",
            expectedDeviceId = "android-phone123",
            returnedPhase = "MINI_LINK_V2_READY"
        ))
    }

    @Test fun heartbeatRejectsHttp200WithoutPositiveAck() {
        assertFalse(miniHeartbeatAccepted(false, "android-phone123", "android-phone123", "MINI_LINK_V2_READY"))
        assertFalse(miniHeartbeatAccepted(true, "android-phone123", "android-phone123", ""))
    }

    @Test fun heartbeatRejectsOtherDeviceAndWrongPhase() {
        assertFalse(miniHeartbeatAccepted(true, "android-other", "android-phone123", "MINI_LINK_V2_READY"))
        assertFalse(miniHeartbeatAccepted(true, "", "android-phone123", "MINI_LINK_V2_READY"))
        assertFalse(miniHeartbeatAccepted(true, "android-phone123", "", "MINI_LINK_V2_READY"))
        assertFalse(miniHeartbeatAccepted(true, "android-phone123", "android-phone123", "ONLINE"))
    }
}
