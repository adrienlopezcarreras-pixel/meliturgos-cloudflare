package fr.veriteinterdite.mel

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.lang.reflect.InvocationTargetException

class MelMiniVoiceWavChunkTest {
    private fun writeLe32(bytes: ByteArray, at: Int, value: Int) {
        for (i in 0..3) bytes[at + i] = (value ushr (8 * i)).toByte()
    }

    private fun decode(wav: ByteArray): Pair<*, *> {
        val method = MelMiniVoiceSynthesizer::class.java
            .getDeclaredMethod("decodeWavToMono16", ByteArray::class.java)
        method.isAccessible = true
        return method.invoke(MelMiniVoiceSynthesizer, wav) as Pair<*, *>
    }

    @Test fun rejectsOverflowingChunkSizeBeforeReadingOrAllocating() {
        val wav = ByteArray(44)
        "RIFF".toByteArray(Charsets.US_ASCII).copyInto(wav, 0)
        "WAVE".toByteArray(Charsets.US_ASCII).copyInto(wav, 8)
        "data".toByteArray(Charsets.US_ASCII).copyInto(wav, 12)
        writeLe32(wav, 16, Int.MAX_VALUE)
        val error = assertThrows(InvocationTargetException::class.java) { decode(wav) }
        assertEquals("MINI_TTS_WAV_CHUNK", error.cause?.message)
    }

    @Test fun acceptsValidMonoPcm16Wav() {
        val wav = ByteArray(46)
        "RIFF".toByteArray(Charsets.US_ASCII).copyInto(wav, 0)
        writeLe32(wav, 4, wav.size - 8)
        "WAVE".toByteArray(Charsets.US_ASCII).copyInto(wav, 8)
        "fmt ".toByteArray(Charsets.US_ASCII).copyInto(wav, 12)
        writeLe32(wav, 16, 16)
        wav[20] = 1 // PCM
        wav[22] = 1 // mono
        writeLe32(wav, 24, 48_000)
        writeLe32(wav, 28, 96_000)
        wav[32] = 2 // frame size
        wav[34] = 16 // bits per sample
        "data".toByteArray(Charsets.US_ASCII).copyInto(wav, 36)
        writeLe32(wav, 40, 2)
        wav[44] = 0x34
        wav[45] = 0x12
        val decoded = decode(wav)
        assertEquals(48_000, decoded.second)
        assertArrayEquals(shortArrayOf(0x1234.toShort()), decoded.first as ShortArray)
    }
}
