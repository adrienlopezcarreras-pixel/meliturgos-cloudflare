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
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.os.ParcelUuid
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentHashMap
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
    private val requests = ConcurrentHashMap<String, PendingRequest>()
    private val mtus = ConcurrentHashMap<String, Int>()
    private val subscribed = ConcurrentHashMap<String, Boolean>()
    private val notificationAck = ArrayBlockingQueue<Int>(1)

    private var bluetoothManager: BluetoothManager? = null
    private var adapter: BluetoothAdapter? = null
    private var gattServer: BluetoothGattServer? = null
    private var txCharacteristic: BluetoothGattCharacteristic? = null
    private var advertiseCallback: AdvertiseCallback? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
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
            bridgeState.value = "RECONNEXION MINI…"
            stopAdvertising()
            runCatching { gattServer?.close() }
            gattServer = null
            txCharacteristic = null
            requests.clear()
            mtus.clear()
            subscribed.clear()
            android.os.Handler(mainLooper).postDelayed({ startBridge() }, 250L)
        } else if (gattServer == null) {
            startBridge()
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopAdvertising()
        runCatching { gattServer?.close() }
        gattServer = null
        bridgeState.value = "OFF"
        executor.shutdownNow()
        super.onDestroy()
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
            BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_INDICATE or BluetoothGattCharacteristic.PROPERTY_READ,
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
                subscribed[device.address] = false
                bridgeState.value = "MINI LI├ëE ┬À INITIALISATION CANAL"
            } else {
                bridgeState.value = if (adapter?.isEnabled == true) "PR├èT" else "BLUETOOTH OFF"
                requests.remove(device.address)
                mtus.remove(device.address)
                subscribed.remove(device.address)
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
                    value
                )
            }
            if (validCccd) {
                @Suppress("DEPRECATION")
                descriptor.value = value.copyOf()
                val enabled = value.contentEquals(BluetoothGattDescriptor.ENABLE_INDICATION_VALUE) ||
                    value.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                subscribed[device.address] = enabled
                if (enabled) {
                    bridgeState.value = "MINI CONNECT├ëE ┬À RELAIS PR├èT"
                    Log.i(TAG, "MINI BLE response channel ready ${device.address}")
                }
            }
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

    private fun relay(device: BluetoothDevice, request: PendingRequest) {
        // The MINI uses /manifest only as its first authenticated liveness check.
        // Serving this tiny manifest locally avoids blocking the BLE link on the
        // firmware-manifest R2 lookup; real heartbeat/chat/voice traffic still
        // traverses MEL over the phone's Internet connection immediately after.
        if (request.method == "GET" && request.path == "/api/device/v1/manifest") {
            val body = JSONObject()
                .put("ok", true)
                .put("device_id", request.deviceId)
                .put("protocol_version", "1.0")
                .put("bridge", "android")
                .put("bridge_version", BuildConfig.VERSION_NAME)
                .put("firmware", JSONObject().put("available", false))
                .toString()
                .toByteArray(Charsets.UTF_8)
            bridgeState.value = "MINI CONNECTÉE · INTERNET OK"
            Log.i(TAG, "MEL relay local manifest -> 200")
            val meta = JSONObject()
                .put("status", 200)
                .put("contentType", "application/json")
                .put("length", body.size)
            if (!sendJsonFrame(device, OP_RESPONSE_BEGIN, request.id, meta)) return
            if (body.isNotEmpty() && !sendFrame(device, packet(OP_RESPONSE_BODY, request.id, body))) return
            sendFrame(device, packet(OP_RESPONSE_END, request.id, byteArrayOf()))
            return
        }

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
            bridgeState.value = "MINI CONNECT├ëE ┬À INTERNET ERREUR"
            Log.e(TAG, "MEL relay open failed ${request.method} ${request.path}", it)
            sendError(device, request.id, "NETWORK_OPEN")
            return
        }

        try {
            val status = connection.responseCode
            bridgeState.value = "MINI CONNECT├ëE ┬À INTERNET OK"
            Log.i(TAG, "MEL relay HTTP ${request.method} ${request.path} -> $status")
            val contentType = connection.contentType ?: "application/octet-stream"
            val contentLength = connection.contentLengthLong.coerceAtLeast(-1L)
            val meta = JSONObject()
                .put("status", status)
                .put("contentType", contentType)
                .put("length", contentLength)
            if (!sendJsonFrame(device, OP_RESPONSE_BEGIN, request.id, meta)) return
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
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
            bridgeState.value = "MINI CONNECT├ëE ┬À INTERNET ERREUR"
            Log.e(TAG, "Relay failed ${request.method} ${request.path}", error)
            sendError(device, request.id, "NETWORK_READ")
        } finally {
            connection.disconnect()
        }
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
        val server = gattServer ?: return false
        val tx = txCharacteristic ?: return false
        notificationAck.clear()
        val queued = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            server.notifyCharacteristicChanged(device, tx, false, frame) == BluetoothGatt.GATT_SUCCESS
        } else {
            @Suppress("DEPRECATION")
            tx.value = frame
            @Suppress("DEPRECATION")
            server.notifyCharacteristicChanged(device, tx, false)
        }
        if (!queued) return false
        return notificationAck.poll(5, TimeUnit.SECONDS) == BluetoothGatt.GATT_SUCCESS
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
