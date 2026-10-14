package fr.veriteinterdite.mel

import org.junit.Assert.*
import org.junit.Test

class MelMiniPhaseWireV1Test {
    @Test fun roundTripEveryPhase() {
        for (phase in MelMiniPhaseWireV1.phases) {
            val payload = MelMiniPhaseWireV1.Payload(phase, 1000, 42, 12345, 29000)
            assertEquals(payload, MelMiniPhaseWireV1.decode(MelMiniPhaseWireV1.encode(payload)))
        }
    }

    @Test fun rejectsInvalidInputsAndTampering() {
        val valid = MelMiniPhaseWireV1.encode(
            MelMiniPhaseWireV1.Payload("THINKING", 500, 1, 2, 20000)
        )
        assertNull(MelMiniPhaseWireV1.decode(valid.copyOfRange(0, 13)))
        assertNull(MelMiniPhaseWireV1.decode(valid + byteArrayOf(0)))
        assertNull(MelMiniPhaseWireV1.decode(valid.clone().apply { this[0] = 2 }))
        assertNull(MelMiniPhaseWireV1.decode(valid.clone().apply { this[1] = 100 }))
        assertNull(MelMiniPhaseWireV1.decode(valid.clone().apply { this[4] = 0; this[5] = 0; this[6] = 0; this[7] = 0 }))
        assertNull(MelMiniPhaseWireV1.decode(valid.clone().apply { this[8] = 0; this[9] = 0; this[10] = 0; this[11] = 0 }))
        assertNull(MelMiniPhaseWireV1.decode(valid.clone().apply { this[12] = 0; this[13] = 0 }))
    }

    @Test fun refusesUnboundedOrInvalidPayload() {
        assertThrows(IllegalArgumentException::class.java) {
            MelMiniPhaseWireV1.encode(MelMiniPhaseWireV1.Payload("UNKNOWN", 0, 1, 1, 1))
        }
        assertThrows(IllegalArgumentException::class.java) {
            MelMiniPhaseWireV1.encode(MelMiniPhaseWireV1.Payload("IDLE", 30000, 1, 1, 1))
        }
    }
}
