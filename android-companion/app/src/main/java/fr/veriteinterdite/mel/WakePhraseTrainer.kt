package fr.veriteinterdite.mel

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlin.concurrent.thread
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.sqrt

object WakePhraseTrainer {
    const val REQUIRED_SAMPLES = 6
    private const val SAMPLE_RATE = 16_000
    private const val CAPTURE_MS = 1_900
    private const val SEGMENTS = 6
    private val frequencies = doubleArrayOf(300.0, 500.0, 750.0, 1000.0, 1400.0, 2000.0, 2800.0, 3800.0)

    fun captureAsync(onResult: (Result<FloatArray>) -> Unit) {
        thread(name = "mel-wake-enroll", isDaemon = true) {
            onResult(runCatching { capture() })
        }
    }

    private fun capture(): FloatArray {
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        require(minBuffer > 0) { "MIC_BUFFER_UNAVAILABLE" }
        val targetSamples = SAMPLE_RATE * CAPTURE_MS / 1000
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            max(minBuffer * 2, 4096)
        )
        require(recorder.state == AudioRecord.STATE_INITIALIZED) { "MIC_INIT_FAILED" }
        val samples = ShortArray(targetSamples)
        var offset = 0
        try {
            recorder.startRecording()
            while (offset < samples.size) {
                val read = recorder.read(samples, offset, samples.size - offset, AudioRecord.READ_BLOCKING)
                if (read <= 0) error("MIC_READ_$read")
                offset += read
            }
        } finally {
            runCatching { recorder.stop() }
            recorder.release()
        }
        return extract(samples)
    }

    fun extract(input: ShortArray): FloatArray {
        require(input.size >= SAMPLE_RATE / 2) { "WAKE_SAMPLE_TOO_SHORT" }
        val trimmed = trimSilence(input)
        require(trimmed.size >= SAMPLE_RATE / 3) { "WAKE_PHRASE_NOT_HEARD" }
        val overallRms = rms(trimmed, 0, trimmed.size)
        require(overallRms >= 180.0) { "WAKE_PHRASE_TOO_QUIET" }

        val out = FloatArray(SEGMENTS * frequencies.size)
        for (segment in 0 until SEGMENTS) {
            val start = segment * trimmed.size / SEGMENTS
            val end = ((segment + 1) * trimmed.size / SEGMENTS).coerceAtMost(trimmed.size)
            for (f in frequencies.indices) {
                val energy = goertzel(trimmed, start, end, frequencies[f])
                out[segment * frequencies.size + f] = ln(1.0 + energy).toFloat()
            }
        }
        normalize(out)
        return out
    }

    fun listenForWake(
        template: FloatArray,
        threshold: Float,
        shouldContinue: () -> Boolean,
        onScore: (Float) -> Unit = {},
        onMatch: (Float) -> Unit
    ) {
        require(template.isNotEmpty()) { "WAKE_TEMPLATE_EMPTY" }
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        require(minBuffer > 0) { "MIC_BUFFER_UNAVAILABLE" }
        val hopSamples = SAMPLE_RATE / 2
        val windowSamples = SAMPLE_RATE * CAPTURE_MS / 1000
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            max(minBuffer * 2, hopSamples * 2)
        )
        require(recorder.state == AudioRecord.STATE_INITIALIZED) { "MIC_INIT_FAILED" }
        val ring = ShortArray(windowSamples)
        val hop = ShortArray(hopSamples)
        var filled = 0
        var consecutive = 0
        try {
            recorder.startRecording()
            while (shouldContinue()) {
                var offset = 0
                while (offset < hop.size && shouldContinue()) {
                    val read = recorder.read(hop, offset, hop.size - offset, AudioRecord.READ_BLOCKING)
                    if (read <= 0) error("MIC_READ_$read")
                    offset += read
                }
                if (!shouldContinue()) break

                if (filled < ring.size) {
                    val copy = minOf(hop.size, ring.size - filled)
                    System.arraycopy(hop, 0, ring, filled, copy)
                    filled += copy
                    if (filled < ring.size) continue
                } else {
                    System.arraycopy(ring, hop.size, ring, 0, ring.size - hop.size)
                    System.arraycopy(hop, 0, ring, ring.size - hop.size, hop.size)
                }

                val features = runCatching { extract(ring) }.getOrNull() ?: run {
                    consecutive = 0
                    continue
                }
                val score = cosine(features, template)
                onScore(score)
                if (score >= threshold) {
                    consecutive++
                    if (consecutive >= 2) {
                        onMatch(score)
                        break
                    }
                } else {
                    consecutive = 0
                }
            }
        } finally {
            runCatching { recorder.stop() }
            recorder.release()
        }
    }

    fun template(samples: List<FloatArray>): Pair<FloatArray, Float> {
        require(samples.size >= REQUIRED_SAMPLES) { "WAKE_NEEDS_$REQUIRED_SAMPLES" }
        val size = samples.first().size
        require(samples.all { it.size == size }) { "WAKE_FEATURE_SIZE" }
        val mean = FloatArray(size)
        samples.forEach { sample ->
            for (i in 0 until size) mean[i] += sample[i]
        }
        for (i in 0 until size) mean[i] /= samples.size.toFloat()
        normalize(mean)
        val similarities = samples.map { cosine(it, mean) }
        val minSimilarity = similarities.minOrNull() ?: 0.75f
        val threshold = (minSimilarity - 0.08f).coerceIn(0.68f, 0.90f)
        return mean to threshold
    }

    fun cosine(a: FloatArray, b: FloatArray): Float {
        if (a.size != b.size || a.isEmpty()) return 0f
        var dot = 0.0
        var aa = 0.0
        var bb = 0.0
        for (i in a.indices) {
            dot += a[i] * b[i]
            aa += a[i] * a[i]
            bb += b[i] * b[i]
        }
        if (aa <= 1e-12 || bb <= 1e-12) return 0f
        return (dot / sqrt(aa * bb)).toFloat()
    }

    private fun trimSilence(samples: ShortArray): ShortArray {
        val frame = SAMPLE_RATE / 50 // 20 ms
        var peak = 0.0
        var i = 0
        while (i + frame <= samples.size) {
            peak = max(peak, rms(samples, i, i + frame))
            i += frame
        }
        val threshold = max(160.0, peak * 0.16)
        var first = 0
        while (first + frame <= samples.size && rms(samples, first, first + frame) < threshold) first += frame
        var last = samples.size
        while (last - frame >= first && rms(samples, last - frame, last) < threshold) last -= frame
        val pad = SAMPLE_RATE / 20 // 50 ms
        first = (first - pad).coerceAtLeast(0)
        last = (last + pad).coerceAtMost(samples.size)
        return if (last > first) samples.copyOfRange(first, last) else ShortArray(0)
    }

    private fun rms(samples: ShortArray, start: Int, end: Int): Double {
        if (end <= start) return 0.0
        var sum = 0.0
        for (i in start until end) {
            val v = samples[i].toDouble()
            sum += v * v
        }
        return sqrt(sum / (end - start))
    }

    private fun goertzel(samples: ShortArray, start: Int, end: Int, frequency: Double): Double {
        if (end <= start) return 0.0
        val omega = 2.0 * PI * frequency / SAMPLE_RATE
        val coeff = 2.0 * cos(omega)
        var s0: Double
        var s1 = 0.0
        var s2 = 0.0
        for (i in start until end) {
            val x = samples[i].toDouble() / 32768.0
            s0 = x + coeff * s1 - s2
            s2 = s1
            s1 = s0
        }
        val power = s1 * s1 + s2 * s2 - coeff * s1 * s2
        return max(0.0, power / (end - start).toDouble())
    }

    private fun normalize(values: FloatArray) {
        var norm = 0.0
        values.forEach { norm += it * it }
        norm = sqrt(norm)
        if (norm <= 1e-9) return
        for (i in values.indices) values[i] = (values[i] / norm).toFloat()
    }
}
