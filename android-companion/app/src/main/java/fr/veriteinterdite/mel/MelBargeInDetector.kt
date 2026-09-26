package fr.veriteinterdite.mel

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.sqrt

object MelBargeInDetector {
    private const val SAMPLE_RATE = 16_000
    private const val FRAME_SAMPLES = 320 // 20 ms

    fun start(
        shouldContinue: () -> Boolean,
        onSpeech: () -> Unit
    ): Thread = thread(name = "mel-barge-in", isDaemon = true) {
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuffer <= 0) return@thread

        val recorder = runCatching {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                max(minBuffer * 2, FRAME_SAMPLES * 8)
            )
        }.getOrNull() ?: return@thread
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            return@thread
        }

        val aec = if (AcousticEchoCanceler.isAvailable()) {
            runCatching { AcousticEchoCanceler.create(recorder.audioSessionId) }.getOrNull()?.also { it.enabled = true }
        } else null
        val ns = if (NoiseSuppressor.isAvailable()) {
            runCatching { NoiseSuppressor.create(recorder.audioSessionId) }.getOrNull()?.also { it.enabled = true }
        } else null

        val frame = ShortArray(FRAME_SAMPLES)
        var noiseFloor = 220.0
        var voicedFrames = 0
        var frames = 0
        try {
            recorder.startRecording()
            while (shouldContinue() && !Thread.currentThread().isInterrupted) {
                val read = recorder.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING)
                if (read <= 0) continue
                var energy = 0.0
                for (i in 0 until read) {
                    val v = frame[i].toDouble()
                    energy += v * v
                }
                val rms = sqrt(energy / read.coerceAtLeast(1))
                frames++

                // Let echo cancellation settle before accepting interruption.
                if (frames < 25) {
                    noiseFloor = noiseFloor * .92 + rms * .08
                    continue
                }

                val trigger = max(650.0, noiseFloor * 2.35)
                if (rms >= trigger) {
                    voicedFrames++
                    if (voicedFrames >= 7) { // ~140 ms sustained speech
                        onSpeech()
                        break
                    }
                } else {
                    voicedFrames = 0
                    noiseFloor = noiseFloor * .97 + rms * .03
                }
            }
        } catch (_: Throwable) {
            // Best-effort feature: never break the main conversation if unavailable.
        } finally {
            runCatching { recorder.stop() }
            runCatching { aec?.release() }
            runCatching { ns?.release() }
            recorder.release()
        }
    }
}
