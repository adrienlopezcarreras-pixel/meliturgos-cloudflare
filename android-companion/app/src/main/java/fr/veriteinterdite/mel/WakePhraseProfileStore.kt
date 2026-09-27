package fr.veriteinterdite.mel

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

class WakePhraseProfileStore(context: Context) {
    private val prefs = context.getSharedPreferences(PRIMARY_PREFS, Context.MODE_PRIVATE)
    private val protectedPrefs = context.createDeviceProtectedStorageContext()
        .getSharedPreferences(PROTECTED_PREFS, Context.MODE_PRIVATE)

    fun load(): JSONObject {
        val primary = parseProfile(prefs.getString(KEY_PROFILE, null))
        if (isValidEnrolledProfile(primary)) {
            val raw = primary!!.toString()
            if (protectedPrefs.getString(KEY_PROFILE, null) != raw) {
                protectedPrefs.edit().putString(KEY_PROFILE, raw).commit()
            }
            return primary
        }

        val backup = parseProfile(protectedPrefs.getString(KEY_PROFILE, null))
        if (isValidEnrolledProfile(backup)) {
            // Heal the normal app store automatically from the protected copy.
            prefs.edit().putString(KEY_PROFILE, backup.toString()).remove(KEY_SAMPLES).commit()
            return backup!!
        }

        if (primary != null) return primary
        return emptyProfile()
    }

    fun sampleCount(): Int {
        val profile = load()
        val savedCount = profile.optInt("sample_count", 0)
        if (profile.optBoolean("enrolled", false)) return savedCount.coerceAtLeast(WakePhraseTrainer.REQUIRED_SAMPLES)
        return maxOf(savedCount, sampleCountFromSamples())
    }

    fun isEnrolled(): Boolean = isValidEnrolledProfile(load())

    fun templateFeatures(): FloatArray? {
        val profile = load()
        if (!isValidEnrolledProfile(profile)) return null
        val array = profile.optJSONArray("features") ?: return null
        return FloatArray(array.length()) { i -> array.optDouble(i, 0.0).toFloat() }
    }

    fun threshold(): Float = load().optDouble("threshold", 0.78).toFloat().coerceIn(0.66f, 0.86f)

    @Synchronized
    fun addSample(vector: FloatArray): EnrollmentState {
        require(vector.isNotEmpty()) { "WAKE_TEMPLATE_EMPTY" }
        if (isEnrolled()) {
            return EnrollmentState(sampleCount(), true, threshold())
        }

        val samples = loadSamples().toMutableList()
        samples += vector
        if (samples.size >= WakePhraseTrainer.REQUIRED_SAMPLES) {
            val (template, threshold) = WakePhraseTrainer.template(samples.take(WakePhraseTrainer.REQUIRED_SAMPLES))
            saveTemplate(template, WakePhraseTrainer.REQUIRED_SAMPLES, threshold)
            return EnrollmentState(WakePhraseTrainer.REQUIRED_SAMPLES, true, threshold)
        }

        val profile = JSONObject()
            .put("version", 1)
            .put("enrolled", false)
            .put("phrase", "ok mel")
            .put("sample_count", samples.size)

        val committed = prefs.edit()
            .putString(KEY_SAMPLES, encodeSamples(samples).toString())
            .putString(KEY_PROFILE, profile.toString())
            .commit()
        check(committed) { "WAKE_STORAGE_FAILED" }
        return EnrollmentState(samples.size, false, null)
    }

    fun resetRequested(): Boolean =
        prefs.getBoolean(KEY_RESET_REQUESTED, false) || protectedPrefs.getBoolean(KEY_RESET_REQUESTED, false)

    @Synchronized
    fun resetEnrollment() {
        val a = prefs.edit()
            .remove(KEY_PROFILE)
            .remove(KEY_SAMPLES)
            .putBoolean(KEY_RESET_REQUESTED, true)
            .commit()
        val b = protectedPrefs.edit()
            .remove(KEY_PROFILE)
            .putBoolean(KEY_RESET_REQUESTED, true)
            .commit()
        check(a && b) { "WAKE_STORAGE_FAILED" }
    }

