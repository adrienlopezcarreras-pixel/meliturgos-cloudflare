package fr.veriteinterdite.mel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MelImaAdpcmTest {
    @Test
    fun zeroBlockDecodesToSilence() {
        val block = ByteArray(MelImaAdpcm.encodedSize(256))
        block[3] = 0 // 0 encodes the full 256-sample block
        val pcm = MelImaAdpcm.decodeBlock(block)
        assertEquals(256, pcm.size)
        assertTrue(pcm.all { it.toInt() == 0 })
    }

    @Test
    fun wavIsCanonicalMono16kPcm16() {
        val wav = MelImaAdpcm.pcm16MonoWav(ShortArray(320))
        assertEquals("RIFF", wav.copyOfRange(0, 4).toString(Charsets.US_ASCII))
        assertEquals("WAVE", wav.copyOfRange(8, 12).toString(Charsets.US_ASCII))
        assertEquals("data", wav.copyOfRange(36, 40).toString(Charsets.US_ASCII))
        assertEquals(44 + 640, wav.size)
    }
}
