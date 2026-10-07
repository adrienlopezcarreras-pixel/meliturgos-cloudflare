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

    private val decimatorQ15 = intArrayOf(
        51,17,-58,-146,-134,84,426,555,114,-838,
        -1592,-1105,1213,4834,8186,9551,8186,4834,1213,
        -1105,-1592,-838,114,555,426,84,-134,-146,-58,17,51
    )

    fun encodeBlock(samples: ShortArray): ByteArray {
        require(samples.isNotEmpty() && samples.size <= BLOCK_SAMPLES)
        val out = ByteArray(encodedSize(samples.size))
        var predictor = samples[0].toInt()
        var index = 0
        out[0] = (predictor and 0xff).toByte()
        out[1] = ((predictor ushr 8) and 0xff).toByte()
        out[2] = index.toByte()
        out[3] = if (samples.size == BLOCK_SAMPLES) 0 else samples.size.toByte()

        var dst = 4
        var low = true
        var packed = 0
        for (i in 1 until samples.size) {
            val step = stepTable[index]
            var diff = samples[i].toInt() - predictor
            var code = 0
            if (diff < 0) {
                code = 8
                diff = -diff
            }
            var delta = step ushr 3
            var threshold = step
            if (diff >= threshold) {
                code = code or 4
                diff -= threshold
                delta += threshold
            }
            threshold = threshold ushr 1
            if (diff >= threshold) {
                code = code or 2
                diff -= threshold
                delta += threshold
            }
            threshold = threshold ushr 1
            if (diff >= threshold) {
                code = code or 1
                delta += threshold
            }

            predictor = if ((code and 8) != 0) predictor - delta else predictor + delta
            predictor = predictor.coerceIn(-32768, 32767)
            index = (index + indexTable[code and 0x0f]).coerceIn(0, 88)

            if (low) {
                packed = code and 0x0f
                low = false
            } else {
                packed = packed or ((code and 0x0f) shl 4)
                out[dst++] = packed.toByte()
                packed = 0
                low = true
            }
        }
        if (!low) out[dst] = packed.toByte()
        return out
    }

    fun decodePcm16MonoWav(wav: ByteArray, expectedRate: Int): ShortArray {
        require(wav.size >= 44) { "short WAV" }
        require(wav.copyOfRange(0,4).toString(Charsets.US_ASCII) == "RIFF") { "not RIFF" }
        require(wav.copyOfRange(8,12).toString(Charsets.US_ASCII) == "WAVE") { "not WAVE" }

        var offset = 12
        var formatOk = false
        var dataOffset = -1
        var dataSize = -1
        while (offset + 8 <= wav.size) {
            val id = wav.copyOfRange(offset,offset+4).toString(Charsets.US_ASCII)
            val size = le32(wav, offset + 4)
            val body = offset + 8
            require(size >= 0 && body + size <= wav.size) { "bad WAV chunk" }
            if (id == "fmt " && size >= 16) {
                val audioFormat = le16(wav, body)
                val channels = le16(wav, body + 2)
                val rate = le32(wav, body + 4)
                val bits = le16(wav, body + 14)
                formatOk = audioFormat == 1 && channels == 1 && rate == expectedRate && bits == 16
            } else if (id == "data") {
                dataOffset = body
                dataSize = size
                break
            }
            offset = body + size + (size and 1)
        }
        require(formatOk && dataOffset >= 0 && dataSize >= 0 && (dataSize and 1) == 0) { "unsupported WAV" }
        val samples = ShortArray(dataSize / 2)
        var src = dataOffset
        for (i in samples.indices) {
            val lo = wav[src++].toInt() and 0xff
            val hi = wav[src++].toInt() and 0xff
            samples[i] = ((hi shl 8) or lo).toShort()
        }
        return samples
    }

    fun upsample16kTo48k(samples16k: ShortArray): ShortArray {
        if (samples16k.isEmpty()) return ShortArray(0)
        val out = ShortArray(samples16k.size * 3)
        for (i in samples16k.indices) {
            val a = samples16k[i].toInt()
            val b = samples16k[minOf(i + 1, samples16k.lastIndex)].toInt()
            out[i * 3] = a.toShort()
            out[i * 3 + 1] = ((2 * a + b) / 3).coerceIn(-32768, 32767).toShort()
            out[i * 3 + 2] = ((a + 2 * b) / 3).coerceIn(-32768, 32767).toShort()
        }
        return out
    }

    fun decimate48kTo16k(samples48k: ShortArray): ShortArray {
        require(samples48k.size >= 31)
        val count = samples48k.size / 3
        val out = ShortArray(count)
        val half = decimatorQ15.size / 2
        for (i in 0 until count) {
            val center = i * 3
            var acc = 0L
            for (tap in decimatorQ15.indices) {
                val src = (center + tap - half).coerceIn(0, samples48k.lastIndex)
                acc += samples48k[src].toLong() * decimatorQ15[tap].toLong()
            }
            out[i] = (acc shr 15).coerceIn(-32768,32767).toShort()
        }
        return out
    }

    private fun le16(data: ByteArray, offset: Int): Int =
        (data[offset].toInt() and 0xff) or ((data[offset+1].toInt() and 0xff) shl 8)

    private fun le32(data: ByteArray, offset: Int): Int =
        (data[offset].toInt() and 0xff) or
            ((data[offset+1].toInt() and 0xff) shl 8) or
            ((data[offset+2].toInt() and 0xff) shl 16) or
            ((data[offset+3].toInt() and 0xff) shl 24)

}
