package fr.veriteinterdite.mel

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.os.ParcelUuid
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.util.TimeZone
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * BLE transport used by MINI when no 2.4 GHz Wi-Fi is available.
 *
 * This is deliberately not a generic Internet proxy: it only relays authenticated
 * MEL device API calls to MEL_BASE_URL. The MINI keeps its own device token.
 */
class MelBleBridgeService : Service() {
    companion object {
        private const val TAG = "MelBleBridge"
        private const val CHANNEL_ID = "mel_mobile_bridge"
        private const val NOTIFICATION_ID = 604
        private const val MAX_REQUEST_BYTES = 512 * 1024

        val SERVICE_UUID: UUID = UUID.fromString("0000abf0-0000-1000-8000-00805f9b34fb")
        val RX_UUID: UUID = UUID.fromString("0000abf1-0000-1000-8000-00805f9b34fb")
        val TX_UUID: UUID = UUID.fromString("0000abf2-0000-1000-8000-00805f9b34fb")
        private val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        private const val OP_BEGIN = 0x01
        private const val OP_BODY = 0x02
        private const val OP_END = 0x03
        private const val OP_PING = 0x04
        private const val OP_RESPONSE_BEGIN = 0x11
        private const val OP_RESPONSE_BODY = 0x12
        private const val OP_RESPONSE_END = 0x13
        private const val OP_ERROR = 0x1f

        const val ACTION_RESTART = "fr.veriteinterdite.mel.action.RESTART_MINI_BRIDGE"
        val bridgeState = MutableStateFlow("OFF")
        val miniLinkReady = MutableStateFlow(false)
        val phoneInternetAvailable = MutableStateFlow(false)
        val internetReady = MutableStateFlow(false)
        val miniPairingComplete = MutableStateFlow(false)
        val wakeProfileRevision = MutableStateFlow(0)
    }

    private data class PendingRequest(
        val id: Int,
        val method: String,
        val path: String,
        val contentType: String,
        val token: String,
        val deviceId: String,
        val expectedBytes: Int,
        val body: ByteArrayOutputStream = ByteArrayOutputStream()
    )

    private val executor = Executors.newSingleThreadExecutor()
    private val diagExecutor = Executors.newSingleThreadExecutor()
    private val requests = ConcurrentHashMap<String, PendingRequest>()
    private val connectedAtMs = ConcurrentHashMap<String, Long>()
    private val mtus = ConcurrentHashMap<String, Int>()
    private val subscribed = ConcurrentHashMap<String, Boolean>()
    private val pullFrames = ConcurrentHashMap<String, ConcurrentLinkedQueue<ByteArray>>()
    private val latestResponseIds = ConcurrentHashMap<String, Int>()
    private val notificationAck = ArrayBlockingQueue<Int>(1)

