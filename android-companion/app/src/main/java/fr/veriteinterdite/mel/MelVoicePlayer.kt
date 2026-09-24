package fr.veriteinterdite.mel

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Plays MEL's canonical MINI-compatible TTS stream:
 * PCM signed 16-bit little-endian, 48 kHz, mono.
 */
object MelVoicePlayer {
    private const val SAMPLE_RATE = 48_000
    private val lock = Any()
    private var activeTrack: AudioTrack? = null

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

    fun playSystemFrench(context: Context, text: String): Long {
        require(text.isNotBlank()) { "TTS_TEXT_EMPTY" }
        val startedAt = System.currentTimeMillis()
        val initLatch = CountDownLatch(1)
        var initStatus = TextToSpeech.ERROR
        val tts = TextToSpeech(context.applicationContext) { status ->
            initStatus = status
            initLatch.countDown()
        }

        if (!initLatch.await(4, TimeUnit.SECONDS) || initStatus != TextToSpeech.SUCCESS) {
            runCatching { tts.shutdown() }
            throw IllegalStateException("ANDROID_TTS_INIT_FAILED")
        }

        val languages = listOf(Locale.FRANCE, Locale.FRENCH, Locale.getDefault())
        var languageReady = false
        for (locale in languages.distinct()) {
            val result = tts.setLanguage(locale)
            if (result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED) {
                languageReady = true
                break
            }
        }
        if (!languageReady) {
            tts.shutdown()
            throw IllegalStateException("ANDROID_TTS_FRENCH_UNAVAILABLE")
        }

        tts.setSpeechRate(1.08f)
        tts.setPitch(1.0f)
        val done = CountDownLatch(1)
        var failed = false
        val utteranceId = "mel-" + UUID.randomUUID().toString()
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) = Unit
            override fun onDone(id: String?) { done.countDown() }
            @Deprecated("Deprecated in Java")
            override fun onError(id: String?) {
                failed = true
                done.countDown()
            }
            override fun onError(id: String?, errorCode: Int) {
                failed = true
                done.countDown()
            }
        })

        val speakResult = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
        if (speakResult == TextToSpeech.ERROR) {
            tts.shutdown()
            throw IllegalStateException("ANDROID_TTS_SPEAK_FAILED")
        }

        val timeoutSeconds = (text.length / 12L + 8L).coerceIn(10L, 45L)
        val completed = done.await(timeoutSeconds, TimeUnit.SECONDS)
        runCatching { tts.stop() }
        tts.shutdown()
        if (!completed) throw IllegalStateException("ANDROID_TTS_TIMEOUT")
        if (failed) throw IllegalStateException("ANDROID_TTS_PLAYBACK_FAILED")
        return (System.currentTimeMillis() - startedAt).coerceAtLeast(1L)
    }

    fun stop() {
        synchronized(lock) {
            stopLocked()
        }
    }

    private fun stopLocked() {
        val track = activeTrack ?: return
        activeTrack = null
        runCatching { track.stop() }
        track.release()
    }
}
