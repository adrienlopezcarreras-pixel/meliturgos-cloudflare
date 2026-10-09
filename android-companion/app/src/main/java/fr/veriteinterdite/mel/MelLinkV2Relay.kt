package fr.veriteinterdite.mel

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors

class MelLinkV2Relay(
    private val sendFrame: (ByteArray) -> Unit
) {
    companion object {
        private const val OP_BEGIN = 0x01
        private const val OP_BODY = 0x02
        private const val OP_END = 0x03
        private const val OP_PING = 0x04
        private const val OP_RESPONSE_BEGIN = 0x11
        private const val OP_RESPONSE_BODY = 0x12
        private const val OP_RESPONSE_END = 0x13
        private const val OP_ERROR = 0x1f
        private const val MAX_REQUEST_BYTES = 512 * 1024
    }

    private data class Pending(
        val id: Int,
        val method: String,
        val path: String,
        val contentType: String,
        val token: String,
        val deviceId: String,
        val expected: Int,
        val body: ByteArrayOutputStream = ByteArrayOutputStream()
    )

    private val executor = Executors.newSingleThreadExecutor()
    @Volatile private var pending: Pending? = null

    fun onFrame(frame: ByteArray) {
        if (frame.size < 5) return
        val op = frame[0].toInt() and 0xff
        val id = ByteBuffer.wrap(frame, 1, 4).order(ByteOrder.LITTLE_ENDIAN).int
        val payload = frame.copyOfRange(5, frame.size)

        when (op) {
            OP_BEGIN -> begin(id, payload)
            OP_BODY -> append(id, payload)
            OP_END -> finish(id)
            OP_PING -> {
                executor.execute {
                    sendResponseBegin(id, 200)
                    sendFrame(packet(OP_RESPONSE_END, id, byteArrayOf()))
                }
            }
        }
    }

    private fun begin(id: Int, payload: ByteArray) {
        runCatching {
            val meta = JSONObject(payload.toString(Charsets.UTF_8))
            val method = when {
                meta.opt("method") is Number -> when (meta.optInt("method", 1)) {
                    0 -> "GET"
                    1 -> "POST"
                    else -> throw IllegalArgumentException("METHOD")
                }
                else -> meta.optString("m", meta.optString("method", "POST")).uppercase()
            }
            val path = meta.optString("p", meta.optString("path"))
            val contentType = meta.optString(
                "c",
                meta.optString("content_type", meta.optString("contentType", "application/json"))
            )
            val token = meta.optString("t", meta.optString("token"))
            val deviceId = meta.optString("d", meta.optString("device_id", meta.optString("deviceId")))
            val length = when {
                meta.has("l") -> meta.optInt("l", 0)
                meta.has("content_length") -> meta.optInt("content_length", 0)
                else -> meta.optInt("length", 0)
            }

            require(method == "GET" || method == "POST") { "METHOD" }
            require(path.startsWith("/api/device/v1/") && !path.contains("..")) { "PATH" }
            require((path == "/api/device/v1/pair" && token.isEmpty()) || token.length in 16..4096) { "TOKEN" }
            require(deviceId.length in 3..128) { "DEVICE_ID" }
            require(length in 0..MAX_REQUEST_BYTES) { "SIZE" }

            pending = Pending(id, method, path, contentType, token, deviceId, length)
            MelCompanionRuntime.bridgeState.value = "MINI CONNECTÉE · RELAIS MEL…"
        }.onFailure {
            executor.execute { sendError(id, "BAD_REQUEST") }
        }
    }

    private fun append(id: Int, payload: ByteArray) {
        val request = pending ?: return
        if (request.id != id || request.body.size() + payload.size > MAX_REQUEST_BYTES) {
            pending = null
            executor.execute { sendError(id, "BODY_TOO_LARGE") }
            return
        }
        request.body.write(payload)
    }

    private fun finish(id: Int) {
        val request = pending ?: return
        pending = null
        if (request.id != id || request.body.size() != request.expected) {
            executor.execute { sendError(id, "BODY_LENGTH") }
            return
        }
        executor.execute { relay(request) }
    }

    private fun relay(request: Pending) {
        var connection: HttpURLConnection? = null
        try {
            connection = URL(BuildConfig.MEL_BASE_URL.trimEnd('/') + request.path)
                .openConnection() as HttpURLConnection
            connection.requestMethod = request.method
            connection.connectTimeout = 15_000
            connection.readTimeout = 90_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("X-MEL-Device-ID", request.deviceId)
            if (request.token.isNotBlank()) {
                connection.setRequestProperty("Authorization", "Bearer " + request.token)
            }

            val body = request.body.toByteArray()
            if (request.method == "POST") {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", request.contentType.ifBlank { "application/json" })
                connection.outputStream.use { it.write(body) }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val response = stream?.use { it.readBytes() } ?: byteArrayOf()

            sendResponseBegin(request.id, status)
            // Conservative payload: works even when Android negotiates only MTU 185.
            val chunkSize = 160
            var offset = 0
            while (offset < response.size) {
                val end = minOf(offset + chunkSize, response.size)
                sendFrame(packet(OP_RESPONSE_BODY, request.id, response.copyOfRange(offset, end)))
                offset = end
            }
            sendFrame(packet(OP_RESPONSE_END, request.id, byteArrayOf()))

            MelCompanionRuntime.internetReady.value =
                MelCompanionRuntime.miniLinkReady.value &&
                MelCompanionRuntime.phoneInternetAvailable.value &&
                status in 200..299
            MelCompanionRuntime.bridgeState.value = when {
                status in 200..299 -> "MINI CONNECTÉE · RELAIS MEL OK"
                status == 401 || status == 403 -> "MINI CONNECTÉE · AUTH MINI REFUSÉE"
                else -> "MINI CONNECTÉE · MEL HTTP $status"
            }
        } catch (error: Throwable) {
            MelCompanionRuntime.internetReady.value = false
            MelCompanionRuntime.bridgeState.value = "MINI CONNECTÉE · RELAIS MEL ERREUR"
            sendError(request.id, "NETWORK_READ")
        } finally {
            connection?.disconnect()
        }
    }

    private fun sendResponseBegin(id: Int, status: Int) {
        val payload = JSONObject().put("status", status).toString().toByteArray(Charsets.UTF_8)
        sendFrame(packet(OP_RESPONSE_BEGIN, id, payload))
    }

    private fun sendError(id: Int, code: String) {
        sendFrame(packet(OP_ERROR, id, code.toByteArray(Charsets.UTF_8)))
    }

    private fun packet(op: Int, id: Int, payload: ByteArray): ByteArray {
        return ByteBuffer.allocate(5 + payload.size)
            .order(ByteOrder.LITTLE_ENDIAN)
            .put(op.toByte())
            .putInt(id)
            .put(payload)
            .array()
    }
}
