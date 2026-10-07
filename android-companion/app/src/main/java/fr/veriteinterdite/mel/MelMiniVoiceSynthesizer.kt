package fr.veriteinterdite.mel

import android.content.Context
import android.media.AudioFormat
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Collections
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.floor
import kotlin.math.roundToInt

/**
 * Dedicated French synthesizer for MINI.
 *
 * Android TTS produces speech locally. We capture the exact synthesized audio,
 * downmix/resample it to signed PCM16 mono 48 kHz, then Link V2 sends it to MINI.
 */
object MelMiniVoiceSynthesizer {
    private const val TAG = "MelMiniVoice"
    private const val OUTPUT_RATE = 48_000

    private data class Format(
        val sampleRate: Int,
        val audioFormat: Int,
        val channels: Int
    )

    private val initLock = Any()
    private val synthLock = Any()
    @Volatile private var engine: TextToSpeech? = null
    @Volatile private var initLatch: CountDownLatch? = null
    @Volatile private var initError: Throwable? = null

    private fun ensureFrenchEngine(context: Context): TextToSpeech {
        engine?.let { return it }

        val latch: CountDownLatch
        var startInit = false
        synchronized(initLock) {
            engine?.let { return it }
            val current = initLatch
            if (current != null) {
                latch = current
            } else {
                latch = CountDownLatch(1)
                initLatch = latch
                initError = null
                startInit = true
            }
        }

        if (startInit) {
            Handler(Looper.getMainLooper()).post {
                val ref = AtomicReference<TextToSpeech?>(null)
                val tts = TextToSpeech(context.applicationContext) { status ->
                    val ready = ref.get()
                    try {
                        if (status != TextToSpeech.SUCCESS || ready == null) {
                            throw IllegalStateException("MINI_TTS_INIT_FAILED")
                        }
                        val languageResult = ready.setLanguage(Locale.FRANCE)
                        if (languageResult == TextToSpeech.LANG_MISSING_DATA ||
                            languageResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                            throw IllegalStateException("MINI_TTS_FRENCH_UNAVAILABLE")
                        }

                        val voice = ready.voices
                            ?.filter { it.locale?.language.equals("fr", ignoreCase = true) }
                            ?.maxByOrNull {
                                var score = it.quality * 10 - it.latency
                                if (it.locale?.country.equals("FR", ignoreCase = true)) score += 10_000
                                if (!it.isNetworkConnectionRequired) score += 100
                                score
                            }
                        if (voice != null) ready.voice = voice
                        ready.setSpeechRate(0.96f)
                        ready.setPitch(1.0f)

                        synchronized(initLock) {
                            engine = ready
                            initError = null
                        }
                        Log.i(TAG, "French engine ready voice=${voice?.name ?: "default-fr"}")
                    } catch (error: Throwable) {
                        synchronized(initLock) { initError = error }
                        runCatching { ready?.shutdown() }
                    } finally {
                        synchronized(initLock) { initLatch = null }
                        latch.countDown()
                    }
                }
                ref.set(tts)
            }
        }

        if (!latch.await(10, TimeUnit.SECONDS)) {
            throw IllegalStateException("MINI_TTS_INIT_TIMEOUT")
        }
        engine?.let { return it }
        throw initError ?: IllegalStateException("MINI_TTS_INIT_FAILED")
    }

    fun warmup(context: Context) {
        ensureFrenchEngine(context.applicationContext)
    }

