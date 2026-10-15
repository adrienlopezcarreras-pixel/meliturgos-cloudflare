package fr.veriteinterdite.mel

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Candidate MINI capability request format, matched to firmware v1.
 * Serialization alone NEVER authorizes or transmits any BLE frame.
 */
internal object MelMiniPhaseCapabilityWireV1 {
    const val SIZE = 6
    private const val VERSION: Byte = 1
    private const val EXPLICIT_CONSENT: Byte = 1

    fun encode(sessionGeneration: Long, explicitConsent: Boolean): ByteArray {
        require(explicitConsent) { "Explicit consent required" }
        require(sessionGeneration in 1..0xffff_ffffL) { "Invalid session generation" }
        return ByteBuffer.allocate(SIZE).order(ByteOrder.LITTLE_ENDIAN).apply {
            put(VERSION)
            put(EXPLICIT_CONSENT)
            putInt(sessionGeneration.toInt())
        }.array()
    }

    fun decode(candidate: ByteArray): Long? {
        if (candidate.size != SIZE || candidate[0] != VERSION ||
            candidate[1] != EXPLICIT_CONSENT) return null
        val generation = ByteBuffer.wrap(candidate, 2, 4)
            .order(ByteOrder.LITTLE_ENDIAN).int.toLong() and 0xffff_ffffL
        return generation.takeIf { it != 0L }
    }
}
