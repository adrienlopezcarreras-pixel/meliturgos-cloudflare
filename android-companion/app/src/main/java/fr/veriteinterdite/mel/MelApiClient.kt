package fr.veriteinterdite.mel

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

class MelApiException(
    val code: String,
    val status: Int,
    val detail: String = ""
) : Exception(listOf(code, detail).filter { it.isNotBlank() }.joinToString(" · "))

class MelApiClient(
    private val baseUrl: String,
    private val deviceId: String,
    private val tokenVault: TokenVault
) {
    companion object {
        const val PROTOCOL_VERSION = "1.0"
        const val APP_VERSION = "0.6.39-ble-voice-queue-fix"
    }

    init {
        require(baseUrl.startsWith("https://")) { "HTTPS_REQUIRED" }
        require(deviceId.isNotBlank()) { "DEVICE_ID_REQUIRED" }
    }

    private fun connection(path: String, method: String, authenticated: Boolean = true): HttpURLConnection {
        val connection = URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 15_000
        connection.readTimeout = 90_000
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("X-MEL-Android-Version", APP_VERSION)
        if (authenticated) {
            val token = tokenVault.load() ?: throw MelApiException("DEVICE_NOT_PAIRED", 401)
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("X-MEL-Device-ID", deviceId)
        }
        return connection
    }

    private fun jsonRequest(
        path: String,
        method: String,
        payload: JSONObject,
        authenticated: Boolean = true
    ): JSONObject {
        val connection = connection(path, method, authenticated)
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        return readJson(connection)
    }

    private fun readJson(connection: HttpURLConnection): JSONObject {
        try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = if (body.isBlank()) JSONObject() else runCatching { JSONObject(body) }
                .getOrElse { throw MelApiException("INVALID_SERVER_RESPONSE", status, body.take(180)) }
            if (status !in 200..299) {
                throw MelApiException(
                    code = json.optString("code", json.optString("error", "HTTP_$status")),
                    status = status,
                    detail = json.optString("detail")
                )
            }
            return json
        } finally {
            connection.disconnect()
        }
    }

    private fun readBytes(connection: HttpURLConnection): ByteArray {
        try {
            val status = connection.responseCode
            if (status !in 200..299) {
                val body = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                val json = runCatching { JSONObject(body) }.getOrNull()
                throw MelApiException(
                    code = json?.let { it.optString("code", it.optString("error", "HTTP_$status")) }
                        ?: "HTTP_$status",
                    status = status,
                    detail = json?.optString("detail").orEmpty()
                )
            }
            return connection.inputStream.use { it.readBytes() }
        } finally {
            connection.disconnect()
        }
    }

    /**
     * Owner credentials are used exactly once to request a one-use pairing code.
     * If username is blank, the server's supported owner Bearer-password fallback
     * is used. The password is never written to local storage.
     */
    fun pairWithOwnerCredentials(
        username: String,
        password: String,
        name: String = "MEL Android",
        appVersion: String = APP_VERSION
    ): JSONObject {
        require(password.isNotBlank()) { "OWNER_PASSWORD_REQUIRED" }
        val connection = connection("/api/android/v1/pair-code", "POST", authenticated = false)
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        if (username.isBlank()) {
            connection.setRequestProperty("Authorization", "Bearer $password")
        } else {
            val credentials = Base64.encodeToString(
                "$username:$password".toByteArray(Charsets.UTF_8),
                Base64.NO_WRAP
            )
            connection.setRequestProperty("Authorization", "Basic $credentials")
        }
        connection.outputStream.use { it.write("{}".toByteArray(Charsets.UTF_8)) }
        val code = readJson(connection).getString("code")
        return pair(code, name, appVersion)
    }

    fun createMiniPairCodeWithOwnerCredentials(username: String, secret: String): JSONObject {
        require(secret.isNotBlank()) { "OWNER_PASSWORD_REQUIRED" }
        val connection = connection("/api/device/v1/pair-code", "POST", authenticated = false)
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        if (username.isBlank()) {
            connection.setRequestProperty("Authorization", "Bearer $secret")
        } else {
            val credentials = Base64.encodeToString(
                "$username:$secret".toByteArray(Charsets.UTF_8),
                Base64.NO_WRAP
            )
            connection.setRequestProperty("Authorization", "Basic $credentials")
        }
        connection.outputStream.use { it.write("{}".toByteArray(Charsets.UTF_8)) }
        return readJson(connection)
    }

    fun pair(
        pairCode: String,
        name: String = "MEL Android",
        appVersion: String = APP_VERSION
    ): JSONObject {
        val response = jsonRequest(
            "/api/android/v1/pair",
            "POST",
            JSONObject()
                .put("pair_code", pairCode.trim().uppercase())
                .put("device_id", deviceId)
                .put("name", name)
                .put("app_version", appVersion)
                .put("protocol_version", PROTOCOL_VERSION),
            authenticated = false
        )
        val token = response.getString("token")
        tokenVault.save(token)
        response.remove("token")
        return response
    }

    fun heartbeat(
        appVersion: String = APP_VERSION,
        sdkInt: Int,
        battery: Int? = null,
        charging: Boolean = false
    ): JSONObject {
        return jsonRequest(
            "/api/android/v1/heartbeat",
            "POST",
            JSONObject()
                .put("app_version", appVersion)
                .put("sdk_int", sdkInt)
                .put("battery", battery)
                .put("charging", charging)
                .put("phase", "ONLINE")
        )
    }

    fun companions(): JSONArray {
        val response = readJson(connection("/api/android/v1/companions", "GET"))
        return response.optJSONArray("devices") ?: JSONArray()
    }

    fun chat(
        text: String,
        conversationId: String,
        voice: Boolean = false,
        uiMode: String = "normal"
    ): JSONObject {
        require(text.isNotBlank())
        val mode = if (uiMode.lowercase() == "complete") "complete" else "normal"
        return jsonRequest(
            "/api/android/v1/chat",
            "POST",
            JSONObject()
                .put("text", text)
                .put("conversation_id", conversationId)
                .put("ui_mode", mode)
                .put("ui_theme", "futuristic")
                .put("input_source", if (voice) "voice-server-transcription" else "text")
                .put("voice_reply", voice)
        )
    }

    fun uploadFile(
        name: String,
        mimeType: String,
        bytes: ByteArray
    ): JSONObject {
        require(bytes.isNotEmpty()) { "FILE_EMPTY" }
        require(bytes.size <= 25_000_000) { "FILE_TOO_LARGE" }
        val boundary = "mel-file-" + UUID.randomUUID().toString()
        val connection = connection("/api/android/v1/files/upload", "POST")
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        val safeName = name
            .replace("\"", "_")
            .replace("\r", "_")
            .replace("\n", "_")
            .take(180)
            .ifBlank { "file" }
        val safeType = mimeType.take(160).ifBlank { "application/octet-stream" }
        connection.outputStream.use { output ->
            fun text(value: String) = output.write(value.toByteArray(Charsets.UTF_8))
            text("--$boundary\r\n")
            text("Content-Disposition: form-data; name=\"file\"; filename=\"$safeName\"\r\n")
            text("Content-Type: $safeType\r\n\r\n")
            output.write(bytes)
            text("\r\n--$boundary--\r\n")
        }
        return readJson(connection)
    }

    fun sync(conversationId: String): JSONObject {
        val path = "/api/android/v1/sync?conversation_id=" +
            java.net.URLEncoder.encode(conversationId, Charsets.UTF_8.name())
        return readJson(connection(path, "GET"))
    }

    fun ack(conversationId: String, messageId: String, timestamp: Long): JSONObject {
        return jsonRequest(
            "/api/android/v1/sync/ack",
            "POST",
            JSONObject()
                .put("conversation_id", conversationId)
                .put("last_message_id", messageId)
                .put("last_message_timestamp", timestamp)
        )
    }

    fun tts(text: String, speaker: String = "luna", format: String = "mp3"): ByteArray {
        require(text.isNotBlank()) { "TEXT_REQUIRED" }
        val connection = connection("/api/android/v1/voice/tts", "POST")
        connection.connectTimeout = 2_500
        connection.readTimeout = 4_500
        connection.doOutput = true
        connection.setRequestProperty("Accept", "audio/mpeg, application/octet-stream")
        connection.setRequestProperty("Content-Type", "application/json")
        val payload = JSONObject()
            .put("text", text.take(1200))
            .put("speaker", speaker)
            .put("format", if (format == "mp3") "mp3" else "pcm")
        connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        return readBytes(connection)
    }

    fun transcribe(audioBytes: ByteArray, mimeType: String = "audio/webm"): JSONObject {
        require(audioBytes.isNotEmpty())
        val boundary = "mel-" + UUID.randomUUID().toString()
        val connection = connection("/api/android/v1/voice/transcribe", "POST")
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        connection.outputStream.use { output ->
            fun text(value: String) = output.write(value.toByteArray(Charsets.UTF_8))
            text("--$boundary\r\n")
            text("Content-Disposition: form-data; name=\"audio\"; filename=\"voice.m4a\"\r\n")
            text("Content-Type: $mimeType\r\n\r\n")
            output.write(audioBytes)
            text("\r\n--$boundary--\r\n")
        }
        return readJson(connection)
    }

    fun syncAndAck(conversationId: String): JSONArray {
        val response = sync(conversationId)
        val messages = response.optJSONArray("messages") ?: JSONArray()
        if (messages.length() > 0) {
            val last = messages.getJSONObject(messages.length() - 1)
            ack(conversationId, last.getString("id"), last.getLong("timestamp"))
        }
        return messages
    }
}
