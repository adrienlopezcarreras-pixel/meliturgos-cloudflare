package fr.veriteinterdite.mel

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaPlayer
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.io.File
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Plays MEL's canonical MINI-compatible TTS stream:
 * PCM signed 16-bit little-endian, 48 kHz, mono.
 */
class MelPlaybackInterruptedException : Exception("MEL_PLAYBACK_INTERRUPTED")

object MelVoicePlayer {
    private const val SAMPLE_RATE = 48_000
    private val lock = Any()
    private val ttsLock = Any()
    private var activeTrack: AudioTrack? = null
    private var activePlayer: MediaPlayer? = null
    private var activeTts: TextToSpeech? = null
    @Volatile private var persistentTts: TextToSpeech? = null
    @Volatile private var ttsInitLatch: CountDownLatch? = null
    @Volatile private var ttsInitError: Throwable? = null
    @Volatile private var playbackGeneration: Long = 0L

    fun initialize(context: Context) {
        Thread {
            runCatching { ensureSystemFrench(context.applicationContext) }
        }.apply { name = "mel-tts-init"; isDaemon = true }.start()
    }

    private fun ensureSystemFrench(context: Context): TextToSpeech {
        persistentTts?.let { return it }
        val latch: CountDownLatch
        var startInit = false
        synchronized(ttsLock) {
            persistentTts?.let { return it }
            val existing = ttsInitLatch
            if (existing != null) {
                latch = existing
            } else {
                latch = CountDownLatch(1)
                ttsInitLatch = latch
                ttsInitError = null
                startInit = true
            }
        }

        if (startInit) {
            Handler(Looper.getMainLooper()).post {
                val ref = AtomicReference<TextToSpeech?>(null)
                val engine = TextToSpeech(context.applicationContext) { status ->
                    val tts = ref.get()
                    try {
                        if (status != TextToSpeech.SUCCESS || tts == null) {
                            throw IllegalStateException("ANDROID_TTS_INIT_FAILED")
                        }
                        val languageResult = tts.setLanguage(Locale.FRANCE)
                        if (languageResult == TextToSpeech.LANG_MISSING_DATA ||
                            languageResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                            throw IllegalStateException("ANDROID_TTS_FRENCH_UNAVAILABLE")
                        }
                        val frenchVoice = tts.voices
                            ?.filter { it.locale?.language.equals("fr", ignoreCase = true) }
                            ?.minByOrNull { voice ->
                                val locale = voice.locale
                                when {
                                    locale?.country.equals("FR", ignoreCase = true) && !voice.isNetworkConnectionRequired -> 0
                                    locale?.country.equals("FR", ignoreCase = true) -> 1
                                    !voice.isNetworkConnectionRequired -> 2
                                    else -> 3
                                }
                            }
                        if (frenchVoice != null) tts.voice = frenchVoice
                        tts.setSpeechRate(1.02f)
                        tts.setPitch(1.0f)
                        tts.setAudioAttributes(
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .build()
                        )
                        synchronized(ttsLock) {
                            persistentTts = tts
                            ttsInitError = null
                        }
                    } catch (error: Throwable) {
                        synchronized(ttsLock) { ttsInitError = error }
                        runCatching { tts?.shutdown() }
                    } finally {
                        synchronized(ttsLock) { ttsInitLatch = null }
                        latch.countDown()
                    }
                }
                ref.set(engine)
            }
        }

        if (!latch.await(8, TimeUnit.SECONDS)) {
            throw IllegalStateException("ANDROID_TTS_INIT_TIMEOUT")
        }
        persistentTts?.let { return it }
        throw ttsInitError ?: IllegalStateException("ANDROID_TTS_INIT_FAILED")
    }

    fun playPcm48kMono(bytes: ByteArray): Long {
        require(bytes.isNotEmpty()) { "TTS_AUDIO_EMPTY" }

        val minBuffer = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        require(minBuffer > 0) { "AUDIO_OUTPUT_UNAVAILABLE" }

        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(maxOf(bytes.size, minBuffer))
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()

        require(track.state == AudioTrack.STATE_INITIALIZED) {
            track.release()
            "AUDIO_TRACK_INIT_FAILED"
        }

        val written = track.write(bytes, 0, bytes.size)
        if (written != bytes.size) {
            track.release()
            throw IllegalStateException("AUDIO_WRITE_FAILED")
        }

        synchronized(lock) {
            stopLocked()
            activeTrack = track
            track.setVolume(1f)
            track.play()
        }

        val durationMs = ((bytes.size / 2L) * 1000L / SAMPLE_RATE).coerceAtLeast(180L)
        try {
            Thread.sleep(durationMs + 180L)
        } finally {
            synchronized(lock) {
                if (activeTrack === track) {
                    stopLocked()
                } else {
                    runCatching { track.stop() }
                    track.release()
                }
            }
        }
        return durationMs
    }

    fun playMp3(context: Context, bytes: ByteArray): Long {
        require(bytes.isNotEmpty()) { "TTS_AUDIO_EMPTY" }
        val startedAt = System.currentTimeMillis()
        val file = File.createTempFile("mel-voice-", ".mp3", context.cacheDir)
        file.writeBytes(bytes)
        val done = CountDownLatch(1)
        var failed = false

        val player = MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            setDataSource(file.absolutePath)
            setVolume(1f, 1f)
            setOnCompletionListener { done.countDown() }
            setOnErrorListener { _, _, _ ->
                failed = true
                done.countDown()
                true
            }
            prepare()
        }

        val myGeneration = synchronized(lock) {
            stopLocked()
            playbackGeneration += 1L
            activePlayer = player
            player.start()
            playbackGeneration
        }

