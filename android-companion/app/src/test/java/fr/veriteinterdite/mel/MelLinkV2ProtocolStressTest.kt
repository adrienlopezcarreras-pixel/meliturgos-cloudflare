package fr.veriteinterdite.mel

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random
import kotlin.math.sin

/**
 * Offline transport and codec fuzzing; not a physical Bluetooth/device proof.
 */
class MelLinkV2ProtocolStressTest {
    @Test
    fun tenThousandFramesRoundtripWithIntegrityRejections() {
        val random = Random(20261010)
        repeat(10_000) { cycle ->
            val payload = ByteArray(cycle % 170).also { random.nextBytes(it) }
            val stream = cycle and 0xffff
            val seq = (cycle * 17) and 0xffff
            val type = when (cycle % 4) {
                0 -> MelLinkV2Protocol.REQUEST_DATA
                1 -> MelLinkV2Protocol.RESPONSE_DATA
                2 -> MelLinkV2Protocol.AUDIO_DATA
                else -> MelLinkV2Protocol.CREDIT
            }
            val frame = MelLinkV2Protocol.encode(type, 0, stream, seq, payload)
            assertTrue(frame.size <= 185 - 3)
            val restored = MelLinkV2Protocol.decode(frame)
            assertEquals(type, restored.type)
            assertEquals(stream, restored.streamId)
            assertEquals(seq, restored.seq)
            assertArrayEquals(payload, restored.payload)
            assertThrows(IllegalArgumentException::class.java) {
                MelLinkV2Protocol.decode(frame.copyOf(frame.size - 1))
            }
            if (payload.isNotEmpty()) {
                val tampered = frame.copyOf()
                tampered[MelLinkV2Protocol.HEADER_SIZE] =
                    (tampered[MelLinkV2Protocol.HEADER_SIZE].toInt() xor 0x04).toByte()
                assertThrows(IllegalArgumentException::class.java) {
                    MelLinkV2Protocol.decode(tampered)
                }
            }
        }
    }

    @Test
    fun thousandIndependentImaAdpcmBlocksDecodeDeterministically() {
        repeat(1000) { cycle ->
            val count = (cycle % MelImaAdpcm.BLOCK_SAMPLES) + 1
            val pcm = ShortArray(count) { i ->
                (7000.0 * sin((cycle + i) / 20.0)).toInt().toShort()
            }
            val block = MelImaAdpcm.encodeBlock(pcm)
            val decoded = MelImaAdpcm.decodeBlock(block)
            assertEquals(count, decoded.size)
            assertEquals(pcm[0], decoded[0])
            assertArrayEquals(decoded, MelImaAdpcm.decodeBlock(block))
        }
    }
}
