package fr.veriteinterdite.mel
import java.util.concurrent.TimeUnit
import java.util.concurrent.CountDownLatch
import java.io.DataOutputStream
import android.webkit.WebViewClient
import android.webkit.WebView
import android.graphics.Canvas
import android.graphics.Bitmap

import android.content.ContentValues
import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.net.ServerSocket
import java.net.Socket
import java.security.SecureRandom
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.ConcurrentHashMap

/**
 * Ephemeral media sink for MEL MINI.
 *
 * MINI owns no persistent media storage. When a photo/video/audio command is
 * requested, Android exposes a LocalOnlyHotspot and this receiver saves the
 * incoming media directly into MediaStore.
 */
class MiniMediaReceiver(private val context: Context) {
    companion object {
        private const val TAG = "MiniMediaReceiver"
        private const val PORT = 38222
        private const val MAX_PHOTO_BYTES = MiniPhotoDeadlineReader.MAX_PHOTO_BYTES
        private const val MAX_AUDIO_CHUNK = 512 * 1024
        private const val MAX_ACTIVE_MEDIA_CLIENTS = 4
        private val MAGIC = "MELM1".toByteArray(Charsets.US_ASCII)
    }

    data class Config(
        val ssid: String,
        val passphrase: String,
        val port: Int,
        val token: String
    )