    fun synthesizePcm48kMono(context: Context, text: String): ShortArray = synchronized(synthLock) {
        val clean = text.trim()
        require(clean.isNotEmpty()) { "MINI_TTS_TEXT_EMPTY" }

        val tts = ensureFrenchEngine(context.applicationContext)
        val utteranceId = "mel-mini-" + UUID.randomUUID().toString()
        val done = CountDownLatch(1)
        val format = AtomicReference<Format?>(null)
        val failure = AtomicReference<Throwable?>(null)
        val chunks = Collections.synchronizedList(mutableListOf<ByteArray>())
        val temp = File.createTempFile("mel-mini-tts-", ".wav", context.cacheDir)

        Handler(Looper.getMainLooper()).post {
            try {
                tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(id: String?) = Unit

                    override fun onBeginSynthesis(
                        id: String?,
                        sampleRateInHz: Int,
                        audioFormat: Int,
                        channelCount: Int
                    ) {
                        if (id != utteranceId) return
                        format.set(Format(sampleRateInHz, audioFormat, channelCount))
                        Log.i(TAG, "begin rate=$sampleRateInHz format=$audioFormat channels=$channelCount")
                    }

                    override fun onAudioAvailable(id: String?, audio: ByteArray?) {
                        if (id == utteranceId && audio != null && audio.isNotEmpty()) {
                            chunks.add(audio.copyOf())
                        }
                    }

                    override fun onDone(id: String?) {
                        if (id == utteranceId) done.countDown()
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onError(id: String?) {
                        if (id == utteranceId) {
                            failure.set(IllegalStateException("MINI_TTS_SYNTH_FAILED"))
                            done.countDown()
                        }
                    }

                    override fun onError(id: String?, errorCode: Int) {
                        if (id == utteranceId) {
                            failure.set(IllegalStateException("MINI_TTS_SYNTH_ERROR_$errorCode"))
                            done.countDown()
                        }
                    }

                    override fun onStop(id: String?, interrupted: Boolean) {
                        if (id == utteranceId) {
                            failure.set(IllegalStateException("MINI_TTS_SYNTH_STOPPED"))
                            done.countDown()
                        }
                    }
                })

                val result = tts.synthesizeToFile(clean, Bundle(), temp, utteranceId)
                if (result == TextToSpeech.ERROR) {
                    failure.set(IllegalStateException("MINI_TTS_SYNTH_QUEUE_FAILED"))
                    done.countDown()
                }
            } catch (error: Throwable) {
                failure.set(error)
                done.countDown()
            }
        }

