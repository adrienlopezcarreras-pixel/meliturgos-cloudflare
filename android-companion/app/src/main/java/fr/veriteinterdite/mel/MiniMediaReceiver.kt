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
        private const val MAX_PHOTO_BYTES = 12 * 1024 * 1024
        private const val MAX_FRAME_BYTES = 2 * 1024 * 1024
        private const val MAX_AUDIO_CHUNK = 512 * 1024
        private val MAGIC = "MELM1".toByteArray(Charsets.US_ASCII)
    }

    data class Config(
        val ssid: String,
        val passphrase: String,
        val port: Int,
        val token: String
    )

    private val started = AtomicBoolean(false)
    private val token = ByteArray(24).also { SecureRandom().nextBytes(it) }
        .let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }
    private var serverSocket: ServerSocket? = null
    private var reservation: WifiManager.LocalOnlyHotspotReservation? = null
    @Volatile private var currentConfig: Config? = null

    fun ensureStarted(onReady: (Config) -> Unit, onError: (String) -> Unit) {
        currentConfig?.let {
            onReady(it)
            return
        }
        if (!started.compareAndSet(false, true)) return

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
                    reservation = value
                    val pair = credentials(value)
                    if (pair == null) {
                        close()
                        onError("MEDIA_HOTSPOT_CREDENTIALS")
                        return
                    }
                    val config = Config(pair.first, pair.second, PORT, token)
                    currentConfig = config
                    onReady(config)
                }

                override fun onStopped() {
                    currentConfig = null
                    started.set(false)
                }

                override fun onFailed(reason: Int) {
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
            Thread({ handleClient(socket) }, "mel-mini-media-client").apply {
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
            val input = DataInputStream(BufferedInputStream(client.getInputStream(), 64 * 1024))
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
            val fps = input.readUnsignedByte().coerceIn(1, 30)
            val sampleRate = input.readInt().coerceIn(8_000, 96_000)
            val channels = input.readUnsignedByte().coerceIn(1, 2)

            when (type) {
                1 -> receivePhoto(input, safeName(name, "mel-mini-photo.jpg"))
                2 -> receiveVideo(input, safeName(name, "mel-mini-video.avi"), width, height, fps)
                3 -> receiveAudio(input, safeName(name, "mel-mini-audio.wav"), sampleRate, channels)
                4 -> receiveBrowser(input, DataOutputStream(BufferedOutputStream(client.getOutputStream())), width, height)
            }
        }
    }

    private fun receivePhoto(input: DataInputStream, name: String) {
        val size = input.readInt()
        if (size !in 1..MAX_PHOTO_BYTES) return
        val bytes = readFully(input, size)
        val uri = createMediaStoreEntry(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            name.ensureSuffix(".jpg"),
            "image/jpeg",
            Environment.DIRECTORY_PICTURES + "/MEL"
        ) ?: return
        context.contentResolver.openOutputStream(uri, "w")?.use { it.write(bytes) }
        publish(uri)
        Log.i(TAG, "MINI photo saved bytes=$size uri=$uri")
    }

    private fun receiveVideo(
        input: DataInputStream,
        name: String,
        width: Int,
        height: Int,
        fps: Int
    ) {
        if (width !in 80..1920 || height !in 80..1920) return
        val temp = File.createTempFile("mel-mini-video-", ".avi", context.cacheDir)
        try {
            AviMjpegWriter(temp, width, height, fps).use { avi ->
                while (true) {
                    val size = input.readInt()
                    if (size == 0) break
                    if (size !in 1..MAX_FRAME_BYTES) return
                    avi.addFrame(readFully(input, size))
                }
            }
            val uri = createMediaStoreEntry(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                name.ensureSuffix(".avi"),
                "video/x-msvideo",
                Environment.DIRECTORY_MOVIES + "/MEL"
            ) ?: return
            context.contentResolver.openOutputStream(uri, "w")?.use { output ->
                temp.inputStream().use { it.copyTo(output, 128 * 1024) }
            }
            publish(uri)
            Log.i(TAG, "MINI video saved bytes=${temp.length()} uri=$uri")
        } finally {
            temp.delete()
        }
    }

    private fun receiveAudio(
        input: DataInputStream,
        name: String,
        sampleRate: Int,
        channels: Int
    ) {
        val temp = File.createTempFile("mel-mini-audio-", ".pcm", context.cacheDir)
        var pcmBytes = 0L
        try {
            BufferedOutputStream(FileOutputStream(temp), 64 * 1024).use { output ->
                while (true) {
                    val size = input.readInt()
                    if (size == 0) break
                    if (size !in 1..MAX_AUDIO_CHUNK) return
                    val bytes = readFully(input, size)
                    output.write(bytes)
                    pcmBytes += size
                    if (pcmBytes > 96_000L * 2L * 2L * 180L) return
                }
            }
            val uri = createMediaStoreEntry(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                name.ensureSuffix(".wav"),
                "audio/wav",
                Environment.DIRECTORY_RECORDINGS + "/MEL"
            ) ?: return
            context.contentResolver.openOutputStream(uri, "w")?.use { output ->
                writeWavHeader(output, pcmBytes.toInt(), sampleRate, channels)
                temp.inputStream().use { it.copyTo(output, 64 * 1024) }
            }
            publish(uri)
            Log.i(TAG, "MINI audio saved pcm=$pcmBytes uri=$uri")
        } finally {
            temp.delete()
        }
    }

    private fun receiveBrowser(
        input: DataInputStream,
        output: DataOutputStream,
        requestedWidth: Int,
        requestedHeight: Int
    ) {
        val urlLen = input.readUnsignedShort()
        if (urlLen !in 8..2048) {
            output.writeInt(0)
            output.flush()
            return
        }
        val url = String(readFully(input, urlLen), Charsets.UTF_8).trim()
        if (!(url.startsWith("https://") || url.startsWith("http://"))) {
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
        var result: ByteArray? = null
        Handler(context.mainLooper).post {
            val web = WebView(context.applicationContext)
            web.settings.javaScriptEnabled = true
            web.settings.domStorageEnabled = true
            web.settings.loadsImagesAutomatically = true
            web.settings.builtInZoomControls = false
            web.settings.displayZoomControls = false
            web.setBackgroundColor(android.graphics.Color.WHITE)
            web.layout(0, 0, width, height)
            web.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, pageUrl: String) {
                    Handler(context.mainLooper).postDelayed({
                        runCatching {
                            view.measure(
                                android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY),
                                android.view.View.MeasureSpec.makeMeasureSpec(height, android.view.View.MeasureSpec.EXACTLY)
                            )
                            view.layout(0, 0, width, height)
                            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
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
                            result = out
                            bitmap.recycle()
                        }
                        view.stopLoading()
                        view.destroy()
                        latch.countDown()
                    }, 1300L)
                }
            }
            web.loadUrl(url)
            Handler(context.mainLooper).postDelayed({
                if (latch.count > 0L) {
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

    private fun publish(uri: android.net.Uri) {
        if (Build.VERSION.SDK_INT < 29) return
        context.contentResolver.update(
            uri,
            ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) },
            null,
            null
        )
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
        currentConfig = null
        runCatching { reservation?.close() }
        reservation = null
        runCatching { serverSocket?.close() }
        serverSocket = null
        started.set(false)
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