    private val started = AtomicBoolean(false)
    private val hotspotEpoch = AtomicLong(0)
    private val activeClients = ConcurrentHashMap.newKeySet<Socket>()
    private fun newSessionToken(): String = ByteArray(24).also { SecureRandom().nextBytes(it) }
        .let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }
    @Volatile private var token = newSessionToken()
    private var serverSocket: ServerSocket? = null
    private var reservation: WifiManager.LocalOnlyHotspotReservation? = null
    @Volatile private var currentConfig: Config? = null

    fun ensureStarted(onReady: (Config) -> Unit, onError: (String) -> Unit) {
        currentConfig?.let {
            onReady(it)
            return
        }
        if (!started.compareAndSet(false, true)) return
        val epoch = hotspotEpoch.incrementAndGet()
        // A STOP revokes previous credentials: rotate before opening the listener.
        token = newSessionToken()

        try {
            serverSocket = ServerSocket(PORT).apply { reuseAddress = true }
            Thread({ acceptLoop() }, "mel-mini-media-sink").apply {
                isDaemon = true
                start()
            }
        } catch (error: Throwable) {
            started.set(false)
            onError("MEDIA_SERVER_" + (error.message ?: error.javaClass.simpleName))
            return
        }

        val wifi = context.applicationContext.getSystemService(WifiManager::class.java)
        if (wifi == null) {
            close()
            onError("MEDIA_WIFI_MANAGER")
            return
        }

        try {
            wifi.startLocalOnlyHotspot(object : WifiManager.LocalOnlyHotspotCallback() {
                override fun onStarted(value: WifiManager.LocalOnlyHotspotReservation) {
                    // Hotspot startup is asynchronous; a STOP or newer startup
                    // must revoke obsolete callbacks before they expose credentials.
                    if (!started.get() || hotspotEpoch.get() != epoch) {
                        runCatching { value.close() }
                        return
                    }
                    val pair = credentials(value)
                    if (!started.get() || hotspotEpoch.get() != epoch) {
                        runCatching { value.close() }
                        return
                    }
                    if (pair == null) {
                        runCatching { value.close() }
                        close()
                        onError("MEDIA_HOTSPOT_CREDENTIALS")
                        return
                    }
                    reservation = value
                    val config = Config(pair.first, pair.second, PORT, token)
                    currentConfig = config
                    onReady(config)
                }

                override fun onStopped() {
                    // Do not tear down a replacement session with an old callback.
                    if (hotspotEpoch.get() != epoch) return
                    close()
                }

                override fun onFailed(reason: Int) {
                    if (hotspotEpoch.get() != epoch) return
                    close()
                    onError("MEDIA_HOTSPOT_$reason")
                }
            }, Handler(context.mainLooper))
        } catch (error: SecurityException) {
            close()
            onError("MEDIA_WIFI_PERMISSION")
        } catch (error: Throwable) {
            close()
            onError("MEDIA_HOTSPOT_" + (error.message ?: error.javaClass.simpleName))
        }
    }

    @Suppress("DEPRECATION")
    private fun credentials(value: WifiManager.LocalOnlyHotspotReservation): Pair<String, String>? {
        return if (Build.VERSION.SDK_INT >= 30) {
            val cfg = value.softApConfiguration
            val ssid = cfg.ssid?.trim().orEmpty()
            val pass = cfg.passphrase?.trim().orEmpty()
            if (ssid.isBlank() || pass.isBlank()) null else ssid to pass
        } else {
            val cfg = value.wifiConfiguration ?: return null
            val ssid = cfg.SSID?.trim()?.trim('"').orEmpty()
            val pass = cfg.preSharedKey?.trim()?.trim('"').orEmpty()
            if (ssid.isBlank() || pass.isBlank()) null else ssid to pass
        }
    }

    private fun acceptLoop() {
        while (started.get()) {
            val socket = try { serverSocket?.accept() } catch (_: Throwable) { null } ?: break
            if (!started.get()) {
                runCatching { socket.close() }
                break
            }
            // The accept loop is the sole client registrar. Bound concurrent
            // sockets/threads before accepting any additional media sessions.
            if (activeClients.size >= MAX_ACTIVE_MEDIA_CLIENTS) {
                runCatching { socket.close() }
                continue
            }
            activeClients.add(socket)
            // Closing can race with accept(): never leave a newly accepted
            // client running after the user stops the MINI media receiver.
            if (!started.get()) {
                activeClients.remove(socket)
                runCatching { socket.close() }
                break
            }
            Thread({
                try {
                    handleClient(socket)
                } catch (error: Exception) {
                    Log.w(TAG, "MINI media client interrupted", error)
                } finally {
                    activeClients.remove(socket)
                    runCatching { socket.close() }
                }
            }, "mel-mini-media-client").apply {
                isDaemon = true
                start()
            }
        }
    }

    private fun readFully(input: DataInputStream, count: Int): ByteArray {
        require(count >= 0)
        val data = ByteArray(count)
        input.readFully(data)
        return data
    }

    private fun safeName(raw: String, fallback: String): String {
        val normalized = raw.replace(Regex("[^A-Za-z0-9._-]"), "_").take(96)
        return if (normalized.isBlank()) fallback else normalized
    }

    private fun handleClient(socket: Socket) {
        socket.use { client ->
            client.soTimeout = 45_000
            val handshakeGate = MiniMediaHandshakeReader(
                BufferedInputStream(client.getInputStream(), 64 * 1024), client
            )
            val input = DataInputStream(handshakeGate)
            val magic = readFully(input, MAGIC.size)
            if (!magic.contentEquals(MAGIC)) return
            val type = input.readUnsignedByte()
            val tokenLen = input.readUnsignedByte()
            if (tokenLen !in 16..96) return
            val suppliedToken = String(readFully(input, tokenLen), Charsets.UTF_8)
            if (!constantTimeEquals(token, suppliedToken)) return

            val nameLen = input.readUnsignedShort()
            if (nameLen !in 1..128) return
            val name = String(readFully(input, nameLen), Charsets.UTF_8)
            val width = input.readUnsignedShort()
            val height = input.readUnsignedShort()
            val fps = input.readUnsignedByte()
            val sampleRate = input.readInt()
            val channels = input.readUnsignedByte()
            // Bound only the handshake; media payloads retain their own transfer budgets.
            handshakeGate.finishHandshake()

            // Invalid MINI media metadata must not be silently coerced into
            // a different framerate, sample rate or channel count.
            when (type) {
                1 -> receivePhoto(input, safeName(name, "mel-mini-photo.jpg"), client)
                2 -> if (fps in 1..30) {
                    receiveVideo(input, safeName(name, "mel-mini-video.avi"), width, height, fps, client)
                }
                3 -> if (sampleRate in 8_000..96_000 && channels in 1..2) {
                    receiveAudio(input, safeName(name, "mel-mini-audio.wav"), sampleRate, channels, client)
                }
                4 -> receiveBrowser(input, DataOutputStream(BufferedOutputStream(client.getOutputStream())), width, height, client)
            }
        }
    }

    private fun receivePhoto(input: DataInputStream, name: String, socket: Socket) {
        // Include the size header in the global photo deadline.
        val bytes = MiniPhotoDeadlineReader.readSized(input, beforeRead = { socket.soTimeout = it })
        if (!MiniJpegFrameSignature.hasMarkers(bytes)) return
        val uri = createMediaStoreEntry(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            name.ensureSuffix(".jpg"),
            "image/jpeg",
            Environment.DIRECTORY_PICTURES + "/MEL"
        ) ?: return
        if (!writeAndPublish(uri) { it.write(bytes) }) return
        Log.i(TAG, "MINI photo saved bytes=${bytes.size} uri=$uri")
    }

    private fun receiveVideo(
        input: DataInputStream,
        name: String,
        width: Int,
        height: Int,
        fps: Int,
        socket: Socket
    ) {
        if (width !in 80..1920 || height !in 80..1920) return
        val temp = File.createTempFile("mel-mini-video-", ".avi", context.cacheDir)
        val budget = MiniVideoTransferBudget(fps)
        var framesReceived = 0
        try {
            AviMjpegWriter(temp, width, height, fps).use { avi ->
                while (true) {
                    if (!budget.withinDeadline()) return
                    val headerTimeout = budget.remainingSocketTimeoutMs()
                    if (headerTimeout == 0) return
                    socket.soTimeout = headerTimeout
                    // Socket configuration may exhaust the remaining transfer budget.
                    if (!budget.withinDeadline()) return
                    val size = MiniMediaChunkReader.readInt(input, socket, budget::remainingSocketTimeoutMs, budget::withinDeadline)
                    if (size == 0) break
                    // Reject oversized streams before allocating/reading another frame.
                    if (!budget.reserve(size)) return
                    val frameTimeout = budget.remainingSocketTimeoutMs()
                    if (frameTimeout == 0) return
                    socket.soTimeout = frameTimeout
                    // Socket configuration may exhaust the remaining transfer budget.
                    if (!budget.withinDeadline()) return
                    val jpeg = MiniMediaChunkReader.read(input, size, socket, budget::remainingSocketTimeoutMs, budget::withinDeadline)
                    // Reading the final frame can itself cross the deadline.
                    if (!budget.withinDeadline()) return
                    if (!MiniJpegFrameSignature.hasMarkers(jpeg)) return
                    avi.addFrame(jpeg)
                    framesReceived++
                }
            }
            // Never publish a video after its timeout, even on a clean EOF.
            if (framesReceived == 0 || !budget.withinDeadline()) return
            val uri = createMediaStoreEntry(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                name.ensureSuffix(".avi"),
                "video/x-msvideo",
                Environment.DIRECTORY_MOVIES + "/MEL"
            ) ?: return
            if (!writeAndPublish(uri) { output ->
                temp.inputStream().use { it.copyTo(output, 128 * 1024) }
            }) return
            Log.i(TAG, "MINI video saved bytes=${temp.length()} uri=$uri")
        } finally {
            temp.delete()
        }
    }

    private fun receiveAudio(
        input: DataInputStream,
        name: String,
        sampleRate: Int,
        channels: Int,
        socket: Socket
    ) {
        val temp = File.createTempFile("mel-mini-audio-", ".pcm", context.cacheDir)
        var pcmBytes = 0L
        val budget = MiniAudioTransferBudget()
        try {
            BufferedOutputStream(FileOutputStream(temp), 64 * 1024).use { output ->
                while (true) {
                    if (!budget.withinDeadline()) return
                    val headerTimeout = budget.remainingSocketTimeoutMs()
                    if (headerTimeout == 0) return
                    socket.soTimeout = headerTimeout
                    // Socket configuration may exhaust the remaining transfer budget.
                    if (!budget.withinDeadline()) return
                    val size = MiniMediaChunkReader.readInt(input, socket, budget::remainingSocketTimeoutMs, budget::withinDeadline)
                    if (size == 0) break
                    // Reject over-budget blocks before reading or writing them.
                    if (!budget.reserve(size)) return
                    val chunkTimeout = budget.remainingSocketTimeoutMs()
                    if (chunkTimeout == 0) return
                    socket.soTimeout = chunkTimeout
                    // Socket configuration may exhaust the remaining transfer budget.
                    if (!budget.withinDeadline()) return
                    val bytes = MiniMediaChunkReader.read(input, size, socket, budget::remainingSocketTimeoutMs, budget::withinDeadline)
                    if (!budget.withinDeadline()) return
                    output.write(bytes)
                    pcmBytes += size
                }
            }
            if (!budget.withinDeadline() || pcmBytes == 0L) return
            // WAV PCM16 requires whole samples across all channels.
            if (pcmBytes % (channels * 2L) != 0L) return
            val uri = createMediaStoreEntry(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                name.ensureSuffix(".wav"),
                "audio/wav",
                Environment.DIRECTORY_RECORDINGS + "/MEL"
            ) ?: return
            if (!writeAndPublish(uri) { output ->
                writeWavHeader(output, pcmBytes.toInt(), sampleRate, channels)
                temp.inputStream().use { it.copyTo(output, 64 * 1024) }
            }) return
            Log.i(TAG, "MINI audio saved pcm=$pcmBytes uri=$uri")
        } finally {
            temp.delete()
        }
    }

    private fun receiveBrowser(
        input: DataInputStream,
        output: DataOutputStream,
        requestedWidth: Int,
        requestedHeight: Int,
        socket: Socket
    ) {
        // Limit the entire length-prefix and URL payload, not only each socket read.
        val url = MiniBrowserRequestReader.readUrl(input, socket)
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://")) ||
            !MiniBrowserUrlPolicy.allows(url)) {
            output.writeInt(0)
            output.flush()
            return
        }
        val width = requestedWidth.coerceIn(160, 320)
        val height = requestedHeight.coerceIn(160, 320)
        val rgb565 = renderWebPage(url, width, height)
        if (rgb565 == null) {
            output.writeInt(0)
        } else {
            output.writeInt(rgb565.size)
            output.write(rgb565)
        }
        output.flush()
    }

    private fun renderWebPage(url: String, width: Int, height: Int): ByteArray? {
        val latch = CountDownLatch(1)
        val completed = AtomicBoolean(false)
        val captureScheduled = AtomicBoolean(false)
        var result: ByteArray? = null
        Handler(context.mainLooper).post {
            val web = WebView(context.applicationContext)
            web.settings.javaScriptEnabled = true
            web.settings.domStorageEnabled = true
            // MINI may request arbitrary public URLs; never expose Android's
            // private file/content providers or allow insecure mixed content.
            web.settings.allowFileAccess = false
            web.settings.allowContentAccess = false
            web.settings.allowFileAccessFromFileURLs = false
            web.settings.allowUniversalAccessFromFileURLs = false
            web.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            web.settings.loadsImagesAutomatically = true
            web.settings.builtInZoomControls = false
            web.settings.displayZoomControls = false
            web.setBackgroundColor(android.graphics.Color.WHITE)
            web.layout(0, 0, width, height)
            web.webViewClient = object : WebViewClient() {
                // Refuse private-network navigation even after public-page redirects.
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: android.webkit.WebResourceRequest
                ): Boolean = !MiniBrowserUrlPolicy.allows(request.url.toString())

                @Suppress("DEPRECATION")
                override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                    !MiniBrowserUrlPolicy.allows(url)

                // Prevent obvious local-network requests from embedded resources too.
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: android.webkit.WebResourceRequest
                ): android.webkit.WebResourceResponse? {
                    val resourceUrl = request.url.toString()
                    if (resourceUrl.startsWith("http://") || resourceUrl.startsWith("https://")) {
                        if (!MiniBrowserUrlPolicy.allows(resourceUrl)) {
                            return android.webkit.WebResourceResponse(
                                "text/plain", "UTF-8", java.io.ByteArrayInputStream(ByteArray(0))
                            )
                        }
                    }
                    return null
                }

                override fun onPageFinished(view: WebView, pageUrl: String) {
                    // Redirects may produce multiple completion callbacks; only
                    // one may capture and destroy the WebView.
                    if (completed.get() || !captureScheduled.compareAndSet(false, true)) return
                    Handler(context.mainLooper).postDelayed({
                        if (completed.compareAndSet(false, true)) {
                            result = runCatching {
                                view.measure(
                                    android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY),
                                    android.view.View.MeasureSpec.makeMeasureSpec(height, android.view.View.MeasureSpec.EXACTLY)
                                )
                                view.layout(0, 0, width, height)
                                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                                try {
                                    val canvas = Canvas(bitmap)
                                    view.draw(canvas)
                                    val pixels = IntArray(width * height)
                                    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
                                    val out = ByteArray(width * height * 2)
                                    var offset = 0
                                    for (pixel in pixels) {
                                        val r = (pixel ushr 16) and 0xff
                                        val g = (pixel ushr 8) and 0xff
                                        val b = pixel and 0xff
                                        val rgb = ((r shr 3) shl 11) or ((g shr 2) shl 5) or (b shr 3)
                                        out[offset++] = (rgb and 0xff).toByte()
                                        out[offset++] = ((rgb ushr 8) and 0xff).toByte()
                                    }
                                    out
                                } finally {
                                    bitmap.recycle()
                                }
                            }.getOrNull()
                            runCatching { view.stopLoading() }
                            runCatching { view.destroy() }
                            latch.countDown()
                        }
                    }, 1300L)
                }
            }
            web.loadUrl(url)
            Handler(context.mainLooper).postDelayed({
                // A timeout must also revoke any already scheduled capture.
                if (completed.compareAndSet(false, true)) {
                    runCatching { web.stopLoading() }
                    runCatching { web.destroy() }
                    latch.countDown()
                }
            }, 14_000L)
        }
        latch.await(16, TimeUnit.SECONDS)
        return result
    }

    private fun createMediaStoreEntry(
        collection: android.net.Uri,
        displayName: String,
        mime: String,
        relativePath: String
    ): android.net.Uri? {
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            if (Build.VERSION.SDK_INT >= 29) {
                put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
        }
        return context.contentResolver.insert(collection, values)
    }

    // Never publish a MediaStore item unless its bytes were actually written.
    // Revoke incomplete pending entries if the provider refuses an output stream,
    // copying fails or updating the published state throws.
    private fun writeAndPublish(uri: android.net.Uri, writer: (OutputStream) -> Unit): Boolean {
        var completed = false
        try {
            val output = context.contentResolver.openOutputStream(uri, "w") ?: return false
            output.use { writer(it) }
            // STOP or hotspot shutdown must not publish an in-flight recording.
            if (!started.get()) return false
            publish(uri)
            completed = true
            return true
        } finally {
            if (!completed) {
                runCatching { context.contentResolver.delete(uri, null, null) }
            }
        }
    }

    private fun publish(uri: android.net.Uri) {
        if (Build.VERSION.SDK_INT < 29) return
        // MediaStore may refuse to update the pending entry without throwing.
        // Do not report a successful save unless exactly one item was published.
        val updated = context.contentResolver.update(
            uri,
            ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) },
            null,
            null
        )
        check(updated == 1) { "MINI_MEDIA_PUBLISH_FAILED" }
    }

    private fun String.ensureSuffix(suffix: String): String =
        if (lowercase().endsWith(suffix)) this else this + suffix

    private fun constantTimeEquals(a: String, b: String): Boolean {
        val aa = a.toByteArray(Charsets.UTF_8)
        val bb = b.toByteArray(Charsets.UTF_8)
        if (aa.size != bb.size) return false
        var diff = 0
        for (i in aa.indices) diff = diff or (aa[i].toInt() xor bb[i].toInt())
        return diff == 0
    }

    private fun writeWavHeader(output: OutputStream, pcmBytes: Int, sampleRate: Int, channels: Int) {
        fun le16(v: Int) {
            output.write(v and 0xff)
            output.write((v ushr 8) and 0xff)
        }
        fun le32(v: Int) {
            output.write(v and 0xff)
            output.write((v ushr 8) and 0xff)
            output.write((v ushr 16) and 0xff)
            output.write((v ushr 24) and 0xff)
        }
        output.write("RIFF".toByteArray(Charsets.US_ASCII))
        le32(36 + pcmBytes)
        output.write("WAVEfmt ".toByteArray(Charsets.US_ASCII))
        le32(16)
        le16(1)
        le16(channels)
        le32(sampleRate)
        le32(sampleRate * channels * 2)
        le16(channels * 2)
        le16(16)
        output.write("data".toByteArray(Charsets.US_ASCII))
        le32(pcmBytes)
    }

    fun close() {
        // Invalidate delayed hotspot callbacks before any teardown.
        hotspotEpoch.incrementAndGet()
        // Stop permission for active sessions before closing the listener.
        started.set(false)
        currentConfig = null
        runCatching { reservation?.close() }
        reservation = null
        runCatching { serverSocket?.close() }
        serverSocket = null
        // Closing only the listening socket does not interrupt accepted clients.
        // Close each live socket so blocked reads exit and incomplete media
        // are discarded by writeAndPublish rather than published.
        stopActiveClients()
    }

    private fun stopActiveClients() {
        for (client in activeClients) runCatching { client.close() }
        activeClients.clear()
    }

    private class AviMjpegWriter(
        file: File,
        private val width: Int,
        private val height: Int,
        private val fps: Int
    ) : AutoCloseable {
        private val out = RandomAccessFile(file, "rw")
        private val index = ArrayList<Pair<Long, Int>>()
        private var totalFramesPos = 0L
        private var streamFramesPos = 0L
        private var moviListStart = 0L
        private var moviDataStart = 0L
        private var closed = false

        init { writeHeader() }

        private fun fourcc(value: String) {
            out.write(value.toByteArray(Charsets.US_ASCII))
        }

        private fun le16(v: Int) {
            out.write(v and 0xff)
            out.write((v ushr 8) and 0xff)
        }

        private fun le32(v: Long) {
            val x = v.toInt()
            out.write(x and 0xff)
            out.write((x ushr 8) and 0xff)
            out.write((x ushr 16) and 0xff)
            out.write((x ushr 24) and 0xff)
        }

        private fun patch32(position: Long, value: Long) {
            val end = out.filePointer
            out.seek(position)
            le32(value)
            out.seek(end)
        }

        private fun writeHeader() {
            fourcc("RIFF")
            le32(0)
            fourcc("AVI ")

            val hdrl = out.filePointer
            fourcc("LIST")
            le32(0)
            fourcc("hdrl")

            fourcc("avih")
            le32(56)
            le32(1_000_000L / fps)
            le32(0)
            le32(0)
            le32(0x10)
            totalFramesPos = out.filePointer
            le32(0)
            le32(0)
            le32(1)
            le32(0)
            le32(width.toLong())
            le32(height.toLong())
            repeat(4) { le32(0) }

            val strl = out.filePointer
            fourcc("LIST")
            le32(0)
            fourcc("strl")

            fourcc("strh")
            le32(56)
            fourcc("vids")
            fourcc("MJPG")
            le32(0)
            le16(0)
            le16(0)
            le32(0)
            le32(1)
            le32(fps.toLong())
            le32(0)
            streamFramesPos = out.filePointer
            le32(0)
            le32(0)
            le32(0xffffffffL)
            le32(0)
            le16(0)
            le16(0)
            le16(width)
            le16(height)

            fourcc("strf")
            le32(40)
            le32(40)
            le32(width.toLong())
            le32(height.toLong())
            le16(1)
            le16(24)
            fourcc("MJPG")
            le32((width * height * 3).toLong())
            le32(0)
            le32(0)
            le32(0)
            le32(0)

            val afterStrl = out.filePointer
            patch32(strl + 4, afterStrl - strl - 8)
            patch32(hdrl + 4, afterStrl - hdrl - 8)

            moviListStart = out.filePointer
            fourcc("LIST")
            le32(0)
            fourcc("movi")
            moviDataStart = out.filePointer
        }

        fun addFrame(jpeg: ByteArray) {
            val chunkStart = out.filePointer
            fourcc("00dc")
            le32(jpeg.size.toLong())
            out.write(jpeg)
            if ((jpeg.size and 1) != 0) out.write(0)
            index += (chunkStart to jpeg.size)
        }

        override fun close() {
            if (closed) return
            closed = true

            val afterMovi = out.filePointer
            patch32(moviListStart + 4, afterMovi - moviListStart - 8)

            fourcc("idx1")
            le32(index.size.toLong() * 16L)
            for ((position, size) in index) {
                fourcc("00dc")
                le32(0x10)
                le32(4L + position - moviDataStart)
                le32(size.toLong())
            }

            patch32(totalFramesPos, index.size.toLong())
            patch32(streamFramesPos, index.size.toLong())
            patch32(4, out.length() - 8)
            out.close()
        }
    }
}