        val timeoutSeconds = ((player.duration.coerceAtLeast(1) / 1000L) + 15L).coerceIn(15L, 600L)
        val deadline = System.currentTimeMillis() + timeoutSeconds * 1000L
        var completed = false
        while (System.currentTimeMillis() < deadline) {
            if (playbackGeneration != myGeneration) throw MelPlaybackInterruptedException()
            if (done.await(120L, TimeUnit.MILLISECONDS)) {
                completed = true
                break
            }
        }
        synchronized(lock) {
            if (activePlayer === player) {
                activePlayer = null
                runCatching { player.stop() }
                player.release()
            }
        }
        file.delete()
        if (playbackGeneration != myGeneration) throw MelPlaybackInterruptedException()
        if (!completed) throw IllegalStateException("MP3_PLAYBACK_TIMEOUT")
        if (failed) throw IllegalStateException("MP3_PLAYBACK_FAILED")
        return (System.currentTimeMillis() - startedAt).coerceAtLeast(1L)
    }

    fun playSystemFrench(context: Context, text: String): Long {
        require(text.isNotBlank()) { "TTS_TEXT_EMPTY" }
        val startedAt = System.currentTimeMillis()
        val tts = ensureSystemFrench(context.applicationContext)
        val main = Handler(Looper.getMainLooper())
        val maxChunk = (TextToSpeech.getMaxSpeechInputLength() - 128).coerceIn(800, 2800)
        val chunks = splitForTts(text, maxChunk)

        val myGeneration = synchronized(lock) {
            stopLocked()
            playbackGeneration += 1L
            activeTts = tts
            playbackGeneration
        }

        try {
            for (chunk in chunks) {
                if (playbackGeneration != myGeneration) throw MelPlaybackInterruptedException()
                speakSystemFrenchChunk(tts, main, chunk, myGeneration)
            }
        } finally {
            synchronized(lock) {
                if (activeTts === tts) activeTts = null
            }
        }

        if (playbackGeneration != myGeneration) throw MelPlaybackInterruptedException()
        return (System.currentTimeMillis() - startedAt).coerceAtLeast(1L)
    }

    private fun speakSystemFrenchChunk(
        tts: TextToSpeech,
        main: Handler,
        text: String,
        generation: Long
    ) {
        val ready = CountDownLatch(1)
        val done = CountDownLatch(1)
        val startError = AtomicReference<Throwable?>(null)
        val playbackError = AtomicReference<Throwable?>(null)
        val utteranceId = "mel-fr-" + UUID.randomUUID().toString()

        main.post {
            try {
                tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(id: String?) = Unit
                    override fun onDone(id: String?) {
                        if (id == utteranceId) done.countDown()
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onError(id: String?) {
                        if (id == utteranceId) {
                            playbackError.set(IllegalStateException("ANDROID_TTS_PLAYBACK_FAILED"))
                            done.countDown()
                        }
                    }
                    override fun onError(id: String?, errorCode: Int) {
                        if (id == utteranceId) {
                            playbackError.set(IllegalStateException("ANDROID_TTS_ERROR_$errorCode"))
                            done.countDown()
                        }
                    }
                })
                val params = Bundle().apply {
                    putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
                }
                val result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
                if (result == TextToSpeech.ERROR) throw IllegalStateException("ANDROID_TTS_SPEAK_FAILED")
            } catch (error: Throwable) {
                startError.set(error)
            } finally {
                ready.countDown()
            }
        }

        if (!ready.await(4, TimeUnit.SECONDS)) throw IllegalStateException("ANDROID_TTS_START_TIMEOUT")
        startError.get()?.let { throw it }

        val timeoutSeconds = (text.length / 7L + 30L).coerceIn(20L, 240L)
        val deadline = System.currentTimeMillis() + timeoutSeconds * 1000L
        var completed = false
        while (System.currentTimeMillis() < deadline) {
            if (playbackGeneration != generation) throw MelPlaybackInterruptedException()
            if (done.await(120L, TimeUnit.MILLISECONDS)) {
                completed = true
                break
            }
        }
        if (playbackGeneration != generation) throw MelPlaybackInterruptedException()
        if (!completed) {
            main.post { runCatching { tts.stop() } }
            throw IllegalStateException("ANDROID_TTS_TIMEOUT")
        }
        playbackError.get()?.let { throw it }
    }

    private fun splitForTts(text: String, maxLength: Int): List<String> {
        var remaining = text.trim()
        if (remaining.length <= maxLength) return listOf(remaining)
        val result = mutableListOf<String>()
        while (remaining.length > maxLength) {
            var cut = maxLength
            for (index in maxLength downTo maxLength / 2) {
                if (remaining[index - 1] == '.' || remaining[index - 1] == '!' ||
                    remaining[index - 1] == '?' || remaining[index - 1] == ';' ||
                    remaining[index - 1].code == 10
                ) {
                    cut = index
                    break
                }
            }
            if (cut == maxLength) {
                val space = remaining.lastIndexOf(' ', maxLength)
                if (space >= maxLength / 2) cut = space + 1
            }
            result += remaining.substring(0, cut).trim()
            remaining = remaining.substring(cut).trimStart()
        }
        if (remaining.isNotBlank()) result += remaining
        return result
    }

    fun stop() {
        synchronized(lock) {
            playbackGeneration += 1L
            stopLocked()
        }
    }

    private fun stopLocked() {
        activeTrack?.let { track ->
            activeTrack = null
            runCatching { track.stop() }
            track.release()
        }
        activePlayer?.let { player ->
            activePlayer = null
            runCatching { player.stop() }
            player.release()
        }
        activeTts?.let { tts ->
            activeTts = null
            Handler(Looper.getMainLooper()).post {
                runCatching { tts.stop() }
            }
        }
    }
}