    private var bluetoothManager: BluetoothManager? = null
    private var adapter: BluetoothAdapter? = null
    private var gattServer: BluetoothGattServer? = null
    private var txCharacteristic: BluetoothGattCharacteristic? = null
    private var advertiseCallback: AdvertiseCallback? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallbackRegistered = false

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            refreshPhoneInternetState()
        }

        override fun onLost(network: Network) {
            refreshPhoneInternetState()
        }

        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            refreshPhoneInternetState()
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        wakeLock = getSystemService(PowerManager::class.java)
            ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MEL:BleBridge")
            ?.apply { acquire() }
        miniLinkReady.value = false
        phoneInternetAvailable.value = false
        internetReady.value = false
        connectivityManager = getSystemService(ConnectivityManager::class.java)
        registerNetworkWatch()
        miniPairingComplete.value = getSharedPreferences("mel_mobile_bridge", MODE_PRIVATE)
            .getBoolean("mini_pairing_complete", false)
        bridgeState.value = "D├ëMARRAGE"
        startForeground(
            NOTIFICATION_ID,
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_mel_avatar)
                .setContentTitle("MEL Mobile")
                .setContentText("Pont Bluetooth pr├¬t pour la MINI")
                .setOngoing(true)
                .setSilent(true)
                .build()
        )
        startBridge()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_RESTART) {
            miniLinkReady.value = false
            internetReady.value = false
            bridgeState.value = "RECONNEXION MINI…"
            stopAdvertising()
            runCatching { gattServer?.close() }
            gattServer = null
            txCharacteristic = null
            requests.clear()
            mtus.clear()
            subscribed.clear()
            pullFrames.clear()
            latestResponseIds.clear()
            android.os.Handler(mainLooper).postDelayed({ startBridge() }, 250L)
        } else if (gattServer == null) {
            startBridge()
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        unregisterNetworkWatch()
        stopAdvertising()
        runCatching { gattServer?.close() }
        gattServer = null
        miniLinkReady.value = false
        phoneInternetAvailable.value = false
        internetReady.value = false
        bridgeState.value = "OFF"
        if (wakeLock?.isHeld == true) wakeLock?.release()
        wakeLock = null
        executor.shutdownNow()
        diagExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun registerNetworkWatch() {
        val cm = connectivityManager ?: return
        if (networkCallbackRegistered) return
        runCatching {
            cm.registerDefaultNetworkCallback(networkCallback)
            networkCallbackRegistered = true
        }.onFailure {
            Log.w(TAG, "Network callback registration failed: ${it.message}")
        }
        refreshPhoneInternetState()
    }

    private fun unregisterNetworkWatch() {
        val cm = connectivityManager ?: return
        if (!networkCallbackRegistered) return
        runCatching { cm.unregisterNetworkCallback(networkCallback) }
        networkCallbackRegistered = false
    }

    private fun refreshPhoneInternetState() {
        val cm = connectivityManager ?: return
        val active = cm.activeNetwork
        val caps = active?.let { cm.getNetworkCapabilities(it) }
        val available = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        phoneInternetAvailable.value = available
        if (!available) {
            internetReady.value = false
            if (miniLinkReady.value) bridgeState.value = "MINI CONNECTÉE · TÉLÉPHONE HORS LIGNE"
        } else if (miniLinkReady.value && !internetReady.value) {
            bridgeState.value = "MINI CONNECTÉE · TÉLÉPHONE EN LIGNE · MEL À VALIDER"
        }
        Log.i(TAG, "Phone Internet validated=$available miniLink=${miniLinkReady.value} melInternet=${internetReady.value}")
    }

    private fun rememberMiniPairingComplete() {
        if (miniPairingComplete.value) return
        miniPairingComplete.value = true
        getSharedPreferences("mel_mobile_bridge", MODE_PRIVATE)
            .edit()
            .putBoolean("mini_pairing_complete", true)
            .apply()
        Log.i(TAG, "MINI pairing persisted; future reconnects are automatic")
    }

    private fun hasBluetoothPermissions(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_ADVERTISE) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    }

    private fun startBridge() {
        if (!hasBluetoothPermissions()) {
            bridgeState.value = "AUTORISATION REQUISE"
            Log.w(TAG, "Bluetooth permissions missing")
            return
        }
        bluetoothManager = getSystemService(BluetoothManager::class.java)
        adapter = bluetoothManager?.adapter
        val activeAdapter = adapter
        if (activeAdapter == null) {
            bridgeState.value = "BLUETOOTH INDISPONIBLE"
            Log.w(TAG, "BLE adapter unavailable")
            return
        }
        if (!activeAdapter.isEnabled) {
            bridgeState.value = "BLUETOOTH OFF"
            Log.w(TAG, "BLE adapter disabled")
            return
        }

        val manager = bluetoothManager ?: return
        gattServer = manager.openGattServer(this, gattCallback)
        val server = gattServer ?: return

        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        val rx = BluetoothGattCharacteristic(
            RX_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        val tx = BluetoothGattCharacteristic(
            TX_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        tx.addDescriptor(
            BluetoothGattDescriptor(
                CCCD_UUID,
                BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
            )
        )
        service.addCharacteristic(rx)
        service.addCharacteristic(tx)
        txCharacteristic = tx
        bridgeState.value = "INITIALISATION MEL"
        if (!server.addService(service)) {
            bridgeState.value = "ERREUR SERVICE BLE"
            Log.e(TAG, "Unable to queue MEL GATT service")
            return
        }
        Log.i(TAG, "MEL GATT service queued; waiting for onServiceAdded")
    }

    private fun startAdvertising() {
        if (!hasBluetoothPermissions()) return
        val activeAdapter = adapter ?: return
        val advertiser = activeAdapter.bluetoothLeAdvertiser ?: return
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .setTimeout(0)
            .build()
        val data = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .setIncludeDeviceName(false)
            .build()
        val callback = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                bridgeState.value = "PR├èT"
                Log.i(TAG, "MEL Mobile advertising started")
            }
            override fun onStartFailure(errorCode: Int) {
                bridgeState.value = "ERREUR BLE $errorCode"
                Log.e(TAG, "MEL Mobile advertising failed code=$errorCode")
            }
        }
        advertiseCallback = callback
        advertiser.startAdvertising(settings, data, callback)
    }

    private fun stopAdvertising() {
        if (!hasBluetoothPermissions()) return
        val callback = advertiseCallback ?: return
        runCatching { adapter?.bluetoothLeAdvertiser?.stopAdvertising(callback) }
        advertiseCallback = null
    }

    private fun publishBleDiagnostic(status: Int, newState: Int, durationMs: Long?) {
        val seconds = durationMs?.coerceAtLeast(0L)?.div(1000L)
        val phase = if (newState == BluetoothGatt.STATE_CONNECTED) {
            "BLE_C st=$status ns=$newState"
        } else {
            "BLE_D st=$status ns=$newState d=${seconds ?: -1}s"
        }
        diagExecutor.execute {
            runCatching {
                val rawAndroidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
                val androidDeviceId = "android-" + (rawAndroidId ?: "unknown").take(64)
                val vault = TokenVault(this@MelBleBridgeService)
                if (vault.load().isNullOrBlank()) return@execute
                MelApiClient(BuildConfig.MEL_BASE_URL, androidDeviceId, vault)
                    .heartbeat(sdkInt = Build.VERSION.SDK_INT, phase = phase)
                Log.i(TAG, "BLE diagnostic published $phase version=${BuildConfig.VERSION_NAME}")
            }.onFailure { error ->
                Log.w(TAG, "BLE diagnostic publish failed: ${error.message}")
            }
        }
    }

    private val gattCallback = object : BluetoothGattServerCallback() {
        override fun onServiceAdded(status: Int, service: BluetoothGattService) {
            if (service.uuid != SERVICE_UUID) return
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.i(TAG, "MEL GATT service ready; starting advertising")
                startAdvertising()
            } else {
                bridgeState.value = "ERREUR SERVICE BLE $status"
                Log.e(TAG, "MEL GATT service add failed status=$status")
            }
        }

        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            Log.i(TAG, "MINI BLE state=${device.address} status=$status newState=$newState")
            if (newState == BluetoothGatt.STATE_CONNECTED) {
                connectedAtMs[device.address] = System.currentTimeMillis()
                subscribed[device.address] = false
                miniLinkReady.value = false
                internetReady.value = false
                bridgeState.value = "MINI LI├ëE ┬À INITIALISATION CANAL"
                publishBleDiagnostic(status, newState, null)
            } else {
                val started = connectedAtMs.remove(device.address)
                val duration = started?.let { System.currentTimeMillis() - it }
                publishBleDiagnostic(status, newState, duration)
                miniLinkReady.value = false
                internetReady.value = false
                bridgeState.value = if (adapter?.isEnabled == true) "PR├èT" else "BLUETOOTH OFF"
                requests.remove(device.address)
                mtus.remove(device.address)
                subscribed.remove(device.address)
                pullFrames.remove(device.address)
                latestResponseIds.remove(device.address)
            }
        }

        override fun onMtuChanged(device: BluetoothDevice, mtu: Int) {
            mtus[device.address] = mtu.coerceIn(23, 517)
            Log.i(TAG, "MINI BLE MTU=${mtus[device.address]}")
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            descriptor: BluetoothGattDescriptor,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray
        ) {
            val validCccd = descriptor.uuid == CCCD_UUID && !preparedWrite && offset == 0
            if (responseNeeded && hasBluetoothPermissions()) {
                gattServer?.sendResponse(
                    device,
                    requestId,
                    if (validCccd) BluetoothGatt.GATT_SUCCESS else BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED,
                    offset,
                    null
                )
            }
            if (validCccd) {
                @Suppress("DEPRECATION")
                descriptor.value = value.copyOf()
                val enabled = value.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                subscribed[device.address] = enabled
                miniLinkReady.value = enabled
                if (!enabled) internetReady.value = false
                if (enabled) {
                    refreshPhoneInternetState()
                    bridgeState.value = if (phoneInternetAvailable.value)
                        "MINI CONNECTÉE · RELAIS INTERNET PRÊT"
                    else
                        "MINI CONNECTÉE · TÉLÉPHONE HORS LIGNE"
                    Log.i(TAG, "MINI BLE response channel ready ${device.address}")
                } else {
                    bridgeState.value = "MINI LI├ëE ┬À CANAL INACTIF"
                }
            }
        }

        override fun onDescriptorReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            descriptor: BluetoothGattDescriptor
        ) {
            if (!hasBluetoothPermissions()) return
            val valid = descriptor.uuid == CCCD_UUID && offset == 0
            @Suppress("DEPRECATION")
            val value = if (valid) (descriptor.value ?: BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE) else null
            gattServer?.sendResponse(
                device,
                requestId,
                if (valid) BluetoothGatt.GATT_SUCCESS else BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED,
                offset,
                value
            )
        }

        override fun onExecuteWrite(device: BluetoothDevice, requestId: Int, execute: Boolean) {
            if (!hasBluetoothPermissions()) return
            // Prepared writes are intentionally unsupported by the MEL bridge.
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, 0, null)
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray
        ) {
            val valid = characteristic.uuid == RX_UUID && !preparedWrite && offset == 0
            val result = if (valid) BluetoothGatt.GATT_SUCCESS else BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED
            if (responseNeeded && hasBluetoothPermissions()) {
                gattServer?.sendResponse(device, requestId, result, 0, null)
            }
            if (!valid || value.size < 5) return
            handleFrame(device, value)
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic
        ) {
            if (!hasBluetoothPermissions()) return
            if (characteristic.uuid != TX_UUID || offset != 0) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, offset, null)
                return
            }
            val frame = pullFrames.computeIfAbsent(device.address) { ConcurrentLinkedQueue() }.poll()
                ?: byteArrayOf(0, 0, 0, 0, 0)
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, frame)
        }

        override fun onNotificationSent(device: BluetoothDevice, status: Int) {
            notificationAck.offer(status)
        }
    }

    private fun handleFrame(device: BluetoothDevice, frame: ByteArray) {
        val op = frame[0].toInt() and 0xff
        val requestId = ByteBuffer.wrap(frame, 1, 4).order(ByteOrder.LITTLE_ENDIAN).int
        val payload = frame.copyOfRange(5, frame.size)
        when (op) {
            OP_BEGIN -> beginRequest(device, requestId, payload)
            OP_BODY -> appendBody(device, requestId, payload)
            OP_END -> finishRequest(device, requestId)
            OP_PING -> executor.execute {
                latestResponseIds[device.address] = requestId
                pullFrames.computeIfAbsent(device.address) { ConcurrentLinkedQueue() }.clear()
                sendJsonFrame(device, OP_RESPONSE_BEGIN, requestId, JSONObject().put("status", 200).put("contentType", "application/json").put("length", 0))
                sendFrame(device, packet(OP_RESPONSE_END, requestId, byteArrayOf()))
            }
        }
    }

    private fun beginRequest(device: BluetoothDevice, requestId: Int, payload: ByteArray) {
        runCatching {
            val meta = JSONObject(payload.toString(Charsets.UTF_8))
            val method = meta.optString("m", meta.optString("method", "POST")).uppercase()
            val path = meta.optString("p", meta.optString("path"))
            val contentType = meta.optString("c", meta.optString("contentType", "application/json"))
            val token = meta.optString("t", meta.optString("token"))
            val deviceId = meta.optString("d", meta.optString("deviceId"))
            val length = if (meta.has("l")) meta.optInt("l", 0) else meta.optInt("length", 0)
            require(method == "POST" || method == "GET") { "METHOD" }
            require(path.startsWith("/api/device/v1/")) { "PATH" }
            require(!path.contains("..")) { "PATH" }
            require((path == "/api/device/v1/pair" && token.isEmpty()) || token.length in 16..4096) { "TOKEN" }
            require(deviceId.length in 3..128) { "DEVICE_ID" }
            require(length in 0..MAX_REQUEST_BYTES) { "SIZE" }
            latestResponseIds[device.address] = requestId
            pullFrames.computeIfAbsent(device.address) { ConcurrentLinkedQueue() }.clear()
            requests[device.address] = PendingRequest(requestId, method, path, contentType, token, deviceId, length)
        }.onFailure {
            executor.execute { sendError(device, requestId, "BAD_REQUEST") }
        }
    }

    private fun appendBody(device: BluetoothDevice, requestId: Int, payload: ByteArray) {
        val request = requests[device.address] ?: return
        if (request.id != requestId || request.body.size() + payload.size > MAX_REQUEST_BYTES) {
            requests.remove(device.address)
            executor.execute { sendError(device, requestId, "BODY_TOO_LARGE") }
            return
        }
        request.body.write(payload)
    }

    private fun finishRequest(device: BluetoothDevice, requestId: Int) {
        val request = requests.remove(device.address) ?: return
        if (request.id != requestId) return
        if (request.expectedBytes != request.body.size()) {
            executor.execute { sendError(device, requestId, "BODY_LENGTH") }
            return
        }
        executor.execute { relay(device, request) }
    }

    private fun readFully(input: InputStream, target: ByteArray, length: Int = target.size): Boolean {
        var offset = 0
        while (offset < length) {
            val count = input.read(target, offset, length - offset)
            if (count < 0) return false
            if (count == 0) continue
            offset += count
        }
        return true
    }

    private fun le16(bytes: ByteArray, offset: Int): Int =
        (bytes[offset].toInt() and 0xff) or ((bytes[offset + 1].toInt() and 0xff) shl 8)

    private fun le32(bytes: ByteArray, offset: Int): Long =
        (bytes[offset].toLong() and 0xffL) or
            ((bytes[offset + 1].toLong() and 0xffL) shl 8) or
            ((bytes[offset + 2].toLong() and 0xffL) shl 16) or
            ((bytes[offset + 3].toLong() and 0xffL) shl 24)

    private fun skipFully(input: InputStream, count: Long): Boolean {
        var remaining = count
        val scratch = ByteArray(256)
        while (remaining > 0) {
            val take = minOf(scratch.size.toLong(), remaining).toInt()
            val n = input.read(scratch, 0, take)
            if (n < 0) return false
            if (n == 0) continue
            remaining -= n
        }
        return true
    }

    private fun readWav48kPcmDataSize(input: InputStream): Long? {
        val riff = ByteArray(12)
        if (!readFully(input, riff)) return null
        if (!riff.copyOfRange(0, 4).contentEquals("RIFF".toByteArray()) ||
            !riff.copyOfRange(8, 12).contentEquals("WAVE".toByteArray())) return null

        var haveFmt = false
        repeat(12) {
            val header = ByteArray(8)
            if (!readFully(input, header)) return null
            val size = le32(header, 4)
            val id = header.copyOfRange(0, 4).toString(Charsets.US_ASCII)
            val padded = (size and 1L) != 0L

            if (id == "fmt ") {
                if (size < 16L || size > 64L) return null
                val fmt = ByteArray(size.toInt())
                if (!readFully(input, fmt)) return null
                if (padded && !skipFully(input, 1)) return null
                val format = le16(fmt, 0)
                val channels = le16(fmt, 2)
                val rate = le32(fmt, 4)
                val bits = le16(fmt, 14)
                if (format != 1 || channels != 1 || rate != 48000L || bits != 16) return null
                haveFmt = true
            } else if (id == "data") {
                if (!haveFmt || size <= 0L || padded || size > 48000L * 2L * 180L) return null
                return size
            } else {
                if (size > 4096L || !skipFully(input, size + if (padded) 1L else 0L)) return null
            }
        }
        return null
    }

    private fun relayTtsWav48kTo16k(
        device: BluetoothDevice,
        requestId: Int,
        status: Int,
        input: InputStream
    ): Boolean {
        val dataBytes = readWav48kPcmDataSize(input) ?: return false
        val samples48k = dataBytes / 2L
        val samples16k = (samples48k + 2L) / 3L
        val outputBytes = samples16k * 2L
        val meta = JSONObject()
            .put("status", status)
            .put("contentType", "application/octet-stream")
            .put("length", outputBytes)
            .put("audioFormat", "pcm-s16le")
            .put("audioRate", 16000)
            .put("audioChannels", 1)
        if (!sendJsonFrame(device, OP_RESPONSE_BEGIN, requestId, meta)) return false

        val mtu = mtus[device.address] ?: 247
        val maxPayload = (mtu - 8).coerceIn(12, 500)
        val inputBuffer = ByteArray(maxPayload * 3)
        val outputBuffer = ByteArray(maxPayload)
        var remaining = dataBytes
        var pendingLow: Byte? = null
        var samplePhase = 0

        while (remaining > 0) {
            val want = minOf(inputBuffer.size.toLong(), remaining).toInt()
            val count = input.read(inputBuffer, 0, want)
            if (count < 0) return false
            if (count == 0) continue
            remaining -= count

            var src = 0
            var dst = 0
            if (pendingLow != null) {
                if (samplePhase == 0 && dst + 2 <= outputBuffer.size) {
                    outputBuffer[dst++] = pendingLow!!
                    outputBuffer[dst++] = inputBuffer[0]
                }
                samplePhase = (samplePhase + 1) % 3
                pendingLow = null
                src = 1
            }
            while (src + 1 < count) {
                if (samplePhase == 0 && dst + 2 <= outputBuffer.size) {
                    outputBuffer[dst++] = inputBuffer[src]
                    outputBuffer[dst++] = inputBuffer[src + 1]
                }
                samplePhase = (samplePhase + 1) % 3
                src += 2
            }
            if (src < count) pendingLow = inputBuffer[src]
            if (dst > 0 && !sendFrame(device, packet(OP_RESPONSE_BODY, requestId, outputBuffer.copyOf(dst)))) return false
        }
        return pendingLow == null
    }

    private fun relay(device: BluetoothDevice, request: PendingRequest) {
        // The MINI uses /manifest only as its first authenticated liveness check.
        // Serving this tiny manifest locally avoids blocking the BLE link on the
        // firmware-manifest R2 lookup; real heartbeat/chat/voice traffic still
        // traverses MEL over the phone's Internet connection immediately after.
        if (request.method == "POST" && request.path == "/api/device/v1/wake-profile/import") {
            val imported = runCatching {
                val raw = request.body.toByteArray().toString(Charsets.UTF_8)
                WakePhraseProfileStore(this).importProfile(JSONObject(raw))
            }.getOrDefault(false)
            val status = if (imported) 200 else 400
            val body = JSONObject()
                .put("ok", imported)
                .put("restored", imported)
                .put("source", "mini-nvs")
                .toString()
                .toByteArray(Charsets.UTF_8)
            if (imported) wakeProfileRevision.value = wakeProfileRevision.value + 1
            Log.i(TAG, "MEL relay wake profile restore from MINI -> $status")
            val meta = JSONObject()
                .put("status", status)
                .put("contentType", "application/json")
                .put("length", body.size)
            if (!sendJsonFrame(device, OP_RESPONSE_BEGIN, request.id, meta)) return
            if (!sendBodyFrames(device, request.id, body)) return
            sendFrame(device, packet(OP_RESPONSE_END, request.id, byteArrayOf()))
            return
        }

        if (request.method == "POST" && request.path == "/api/device/v1/render/card") {
            val rendered = runCatching {
                val payload = JSONObject(request.body.toByteArray().toString(Charsets.UTF_8))
                renderMiniCardMimg(
                    payload.optString("title", "Résultat MEL"),
                    payload.optString("snippet", ""),
                    payload.optString("url", ""),
                    payload.optString("image_url", "")
                )
            }.getOrElse {
                Log.e(TAG, "MINI card render failed", it)
                null
            }
            if (rendered == null) {
                sendError(device, request.id, "RENDER_CARD_FAILED")
                return
            }
            val meta = JSONObject()
                .put("status", 200)
                .put("contentType", "application/x-mel-mimg")
                .put("length", rendered.size)
            if (!sendJsonFrame(device, OP_RESPONSE_BEGIN, request.id, meta)) return
            if (!sendBodyFrames(device, request.id, rendered)) return
            sendFrame(device, packet(OP_RESPONSE_END, request.id, byteArrayOf()))
            return
        }

        if (request.method == "GET" && request.path == "/api/device/v1/wake-profile") {
            val nowMs = System.currentTimeMillis()
            val zone = TimeZone.getDefault()
            val wakeStore = WakePhraseProfileStore(this)
            val body = wakeStore
                .load()
                .put("reset_requested", wakeStore.resetRequested())
                .put("device_id", request.deviceId)
                .put("epoch_ms", nowMs)
                .put("utc_offset_seconds", zone.getOffset(nowMs) / 1000)
                .put("timezone", zone.id)
                .toString()
                .toByteArray(Charsets.UTF_8)
            Log.i(TAG, "MEL relay local wake profile -> 200")
            val meta = JSONObject()
                .put("status", 200)
                .put("contentType", "application/json")
                .put("length", body.size)
            if (!sendJsonFrame(device, OP_RESPONSE_BEGIN, request.id, meta)) return
            if (!sendBodyFrames(device, request.id, body)) return
            sendFrame(device, packet(OP_RESPONSE_END, request.id, byteArrayOf()))
            return
        }

        // Manifest requests must reach the real MEL backend. BLE connectivity alone
        // is not proof of Internet access; returning a local 200 here made MINI
        // believe it was online even when the phone could not reach MEL.
        val connection = runCatching {
            val url = URL(BuildConfig.MEL_BASE_URL.trimEnd('/') + request.path)
            (url.openConnection() as HttpURLConnection).apply {
                requestMethod = request.method
                connectTimeout = 15_000
                readTimeout = 90_000
                if (request.token.isNotEmpty()) setRequestProperty("Authorization", "Bearer ${request.token}")
                setRequestProperty("X-MEL-Device-ID", request.deviceId)
                setRequestProperty("X-MEL-Mobile-Bridge", BuildConfig.VERSION_NAME)
                if (request.path == "/api/device/v1/pair") {
                    val androidToken = TokenVault(this@MelBleBridgeService).load()
                    val rawAndroidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
                    val androidDeviceId = "android-" + (rawAndroidId ?: "unknown").take(64)
                    if (!androidToken.isNullOrBlank()) {
                        setRequestProperty("X-MEL-Android-Device-ID", androidDeviceId)
                        setRequestProperty("X-MEL-Android-Token", androidToken)
                    }
                }
                setRequestProperty("Accept", "*/*")
                if (request.body.size() > 0) {
                    doOutput = true
                    setRequestProperty("Content-Type", request.contentType)
                    outputStream.use { it.write(request.body.toByteArray()) }
                }
            }
        }.getOrElse {
            internetReady.value = false
            bridgeState.value = "MINI CONNECT├ëE ┬À INTERNET ERREUR"
            Log.e(TAG, "MEL relay open failed ${request.method} ${request.path}", it)
            sendError(device, request.id, "NETWORK_OPEN")
            return
        }

        try {
            val status = connection.responseCode
            val success = status in 200..299
            if (success && (
                    request.path == "/api/device/v1/pair" ||
                    (request.path.startsWith("/api/device/v1/") && request.token.isNotEmpty())
                )
            ) {
                rememberMiniPairingComplete()
            }
            internetReady.value = miniLinkReady.value && success
            bridgeState.value = when {
                internetReady.value -> "MINI CONNECTÉE · INTERNET OK"
                request.path == "/api/device/v1/pair" && (status == 401 || status == 403) ->
                    "MINI CONNECTÉE · APPLI MEL À RÉAPPAIRER"
                else -> "MINI CONNECTÉE · MEL HTTP $status"
            }
            Log.i(TAG, "MEL relay HTTP ${request.method} ${request.path} -> $status")
            val contentType = connection.contentType ?: "application/octet-stream"
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val downsampleTts = status in 200..299 && request.path == "/api/device/v1/voice/tts"

            if (downsampleTts && stream != null) {
                val ok = stream.use { input -> relayTtsWav48kTo16k(device, request.id, status, input) }
                if (!ok) {
                    Log.e(TAG, "MEL relay TTS WAV parse/downsample failed")
                    sendError(device, request.id, "TTS_WAV")
                    return
                }
                sendFrame(device, packet(OP_RESPONSE_END, request.id, byteArrayOf()))
                return
            }

            val rawContentLength = connection.contentLengthLong.coerceAtLeast(-1L)
            val meta = JSONObject()
                .put("status", status)
                .put("contentType", contentType)
                .put("length", rawContentLength)
            if (!sendJsonFrame(device, OP_RESPONSE_BEGIN, request.id, meta)) return
            if (stream != null) {
                stream.use { input ->
                    val mtu = mtus[device.address] ?: 247
                    val maxPayload = (mtu - 8).coerceIn(12, 500)
                    val buffer = ByteArray(maxPayload)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        if (count == 0) continue
                        if (!sendFrame(device, packet(OP_RESPONSE_BODY, request.id, buffer.copyOf(count)))) return
                    }
                }
            }
            sendFrame(device, packet(OP_RESPONSE_END, request.id, byteArrayOf()))
        } catch (error: Throwable) {
            internetReady.value = false
            bridgeState.value = "MINI CONNECT├ëE ┬À INTERNET ERREUR"
            Log.e(TAG, "Relay failed ${request.method} ${request.path}", error)
            sendError(device, request.id, "NETWORK_READ")
        } finally {
            connection.disconnect()
        }
    }

    private fun renderMiniCardMimg(title: String, snippet: String, url: String, imageUrl: String): ByteArray {
        val width = 240
        val height = 240
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.rgb(7, 17, 31))

        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(248, 250, 252)
            textSize = 22f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(203, 213, 225)
            textSize = 16f
        }
        val urlPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(103, 232, 249)
            textSize = 12f
        }
        val rulePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(34, 211, 238)
            strokeWidth = 2f
        }

        val remote = fetchMiniCardImage(imageUrl)
        if (remote != null) {
            drawCenterCrop(canvas, remote, RectF(0f, 0f, width.toFloat(), 108f))
            remote.recycle()
            canvas.drawRect(0f, 100f, width.toFloat(), 116f, Paint().apply { color = Color.argb(150, 7, 17, 31) })
            var y = drawMiniWrappedText(canvas, title.ifBlank { "Résultat MEL" }, titlePaint, 14f, 136f, 212f, 2)
            y += 5f
            y = drawMiniWrappedText(canvas, snippet, bodyPaint, 14f, y, 212f, 3)
            drawMiniWrappedText(canvas, url, urlPaint, 14f, maxOf(y + 4f, 224f).coerceAtMost(232f), 212f, 1)
        } else {
            canvas.drawLine(14f, 14f, 226f, 14f, rulePaint)
            var y = drawMiniWrappedText(canvas, title.ifBlank { "Résultat MEL" }, titlePaint, 14f, 38f, 212f, 2)
            y += 8f
            y = drawMiniWrappedText(canvas, snippet, bodyPaint, 14f, y, 212f, 6)
            val urlY = maxOf(y + 10f, 205f)
            drawMiniWrappedText(canvas, url, urlPaint, 14f, urlY.coerceAtMost(222f), 212f, 2)
        }

        val pixelBytes = width * height * 2
        val out = ByteBuffer.allocate(12 + pixelBytes).order(ByteOrder.LITTLE_ENDIAN)
        out.put(byteArrayOf('M'.code.toByte(), 'I'.code.toByte(), 'M'.code.toByte(), 'G'.code.toByte()))
        out.putShort(width.toShort())
        out.putShort(height.toShort())
        out.putInt(pixelBytes)
        val row = IntArray(width)
        for (yy in 0 until height) {
            bitmap.getPixels(row, 0, width, 0, yy, width, 1)
            for (argb in row) {
                val r = (argb shr 16) and 0xff
                val g = (argb shr 8) and 0xff
                val b = argb and 0xff
                val rgb565 = ((r shr 3) shl 11) or ((g shr 2) shl 5) or (b shr 3)
                out.putShort(rgb565.toShort())
            }
        }
        bitmap.recycle()
        return out.array()
    }

    private fun fetchMiniCardImage(rawUrl: String): Bitmap? {
        val start = safeMiniImageUrl(rawUrl) ?: return null
        var current = start
        repeat(3) {
            val connection = (current.openConnection() as? HttpURLConnection) ?: return null
            try {
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 8_000
                connection.readTimeout = 12_000
                connection.setRequestProperty("Accept", "image/*")
                connection.setRequestProperty("User-Agent", "MEL-Android/${BuildConfig.VERSION_NAME}")
                val status = connection.responseCode
                if (status in 300..399) {
                    val next = connection.getHeaderField("Location") ?: return null
                    current = safeMiniImageUrl(URL(current, next).toString()) ?: return null
                    return@repeat
                }
                if (status !in 200..299) return null
                val contentType = connection.contentType.orEmpty().lowercase()
                if (!contentType.startsWith("image/")) return null
                val declared = connection.contentLengthLong
                if (declared > 3_000_000L) return null
                val bytes = ByteArrayOutputStream()
                connection.inputStream.use { input ->
                    val buffer = ByteArray(16 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        if (read == 0) continue
                        if (bytes.size() + read > 3_000_000) return null
                        bytes.write(buffer, 0, read)
                    }
                }
                val data = bytes.toByteArray()
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
                var sample = 1
                while (bounds.outWidth / sample > 720 || bounds.outHeight / sample > 720) sample *= 2
                val options = BitmapFactory.Options().apply { inSampleSize = sample }
                return BitmapFactory.decodeByteArray(data, 0, data.size, options)
            } finally {
                connection.disconnect()
            }
        }
        return null
    }

    private fun safeMiniImageUrl(rawUrl: String): URL? {
        if (rawUrl.isBlank()) return null
        val url = runCatching { URL(rawUrl.trim()) }.getOrNull() ?: return null
        if (!url.protocol.equals("https", ignoreCase = true) || url.userInfo != null) return null
        val host = url.host.trim().lowercase()
        if (host.isBlank() || host == "localhost" || host.endsWith(".local")) return null
        val addresses = runCatching { InetAddress.getAllByName(host).toList() }.getOrNull() ?: return null
        if (addresses.isEmpty() || addresses.any { address ->
                address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress || address.isSiteLocalAddress ||
                    address.hostAddress?.startsWith("100.64.") == true || address.hostAddress?.startsWith("169.254.") == true
            }) return null
        return url
    }

    private fun drawCenterCrop(canvas: Canvas, bitmap: Bitmap, dest: RectF) {
        val targetRatio = dest.width() / dest.height()
        val sourceRatio = bitmap.width.toFloat() / bitmap.height.toFloat()
        val src = if (sourceRatio > targetRatio) {
            val wanted = (bitmap.height * targetRatio).toInt().coerceAtLeast(1)
            val left = ((bitmap.width - wanted) / 2).coerceAtLeast(0)
            Rect(left, 0, (left + wanted).coerceAtMost(bitmap.width), bitmap.height)
        } else {
            val wanted = (bitmap.width / targetRatio).toInt().coerceAtLeast(1)
            val top = ((bitmap.height - wanted) / 2).coerceAtLeast(0)
            Rect(0, top, bitmap.width, (top + wanted).coerceAtMost(bitmap.height))
        }
        canvas.drawBitmap(bitmap, src, dest, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
    }

    private fun drawMiniWrappedText(
        canvas: Canvas,
        raw: String,
        paint: Paint,
        x: Float,
        startY: Float,
        maxWidth: Float,
        maxLines: Int
    ): Float {
        val text = raw.replace(Regex("\\s+"), " ").trim()
        if (text.isEmpty()) return startY
        val lineHeight = paint.fontSpacing.coerceAtLeast(paint.textSize + 3f)
        var remaining = text
        var y = startY
        var line = 0
        while (remaining.isNotEmpty() && line < maxLines) {
            var count = paint.breakText(remaining, true, maxWidth, null).coerceAtLeast(1)
            if (count < remaining.length) {
                val space = remaining.lastIndexOf(' ', count - 1)
                if (space > 0) count = space
            }
            var part = remaining.substring(0, count).trim()
            remaining = remaining.substring(count).trimStart()
            if (line == maxLines - 1 && remaining.isNotEmpty()) {
                while (part.length > 1 && paint.measureText(part + "…") > maxWidth) part = part.dropLast(1)
                part += "…"
                remaining = ""
            }
            canvas.drawText(part, x, y, paint)
            y += lineHeight
            line++
        }
        return y
    }

    private fun sendBodyFrames(device: BluetoothDevice, requestId: Int, body: ByteArray): Boolean {
        if (body.isEmpty()) return true
        val mtu = mtus[device.address] ?: 247
        val maxPayload = (mtu - 8).coerceIn(12, 500)
        var offset = 0
        while (offset < body.size) {
            val end = (offset + maxPayload).coerceAtMost(body.size)
            if (!sendFrame(device, packet(OP_RESPONSE_BODY, requestId, body.copyOfRange(offset, end)))) return false
            offset = end
        }
        return true
    }

    private fun sendError(device: BluetoothDevice, requestId: Int, code: String) {
        sendJsonFrame(device, OP_ERROR, requestId, JSONObject().put("error", code))
    }

    private fun sendJsonFrame(device: BluetoothDevice, op: Int, requestId: Int, json: JSONObject): Boolean {
        return sendFrame(device, packet(op, requestId, json.toString().toByteArray(Charsets.UTF_8)))
    }

    private fun packet(op: Int, requestId: Int, payload: ByteArray): ByteArray {
        val out = ByteBuffer.allocate(5 + payload.size).order(ByteOrder.LITTLE_ENDIAN)
        out.put(op.toByte())
        out.putInt(requestId)
        out.put(payload)
        return out.array()
    }

    private fun sendFrame(device: BluetoothDevice, frame: ByteArray): Boolean {
        if (!hasBluetoothPermissions()) return false
        if (gattServer == null || txCharacteristic == null) return false
        if (frame.size < 5) return false
        val responseId = ByteBuffer.wrap(frame, 1, 4).order(ByteOrder.LITTLE_ENDIAN).int
        val latestId = latestResponseIds[device.address]
        if (latestId != null && latestId != responseId) {
            Log.i(TAG, "Drop stale BLE response id=$responseId latest=$latestId")
            return false
        }
        val server = gattServer ?: return false
        val characteristic = txCharacteristic ?: return false
        if (subscribed[device.address] == true) {
            while (notificationAck.poll() != null) { }
            @Suppress("DEPRECATION")
            run { characteristic.value = frame.copyOf() }
            @Suppress("DEPRECATION")
            val queued = server.notifyCharacteristicChanged(device, characteristic, false)
            if (queued) {
                val status = notificationAck.poll(750, TimeUnit.MILLISECONDS)
                if (status == BluetoothGatt.GATT_SUCCESS) return true
                Log.w(TAG, "BLE push notify failed/timeout status=$status; falling back to pull")
            }
        }
        val queue = pullFrames.computeIfAbsent(device.address) { ConcurrentLinkedQueue() }
        queue.offer(frame.copyOf())
        return true
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "MEL Mobile", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Connexion itin├®rante de la MINI via Bluetooth"
                }
            )
        }
    }
}
