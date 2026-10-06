package fr.veriteinterdite.mel

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.os.ParcelUuid
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * MEL Link V2 Android endpoint.
 *
 * Android is deliberately the BLE central / GATT client. MINI owns the stable
 * GATT server. This class is built alongside the legacy bridge until V2 gates
 * are green, then becomes the only mobile bridge.
 */
class MelLinkV2ClientService : Service() {
    companion object {
        private const val TAG = "MelLinkV2"
        private const val CHANNEL_ID = "mel_link_v2"
        private const val NOTIFICATION_ID = 705

        val SERVICE_UUID: UUID = UUID.fromString("0000abf0-0000-1000-8000-00805f9b34fb")
        val CONTROL_RX_UUID: UUID = UUID.fromString("0000abf1-0000-1000-8000-00805f9b34fb")
        val EVENT_TX_UUID: UUID = UUID.fromString("0000abf2-0000-1000-8000-00805f9b34fb")
        val BULK_RX_UUID: UUID = UUID.fromString("0000abf3-0000-1000-8000-00805f9b34fb")
        private val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        const val ACTION_RESTART = "fr.veriteinterdite.mel.action.RESTART_LINK_V2"

        val state = MutableStateFlow("OFF")
        val miniReady = MutableStateFlow(false)
        val protocolReady = MutableStateFlow(false)
        val lastError = MutableStateFlow("")
    }

    private data class IncomingRequest(
        val streamId: Int,
        val meta: JSONObject,
        val body: ByteArrayOutputStream = ByteArrayOutputStream()
    )