    @Synchronized
    fun saveTemplate(vector: FloatArray, sampleCount: Int, threshold: Float) {
        require(vector.size == FEATURE_COUNT) { "WAKE_TEMPLATE_SIZE" }
        val json = buildProfile(vector, sampleCount, threshold)
        persistFinalProfile(json)
    }

    @Synchronized
    fun importProfile(profile: JSONObject): Boolean {
        if (!isValidEnrolledProfile(profile)) return false
        val features = profile.optJSONArray("features") ?: return false
        val vector = FloatArray(features.length()) { i -> features.optDouble(i, 0.0).toFloat() }
        val count = profile.optInt("sample_count", WakePhraseTrainer.REQUIRED_SAMPLES)
            .coerceAtLeast(WakePhraseTrainer.REQUIRED_SAMPLES)
        val threshold = profile.optDouble("threshold", 0.78).toFloat().coerceIn(0.66f, 0.86f)
        persistFinalProfile(buildProfile(vector, count, threshold))
        return true
    }

    private fun persistFinalProfile(json: JSONObject) {
        val raw = json.toString()
        val primaryOk = prefs.edit()
            .putString(KEY_PROFILE, raw)
            .remove(KEY_SAMPLES)
            .putBoolean(KEY_RESET_REQUESTED, false)
            .commit()
        val protectedOk = protectedPrefs.edit()
            .putString(KEY_PROFILE, raw)
            .putBoolean(KEY_RESET_REQUESTED, false)
            .commit()
        check(primaryOk && protectedOk) { "WAKE_STORAGE_FAILED" }
    }

    private fun buildProfile(vector: FloatArray, sampleCount: Int, threshold: Float): JSONObject {
        val values = JSONArray()
        vector.forEach { values.put(it.toDouble()) }
        return JSONObject()
            .put("version", 2)
            .put("enrolled", true)
            .put("phrase", "ok mel")
            .put("sample_count", sampleCount.coerceAtLeast(WakePhraseTrainer.REQUIRED_SAMPLES))
            .put("threshold", threshold.coerceIn(0.66f, 0.86f).toDouble())
            .put("features", values)
    }

    private fun isValidEnrolledProfile(profile: JSONObject?): Boolean {
        if (profile == null || !profile.optBoolean("enrolled", false)) return false
        val features = profile.optJSONArray("features") ?: return false
        if (features.length() != FEATURE_COUNT) return false
        for (i in 0 until features.length()) if (!features.opt(i).let { it is Number }) return false
        return true
    }

    private fun parseProfile(raw: String?): JSONObject? {
        if (raw.isNullOrBlank()) return null
        return runCatching { JSONObject(raw) }.getOrNull()
    }

    private fun loadSamples(): List<FloatArray> {
        val raw = prefs.getString(KEY_SAMPLES, null) ?: return emptyList()
        val root = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        return buildList {
            for (i in 0 until root.length()) {
                val row = root.optJSONArray(i) ?: continue
                val vector = FloatArray(row.length()) { j -> row.optDouble(j, 0.0).toFloat() }
                if (vector.isNotEmpty()) add(vector)
            }
        }
    }

    private fun encodeSamples(samples: List<FloatArray>): JSONArray {
        val root = JSONArray()
        samples.forEach { sample ->
            val row = JSONArray()
            sample.forEach { row.put(it.toDouble()) }
            root.put(row)
        }
        return root
    }

    private fun emptyProfile(): JSONObject = JSONObject()
        .put("version", 2)
        .put("enrolled", false)
        .put("phrase", "ok mel")
        .put("sample_count", sampleCountFromSamples())

    private fun sampleCountFromSamples(): Int {
        val raw = prefs.getString(KEY_SAMPLES, null) ?: return 0
        return runCatching { JSONArray(raw).length() }.getOrDefault(0)
    }

    data class EnrollmentState(val sampleCount: Int, val enrolled: Boolean, val threshold: Float?)

    companion object {
        private const val PRIMARY_PREFS = "mel_wake_phrase_profile"
        private const val PROTECTED_PREFS = "mel_wake_phrase_profile_protected"
        private const val KEY_PROFILE = "profile_json"
        private const val KEY_SAMPLES = "sample_vectors_json"
        private const val KEY_RESET_REQUESTED = "reset_requested"
        private const val FEATURE_COUNT = 48
    }
}
