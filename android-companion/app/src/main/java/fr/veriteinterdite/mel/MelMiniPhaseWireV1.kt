package fr.veriteinterdite.mel

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * TRIAD_PHASE v1 wire payload only. Does not send a BLE frame, negotiate a
 * capability, or imply receiver ACK. See docs/mini-linkv2-triad-phase-v1-contract.md.
 */
internal object MelMiniPhaseWireV1 {
    const val SIZE = 14
    const val MAX_AGE_MS = 30_000
    private const val VERSION = 1
    val phases = listOf("IDLE", "CAPTURING", "TRANSCRIBING", "THINKING", "RESPONDING", "OTHER_BUSY", "ERROR")

    data class Payload(
        val phase: String,
        val freshnessMs: Int,
        val sessionGeneration: Long,
        val phaseNonce: Long,
        val validityMs: Int
    )

    fun encode(payload: Payload): ByteArray {
        val phaseCode = phases.indexOf(payload.phase)
        require(phaseCode >= 0)
        require(payload.freshnessMs in 0..MAX_AGE_MS)
        require(payload.sessionGeneration in 1..0xffff_ffffL)
        require(payload.phaseNonce in 1..0xffff_ffffL)
        require(payload.validityMs in 1..(MAX_AGE_MS - payload.freshnessMs))
        return ByteBuffer.allocate(SIZE).order(ByteOrder.LITTLE_ENDIAN).apply {
            put(VERSION.toByte())
            put(phaseCode.toByte())
            putShort(payload.freshnessMs.toShort())
            putInt(payload.sessionGeneration.toInt())
            putInt(payload.phaseNonce.toInt())
            putShort(payload.validityMs.toShort())
        }.array()
    }

    fun decode(raw: ByteArray): Payload? {
        if (raw.size != SIZE) return null
        val b = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN)
        if ((b.get().toInt() and 0xff) != VERSION) return null
        val phaseCode = b.get().toInt() and 0xff
        if (phaseCode !in phases.indices) return null
        val age = b.short.toInt() and 0xffff
        val generation = b.int.toLong() and 0xffff_ffffL
        val nonce = b.int.toLong() and 0xffff_ffffL
        val ttl = b.short.toInt() and 0xffff
        if (age > MAX_AGE_MS || generation == 0L || nonce == 0L ||
            ttl == 0 || ttl > MAX_AGE_MS - age) return null
        return Payload(phases[phaseCode], age, generation, nonce, ttl)
    }
}