        try {
            if (!done.await((clean.length / 5L + 30L).coerceIn(30L, 180L), TimeUnit.SECONDS)) {
                Handler(Looper.getMainLooper()).post { runCatching { tts.stop() } }
                throw IllegalStateException("MINI_TTS_SYNTH_TIMEOUT")
            }
            failure.get()?.let { throw it }

            val fmt = format.get()
            val captured = synchronized(chunks) {
                if (chunks.isEmpty()) ByteArray(0)
                else ByteArrayOutputStream().use { out ->
                    chunks.forEach { out.write(it) }
                    out.toByteArray()
                }
            }

            val pcm = if (fmt != null && captured.isNotEmpty()) {
                decodeRawToMono16(captured, fmt)
            } else {
                decodeWavToMono16(temp.readBytes())
            }

            require(pcm.first.isNotEmpty()) { "MINI_TTS_AUDIO_EMPTY" }
            val output = resampleLinear(pcm.first, pcm.second, OUTPUT_RATE)
            require(output.isNotEmpty()) { "MINI_TTS_RESAMPLE_EMPTY" }
            Log.i(TAG, "synthesized samples=${output.size} sourceRate=${pcm.second}")
            output
        } finally {
            runCatching { temp.delete() }
        }
    }

    private fun decodeRawToMono16(bytes: ByteArray, fmt: Format): Pair<ShortArray, Int> {
        require(fmt.sampleRate in 8_000..96_000) { "MINI_TTS_RATE_${fmt.sampleRate}" }
        require(fmt.channels in 1..8) { "MINI_TTS_CHANNELS_${fmt.channels}" }

        val frames: Int
        val samples: ShortArray
        when (fmt.audioFormat) {
            AudioFormat.ENCODING_PCM_16BIT -> {
                val frameBytes = 2 * fmt.channels
                require(bytes.size >= frameBytes) { "MINI_TTS_PCM16_EMPTY" }
                frames = bytes.size / frameBytes
                samples = ShortArray(frames)
                var p = 0
                for (i in 0 until frames) {
                    var sum = 0
                    repeat(fmt.channels) {
                        val lo = bytes[p++].toInt() and 0xff
                        val hi = bytes[p++].toInt() and 0xff
                        sum += ((hi shl 8) or lo).toShort().toInt()
                    }
                    samples[i] = (sum / fmt.channels).coerceIn(-32768, 32767).toShort()
                }
            }
            AudioFormat.ENCODING_PCM_8BIT -> {
                val frameBytes = fmt.channels
                require(bytes.size >= frameBytes) { "MINI_TTS_PCM8_EMPTY" }
                frames = bytes.size / frameBytes
                samples = ShortArray(frames)
                var p = 0
                for (i in 0 until frames) {
                    var sum = 0
                    repeat(fmt.channels) {
                        sum += ((bytes[p++].toInt() and 0xff) - 128) shl 8
                    }
                    samples[i] = (sum / fmt.channels).coerceIn(-32768, 32767).toShort()
                }
            }
            AudioFormat.ENCODING_PCM_FLOAT -> {
                val frameBytes = 4 * fmt.channels
                require(bytes.size >= frameBytes) { "MINI_TTS_PCM_FLOAT_EMPTY" }
                frames = bytes.size / frameBytes
                samples = ShortArray(frames)
                val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
                for (i in 0 until frames) {
                    var sum = 0.0
                    repeat(fmt.channels) { sum += bb.float.coerceIn(-1f, 1f) }
                    val v = (sum / fmt.channels * 32767.0).roundToInt()
                    samples[i] = v.coerceIn(-32768, 32767).toShort()
                }
            }
            else -> throw IllegalStateException("MINI_TTS_FORMAT_${fmt.audioFormat}")
        }
        return samples to fmt.sampleRate
    }

    private fun decodeWavToMono16(wav: ByteArray): Pair<ShortArray, Int> {
        require(wav.size >= 44) { "MINI_TTS_WAV_SHORT" }
        require(String(wav, 0, 4, Charsets.US_ASCII) == "RIFF") { "MINI_TTS_WAV_RIFF" }
        require(String(wav, 8, 4, Charsets.US_ASCII) == "WAVE") { "MINI_TTS_WAV_WAVE" }

        var offset = 12
        var audioFormat = -1
        var channels = -1
        var rate = -1
        var bits = -1
        var dataOffset = -1
        var dataSize = -1

        while (offset + 8 <= wav.size) {
            val id = String(wav, offset, 4, Charsets.US_ASCII)
            val size = le32(wav, offset + 4)
            val body = offset + 8
            require(size >= 0 && body + size <= wav.size) { "MINI_TTS_WAV_CHUNK" }
            if (id == "fmt " && size >= 16) {
                audioFormat = le16(wav, body)
                channels = le16(wav, body + 2)
                rate = le32(wav, body + 4)
                bits = le16(wav, body + 14)
            } else if (id == "data") {
                dataOffset = body
                dataSize = size
                break
            }
            offset = body + size + (size and 1)
        }

        require(channels in 1..8 && rate in 8_000..96_000 && dataOffset >= 0 && dataSize > 0) {
            "MINI_TTS_WAV_META"
        }

        val raw = wav.copyOfRange(dataOffset, dataOffset + dataSize)
        val fmt = when {
            audioFormat == 1 && bits == 16 -> AudioFormat.ENCODING_PCM_16BIT
            audioFormat == 1 && bits == 8 -> AudioFormat.ENCODING_PCM_8BIT
            audioFormat == 3 && bits == 32 -> AudioFormat.ENCODING_PCM_FLOAT
            else -> throw IllegalStateException("MINI_TTS_WAV_FORMAT_${audioFormat}_$bits")
        }
        return decodeRawToMono16(raw, Format(rate, fmt, channels))
    }

    private fun resampleLinear(input: ShortArray, inRate: Int, outRate: Int): ShortArray {
        if (input.isEmpty() || inRate == outRate) return input.copyOf()
        val outCount = ((input.size.toLong() * outRate + inRate / 2L) / inRate)
            .coerceAtLeast(1L)
            .coerceAtMost(Int.MAX_VALUE.toLong())
            .toInt()
        val out = ShortArray(outCount)
        val ratio = inRate.toDouble() / outRate.toDouble()
        for (i in 0 until outCount) {
            val pos = i * ratio
            val left = floor(pos).toInt().coerceIn(0, input.lastIndex)
            val right = (left + 1).coerceAtMost(input.lastIndex)
            val frac = pos - left
            val v = input[left] * (1.0 - frac) + input[right] * frac
            out[i] = v.roundToInt().coerceIn(-32768, 32767).toShort()
        }
        return out
    }

    private fun le16(data: ByteArray, offset: Int): Int =
        (data[offset].toInt() and 0xff) or ((data[offset + 1].toInt() and 0xff) shl 8)

    private fun le32(data: ByteArray, offset: Int): Int =
        (data[offset].toInt() and 0xff) or
            ((data[offset + 1].toInt() and 0xff) shl 8) or
            ((data[offset + 2].toInt() and 0xff) shl 16) or
            ((data[offset + 3].toInt() and 0xff) shl 24)
}
