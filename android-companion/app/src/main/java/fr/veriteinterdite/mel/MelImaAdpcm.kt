package fr.veriteinterdite.mel

object MelImaAdpcm {
    const val BLOCK_SAMPLES = 256
    const val MAX_ENCODED_BYTES = 132

    private val indexTable = intArrayOf(
        -1,-1,-1,-1,2,4,6,8,
        -1,-1,-1,-1,2,4,6,8
    )

    private val stepTable = intArrayOf(
        7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,
        34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,
        157,173,190,209,230,253,279,307,337,371,408,449,494,544,
        598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,
        3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,
        15289,16818,18500,20350,22385,24623,27086,29794,32767
    )

    fun encodedSize(sampleCount: Int): Int {
        require(sampleCount in 1..BLOCK_SAMPLES)
        return 4 + ((sampleCount - 1 + 1) / 2)
    }

    fun decodeBlock(encoded: ByteArray): ShortArray {
        require(encoded.size >= 4) { "short ADPCM block" }
        val count = (encoded[3].toInt() and 0xff).let { if (it == 0) BLOCK_SAMPLES else it }
        require(count in 1..BLOCK_SAMPLES) { "bad sample count" }
        require(encoded.size == encodedSize(count)) { "bad ADPCM block size" }

        var predictor = (((encoded[1].toInt() and 0xff) shl 8) or (encoded[0].toInt() and 0xff)).toShort().toInt()
        var index = (encoded[2].toInt() and 0xff).coerceIn(0, 88)
        val out = ShortArray(count)
        out[0] = predictor.toShort()

        for (i in 1 until count) {
            val packed = encoded[4 + ((i - 1) / 2)].toInt() and 0xff
            val code = if (((i - 1) and 1) == 0) packed and 0x0f else (packed ushr 4) and 0x0f
            val step = stepTable[index]
            var delta = step ushr 3
            if ((code and 4) != 0) delta += step
            if ((code and 2) != 0) delta += step ushr 1
            if ((code and 1) != 0) delta += step ushr 2
            predictor = if ((code and 8) != 0) predictor - delta else predictor + delta
            predictor = predictor.coerceIn(-32768, 32767)
            index = (index + indexTable[code]).coerceIn(0, 88)
            out[i] = predictor.toShort()
        }
        return out
    }

    fun decodeStream(blocks: List<ByteArray>): ShortArray {
        val decoded = blocks.map(::decodeBlock)
        val total = decoded.sumOf { it.size }
        val out = ShortArray(total)
        var offset = 0
        for (block in decoded) {
            block.copyInto(out, offset)
            offset += block.size
        }
        return out
    }

    fun pcm16MonoWav(samples: ShortArray, sampleRate: Int = 16_000): ByteArray {
        require(sampleRate in 8_000..48_000)
        val dataBytes = samples.size * 2
        val out = java.nio.ByteBuffer.allocate(44 + dataBytes).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        out.put("RIFF".toByteArray(Charsets.US_ASCII))
        out.putInt(36 + dataBytes)
        out.put("WAVEfmt ".toByteArray(Charsets.US_ASCII))
        out.putInt(16)
        out.putShort(1)
        out.putShort(1)
        out.putInt(sampleRate)
        out.putInt(sampleRate * 2)
        out.putShort(2)
        out.putShort(16)
        out.put("data".toByteArray(Charsets.US_ASCII))
        out.putInt(dataBytes)
        for (sample in samples) out.putShort(sample)
        return out.array()
    }
}
