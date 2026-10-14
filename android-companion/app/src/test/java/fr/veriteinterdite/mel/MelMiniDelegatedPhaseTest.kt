package fr.veriteinterdite.mel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MelMiniDelegatedPhaseTest {
    private fun validate(
        schema: String = "mel.mini.linked-android-phase.v1",
        state: String = "FRESH",
        synced: Boolean = false,
        source: String = "android",
        phase: String = "CAPTURING",
        observedAtMs: Long = 90_000L,
        expiresAtMs: Long = 120_000L,
        receivedAtElapsedMs: Long = 10_000L,
        wallClockMs: Long = 100_000L
    ) = validatedMiniDelegatedPhase(schema, state, synced, source, phase,
        observedAtMs, expiresAtMs, receivedAtElapsedMs, wallClockMs)

    @Test fun onlyCurrentLinkedAndroidPhaseCanBePreviewed() {
        val proof = validate()
        assertEquals("CAPTURING", proof.phase)
        assertEquals(120_000L, proof.serverExpiresAtMs)
        assertTrue(miniDelegatedPhaseLabel(proof, 11_000L, 101_000L).contains("BLE non transmis"))
    }

    @Test fun unknownOrForgedServerContractFailsClosed() {
        assertNull(validate(schema="wrong").phase)
        assertNull(validate(state="UNAVAILABLE").phase)
        assertNull(validate(source="windows").phase)
        assertNull(validate(synced=true).phase)
        assertNull(validate(phase="SYNCHRONIZED").phase)
    }

    @Test fun staleFutureOrMalformedTimeFailsClosed() {
        assertNull(validate(observedAtMs=100_001L).phase)
        assertNull(validate(expiresAtMs=100_000L).phase)
        assertNull(validate(expiresAtMs=130_001L).phase)
        assertNull(validate(expiresAtMs=120_001L).phase)
        assertNull(validate(receivedAtElapsedMs=-1L).phase)
    }

    @Test fun cachedPreviewExpiresEvenWithoutNewNetworkResponse() {
        val proof=validate()
        assertTrue(miniDelegatedPhaseLabel(proof, 10_500L, 100_500L).contains("CAPTURING").not())
        assertEquals("API MINI · phase Android non vérifiée",
            miniDelegatedPhaseLabel(proof, 10_501L, 120_000L))
        assertEquals("API MINI · phase Android non vérifiée",
            miniDelegatedPhaseLabel(proof, 40_001L, 105_000L))
        assertEquals("API MINI · phase Android non vérifiée",
            miniDelegatedPhaseLabel(proof, 9_999L, 105_000L))
    }

    @Test fun noAmbiguousMiniCanBePresentedAsPhysicallySynchronized() {
        val proof=validate(phase="RESPONDING")
        assertTrue(miniDelegatedPhaseLabel(proof, 10_001L, 100_001L).contains("BLE non transmis"))
        assertTrue(miniDelegatedPhaseLabel(MelMiniDelegatedPhase(), 10_001L, 100_001L)
            .contains("non vérifiée"))
    }
}