    private var wakeLock: PowerManager.WakeLock? = null
    private var gatt: BluetoothGatt? = null
    private var controlRx: BluetoothGattCharacteristic? = null
    private var eventTx: BluetoothGattCharacteristic? = null
    private var bulkRx: BluetoothGattCharacteristic? = null
    private val connecting = AtomicBoolean(false)
    private val executor = Executors.newSingleThreadExecutor()
    private val requests = HashMap<Int, IncomingRequest>()
    private var scanActive = false
    private var reconnectAttempt = 0
    private val handler by lazy { android.os.Handler(mainLooper) }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        wakeLock = getSystemService(PowerManager::class.java)
            ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MEL:LinkV2")
            ?.apply { acquire() }
        startForeground(
            NOTIFICATION_ID,
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_mel_avatar)
                .setContentTitle("MEL Mobile")
                .setContentText("Liaison MINI V2")
                .setOngoing(true)
                .setSilent(true)
                .build()
        )
        startDiscovery()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_RESTART) {
            resetPhysicalLink("manual restart")
            handler.postDelayed({ startDiscovery() }, 400L)
        } else if (gatt == null && !scanActive) {
            startDiscovery()
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopScan()
        handler.removeCallbacksAndMessages(null)
        runCatching { gatt?.disconnect() }
        runCatching { gatt?.close() }
        gatt = null
        executor.shutdownNow()
        miniReady.value = false
        protocolReady.value = false
        state.value = "OFF"
        if (wakeLock?.isHeld == true) wakeLock?.release()
        wakeLock = null
        super.onDestroy()
    }

    private fun hasBlePermissions(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    }

    private fun startDiscovery() {
        if (!hasBlePermissions()) {
            state.value = "AUTORISATION BLUETOOTH"
            return
        }
        val adapter = getSystemService(BluetoothManager::class.java)?.adapter
        if (adapter == null || !adapter.isEnabled) {
            state.value = "BLUETOOTH OFF"
            return
        }
        if (scanActive || gatt != null || connecting.get()) return

        val scanner = adapter.bluetoothLeScanner ?: run {
            state.value = "SCAN INDISPONIBLE"
            scheduleReconnect()
            return
        }
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE_UUID)).build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        scanActive = true
        state.value = "RECHERCHE MINI"
        scanner.startScan(listOf(filter), settings, scanCallback)
        handler.postDelayed({
            if (scanActive) {
                stopScan()
                scheduleReconnect()
            }
        }, 12_000L)
    }

    private fun stopScan() {
        if (!scanActive || !hasBlePermissions()) return
        val scanner = getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner
        runCatching { scanner?.stopScan(scanCallback) }
        scanActive = false
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            if (!connecting.compareAndSet(false, true)) return
            stopScan()
            state.value = "CONNEXION MINI"
            connect(result.device)
        }

        override fun onScanFailed(errorCode: Int) {
            scanActive = false
            lastError.value = "SCAN_$errorCode"
            state.value = "ERREUR SCAN"
            scheduleReconnect()
        }
    }

    private fun connect(device: BluetoothDevice) {
        if (!hasBlePermissions()) {
            connecting.set(false)
            return
        }
        runCatching {
            gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                device.connectGatt(this, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
            } else {
                @Suppress("DEPRECATION")
                device.connectGatt(this, false, gattCallback)
            }
        }.onFailure {
            connecting.set(false)
            lastError.value = it.message.orEmpty()
            scheduleReconnect()
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(client: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                reconnectAttempt = 0
                state.value = "NEGOCIATION"
                miniReady.value = false
                protocolReady.value = false
                if (!hasBlePermissions()) return
                val mtuQueued = runCatching { client.requestMtu(MelLinkV2Protocol.DEFAULT_MTU) }.getOrDefault(false)
                if (!mtuQueued) client.discoverServices()
                return
            }

            if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                if (gatt === client) {
                    runCatching { client.close() }
                    gatt = null
                }
                clearSession("DISCONNECTED_$status")
                connecting.set(false)
                scheduleReconnect()
            }
        }

        override fun onMtuChanged(client: BluetoothGatt, mtu: Int, status: Int) {
            if (!hasBlePermissions()) return
            state.value = "DECOUVERTE SERVICES"
            client.discoverServices()
        }

        override fun onServicesDiscovered(client: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failAndReconnect(client, "SERVICE_DISCOVERY_$status")
                return
            }
            val service: BluetoothGattService = client.getService(SERVICE_UUID)
                ?: return failAndReconnect(client, "SERVICE_MISSING")
            controlRx = service.getCharacteristic(CONTROL_RX_UUID)
                ?: return failAndReconnect(client, "CONTROL_MISSING")
            eventTx = service.getCharacteristic(EVENT_TX_UUID)
                ?: return failAndReconnect(client, "EVENT_MISSING")
            bulkRx = service.getCharacteristic(BULK_RX_UUID)
                ?: return failAndReconnect(client, "BULK_MISSING")

            val event = eventTx ?: return
            if (!hasBlePermissions() || !client.setCharacteristicNotification(event, true)) {
                failAndReconnect(client, "NOTIFY_LOCAL")
                return
            }
            val cccd = event.getDescriptor(CCCD_UUID)
                ?: return failAndReconnect(client, "CCCD_MISSING")
            val queued = if (Build.VERSION.SDK_INT >= 33) {
                client.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == BluetoothGatt.GATT_SUCCESS
            } else {
                @Suppress("DEPRECATION")
                run {
                    cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    client.writeDescriptor(cccd)
                }
            }
            if (!queued) failAndReconnect(client, "CCCD_WRITE")
        }

        override fun onDescriptorWrite(client: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            if (descriptor.uuid != CCCD_UUID) return
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failAndReconnect(client, "CCCD_STATUS_$status")
                return
            }
            connecting.set(false)
            miniReady.value = true
            state.value = "MINI CONNECTEE"
            sendControl(
                MelLinkV2Protocol.encode(
                    MelLinkV2Protocol.HELLO,
                    0,
                    0,
                    0,
                    JSONObject()
                        .put("protocol", MelLinkV2Protocol.VERSION)
                        .put("android", BuildConfig.VERSION_NAME)
                        .toString().toByteArray()
                )
            )
        }

        @Deprecated("Deprecated by Android")
        override fun onCharacteristicChanged(client: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            @Suppress("DEPRECATION")
            handleEventFrame(characteristic.value ?: return)
        }

        override fun onCharacteristicChanged(client: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
            handleEventFrame(value)
        }

        override fun onCharacteristicWrite(client: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                lastError.value = "WRITE_$status"
            }
        }
    }

    private fun handleEventFrame(raw: ByteArray) {
        val frame = runCatching { MelLinkV2Protocol.decode(raw) }.getOrElse {
            lastError.value = it.message.orEmpty()
            return
        }
        when (frame.type) {
            MelLinkV2Protocol.HELLO -> {
                protocolReady.value = true
                state.value = "MINI V2 PRETE"
                sendControl(MelLinkV2Protocol.encode(MelLinkV2Protocol.SESSION, 0, 0, 0, sessionPayload()))
            }
            MelLinkV2Protocol.PING -> {
                sendControl(MelLinkV2Protocol.encode(MelLinkV2Protocol.PONG, 0, frame.streamId, frame.seq))
            }
            MelLinkV2Protocol.REQUEST_BEGIN -> {
                val meta = runCatching { JSONObject(frame.payload.toString(Charsets.UTF_8)) }.getOrNull() ?: return
                synchronized(requests) { requests[frame.streamId] = IncomingRequest(frame.streamId, meta) }
                sendCredit(frame.streamId, 6)
            }
            MelLinkV2Protocol.REQUEST_DATA -> {
                val request = synchronized(requests) { requests[frame.streamId] } ?: return
                request.body.write(frame.payload)
                sendCredit(frame.streamId, 1)
            }
            MelLinkV2Protocol.REQUEST_END -> {
                val request = synchronized(requests) { requests.remove(frame.streamId) } ?: return
                executor.execute { executeRequest(request) }
            }
            MelLinkV2Protocol.AUDIO_BEGIN,
            MelLinkV2Protocol.AUDIO_DATA,
            MelLinkV2Protocol.AUDIO_END -> {
                // Audio streams use the same request executor in the next gate.
                lastError.value = "AUDIO_GATE_PENDING"
            }
        }
    }

    private fun sessionPayload(): ByteArray {
        val rawId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        return JSONObject()
            .put("protocol", MelLinkV2Protocol.VERSION)
            .put("device_id", "android-" + (rawId ?: "unknown").take(64))
            .put("epoch_ms", System.currentTimeMillis())
            .toString()
            .toByteArray()
    }

    private fun executeRequest(request: IncomingRequest) {
        val method = request.meta.optString("method", "POST").uppercase()
        val path = request.meta.optString("path")
        val contentType = request.meta.optString("content_type", "application/json")
        if (!path.startsWith("/api/")) {
            sendError(request.streamId, "BAD_PATH")
            return
        }
        val rawId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        val androidDeviceId = "android-" + (rawId ?: "unknown").take(64)
        val token = TokenVault(this).load()
        if (token.isNullOrBlank()) {
            sendError(request.streamId, "ANDROID_NOT_PAIRED")
            return
        }

        try {
            val connection = java.net.URL(BuildConfig.MEL_BASE_URL.trimEnd('/') + path).openConnection() as java.net.HttpURLConnection
            try {
                connection.requestMethod = method
                connection.connectTimeout = 15_000
                connection.readTimeout = 90_000
                connection.setRequestProperty("Authorization", "Bearer $token")
                connection.setRequestProperty("X-MEL-Device-ID", androidDeviceId)
                connection.setRequestProperty("X-MEL-MINI-Device-ID", request.meta.optString("mini_device_id"))
                connection.setRequestProperty("X-MEL-Link-Protocol", "2")
                connection.setRequestProperty("Accept", "*/*")
                if (request.body.size() > 0) {
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", contentType)
                    connection.outputStream.use { it.write(request.body.toByteArray()) }
                }
                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                val body = stream?.use { it.readBytes() } ?: byteArrayOf()
                val begin = JSONObject()
                    .put("status", status)
                    .put("content_type", connection.contentType ?: "application/octet-stream")
                    .put("length", body.size)
                    .toString().toByteArray()
                if (!sendControl(MelLinkV2Protocol.encode(MelLinkV2Protocol.RESPONSE_BEGIN, 0, request.streamId, 0, begin))) return
                var seq = 0
                var offset = 0
                val chunk = 150
                while (offset < body.size) {
                    val end = minOf(offset + chunk, body.size)
                    if (!sendBulk(MelLinkV2Protocol.encode(MelLinkV2Protocol.RESPONSE_DATA, 0, request.streamId, seq++, body.copyOfRange(offset, end)))) return
                    offset = end
                }
                sendControl(MelLinkV2Protocol.encode(MelLinkV2Protocol.RESPONSE_END, 0, request.streamId, seq))
            } finally {
                connection.disconnect()
            }
        } catch (error: Throwable) {
            sendError(request.streamId, "HTTP_RELAY")
            lastError.value = error.message.orEmpty()
        }
    }

    private fun sendCredit(streamId: Int, credits: Int) {
        val payload = byteArrayOf((credits and 0xff).toByte(), ((credits ushr 8) and 0xff).toByte())
        sendControl(MelLinkV2Protocol.encode(MelLinkV2Protocol.CREDIT, 0, streamId, 0, payload))
    }

    private fun sendError(streamId: Int, code: String) {
        sendControl(MelLinkV2Protocol.encode(MelLinkV2Protocol.ERROR, 0, streamId, 0, code.toByteArray()))
    }

    private fun sendControl(frame: ByteArray): Boolean = writeGatt(controlRx, frame, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)
    private fun sendBulk(frame: ByteArray): Boolean = writeGatt(bulkRx, frame, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)

    private fun writeGatt(characteristic: BluetoothGattCharacteristic?, value: ByteArray, writeType: Int): Boolean {
        val client = gatt ?: return false
        val target = characteristic ?: return false
        if (!hasBlePermissions()) return false
        return if (Build.VERSION.SDK_INT >= 33) {
            client.writeCharacteristic(target, value, writeType) == BluetoothGatt.GATT_SUCCESS
        } else {
            @Suppress("DEPRECATION")
            run {
                target.writeType = writeType
                target.value = value
                client.writeCharacteristic(target)
            }
        }
    }

    private fun failAndReconnect(client: BluetoothGatt, reason: String) {
        lastError.value = reason
        state.value = "ERREUR V2"
        runCatching { if (hasBlePermissions()) client.disconnect() }
    }

    private fun clearSession(reason: String) {
        miniReady.value = false
        protocolReady.value = false
        state.value = reason
        controlRx = null
        eventTx = null
        bulkRx = null
        synchronized(requests) { requests.clear() }
    }

    private fun resetPhysicalLink(reason: String) {
        stopScan()
        clearSession(reason)
        val client = gatt
        gatt = null
        connecting.set(false)
        if (client != null && hasBlePermissions()) {
            runCatching { client.disconnect() }
            runCatching { client.close() }
        }
    }

    private fun scheduleReconnect() {
        if (isDestroyedCompat()) return
        reconnectAttempt = (reconnectAttempt + 1).coerceAtMost(6)
        val delay = minOf(15_000L, 500L * (1L shl reconnectAttempt))
        state.value = "RECONNEXION V2"
        handler.postDelayed({ startDiscovery() }, delay)
    }

    private fun isDestroyedCompat(): Boolean = executor.isShutdown

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "MEL MINI V2", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Liaison Bluetooth MEL MINI"
                }
            )
        }
    }
}
