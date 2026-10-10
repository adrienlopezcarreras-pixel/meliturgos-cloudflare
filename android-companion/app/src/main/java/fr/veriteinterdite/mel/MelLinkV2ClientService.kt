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
import android.content.Context
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
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
import java.util.TimeZone
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
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
        val phoneInternetAvailable = MutableStateFlow(false)
        val internetReady = MutableStateFlow(false)
        val miniPairingComplete = MutableStateFlow(false)
        val wakeProfileRevision = MutableStateFlow(0)
        val lastError = MutableStateFlow("")

        // Compatibility names used by the existing UI during the V2 cutover.
        val bridgeState = state
        val miniLinkReady = miniReady
    }

    private data class IncomingRequest(
        val streamId: Int,
        val meta: JSONObject,
        val body: ByteArrayOutputStream = ByteArrayOutputStream(),
        var nextSeq: Int = 0
    )

    private data class IncomingAudio(
        val streamId: Int,
        val meta: JSONObject,
        val pcm16: ByteArrayOutputStream = ByteArrayOutputStream(),
        var nextSeq: Int = 0,
        var creditsConsumed: Int = 0
    )

    private var wakeLock: PowerManager.WakeLock? = null
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallbackRegistered = false
    @Volatile private var melSessionReady = false
    private var gatt: BluetoothGatt? = null
    private var controlRx: BluetoothGattCharacteristic? = null
    private var eventTx: BluetoothGattCharacteristic? = null
    private var bulkRx: BluetoothGattCharacteristic? = null
    private val connecting = AtomicBoolean(false)
    private val executor = Executors.newSingleThreadExecutor()
    private val bleWriter = Executors.newSingleThreadExecutor()
    private val writeAck = ArrayBlockingQueue<Int>(1)
    private val writeLock = Any()
    private val requests = HashMap<Int, IncomingRequest>()
    private val audioStreams = HashMap<Int, IncomingAudio>()
    private val outboundCredits = HashMap<Int, Semaphore>()
    private val cancelledOutbound = HashSet<Int>()
    private lateinit var mediaReceiver: MiniMediaReceiver
    private var scanActive = false
    private var reconnectAttempt = 0
    private var mtuRetryAttempted = false
    private val handler by lazy { android.os.Handler(mainLooper) }

    private val bondReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != BluetoothDevice.ACTION_BOND_STATE_CHANGED) return
            val device: BluetoothDevice? = if (Build.VERSION.SDK_INT >= 33) {
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
            }
            val client = gatt ?: return
            if (device == null || device.address != client.device.address) return
            when (intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.BOND_NONE)) {
                BluetoothDevice.BOND_BONDED -> beginMtuNegotiation(client)
                BluetoothDevice.BOND_NONE -> {
                    val previous = intent.getIntExtra(BluetoothDevice.EXTRA_PREVIOUS_BOND_STATE, BluetoothDevice.BOND_NONE)
                    if (previous == BluetoothDevice.BOND_BONDING) failAndReconnect(client, "BLE_PAIRING_REJECTED")
                }
            }
        }
    }

    private fun beginMtuNegotiation(client: BluetoothGatt) {
        if (gatt !== client || !hasBlePermissions()) return
        state.value = "NEGOCIATION V2 SECURISEE"
        val requested = runCatching { client.requestMtu(MelLinkV2Protocol.DEFAULT_MTU) }.getOrDefault(false)
        if (!requested) failAndReconnect(client, "MTU_REQUEST_FAILED")
    }



    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = refreshInternetState()
        override fun onLost(network: Network) = refreshInternetState()
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = refreshInternetState()
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        wakeLock = getSystemService(PowerManager::class.java)
            ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MEL:LinkV2")
            ?.apply { acquire() }
        connectivityManager = getSystemService(ConnectivityManager::class.java)
        mediaReceiver = MiniMediaReceiver(this)
        miniPairingComplete.value = getSharedPreferences("mel_link_v2", MODE_PRIVATE)
            .getBoolean("mini_pairing_complete", false)
        registerNetworkWatch()
        ContextCompat.registerReceiver(
            this, bondReceiver, IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED),
            ContextCompat.RECEIVER_EXPORTED
        )
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
        Thread {
            runCatching { MelMiniVoiceSynthesizer.warmup(applicationContext) }
                .onFailure { Log.w(TAG, "French MINI TTS warmup failed", it) }
        }.apply { name = "mel-mini-tts-warmup"; isDaemon = true }.start()
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
        bleWriter.shutdownNow()
        if (::mediaReceiver.isInitialized) mediaReceiver.close()
        unregisterNetworkWatch()
        runCatching { unregisterReceiver(bondReceiver) }
        miniReady.value = false
        protocolReady.value = false
        phoneInternetAvailable.value = false
        melSessionReady = false
        internetReady.value = false
        state.value = "OFF"
        if (wakeLock?.isHeld == true) wakeLock?.release()
        wakeLock = null
        super.onDestroy()
    }

    private fun registerNetworkWatch() {
        val cm = connectivityManager ?: return
        if (networkCallbackRegistered) return
        runCatching {
            cm.registerDefaultNetworkCallback(networkCallback)
            networkCallbackRegistered = true
        }
        refreshInternetState()
    }

    private fun unregisterNetworkWatch() {
        val cm = connectivityManager ?: return
        if (!networkCallbackRegistered) return
        runCatching { cm.unregisterNetworkCallback(networkCallback) }
        networkCallbackRegistered = false
    }

    private fun refreshInternetState() {
        val cm = connectivityManager
        val network = cm?.activeNetwork
        val caps = network?.let { cm.getNetworkCapabilities(it) }
        val phoneOk = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        phoneInternetAvailable.value = phoneOk
        internetReady.value = phoneOk && miniReady.value && protocolReady.value && melSessionReady
    }

    private fun validateMelSession() {
        if (!phoneInternetAvailable.value || !miniReady.value || !protocolReady.value || melSessionReady) return
        executor.execute {
            val rawId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
            val androidDeviceId = "android-" + (rawId ?: "unknown").take(64)
            val ok = runCatching {
                MelApiClient(BuildConfig.MEL_BASE_URL, androidDeviceId, TokenVault(this))
                    .heartbeat(sdkInt = Build.VERSION.SDK_INT, phase = "MINI_LINK_V2_READY")
            }.isSuccess
            melSessionReady = ok
            refreshInternetState()
            if (ok) state.value = "MINI V2 · INTERNET OK"
            else lastError.value = "MEL_SESSION"
        }
    }

        private fun hasBlePermissions(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(
                this, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        }
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
        val scanError = runCatching {
            scanner.startScan(listOf(filter), settings, scanCallback)
        }.exceptionOrNull()
        if (scanError != null) {
            scanActive = false
            lastError.value = "SCAN_START_" + scanError.javaClass.simpleName
            state.value = "ERREUR SCAN"
            scheduleReconnect()
            return
        }
        handler.postDelayed({
            if (scanActive) {
                stopScan()
                scheduleReconnect()
            }
        }, 12_000L)
    }

    private fun stopScan() {
        if (!scanActive) return
        // Always clear local state, even when the user revokes Bluetooth permission
        // while a scan is active; otherwise future reauthorization can deadlock.
        scanActive = false
        if (!hasBlePermissions()) return
        val scanner = getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner
        runCatching { scanner?.stopScan(scanCallback) }
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
            state.value = "AUTORISATION BLUETOOTH"
            return
        }
        val opened = runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                device.connectGatt(this, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
            } else {
                @Suppress("DEPRECATION")
                device.connectGatt(this, false, gattCallback)
            }
        }
        val client = opened.getOrNull()
        if (client == null) {
            connecting.set(false)
            lastError.value = "CONNECT_GATT_" + (opened.exceptionOrNull()?.javaClass?.simpleName ?: "NULL")
            state.value = "ERREUR CONNEXION MINI"
            scheduleReconnect()
            return
        }
        gatt = client
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(client: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                reconnectAttempt = 0
                mtuRetryAttempted = false
                state.value = "NEGOCIATION"
                miniReady.value = false
                protocolReady.value = false
                if (!hasBlePermissions()) {
                    failAndReconnect(client, "BLUETOOTH_PERMISSION_MISSING")
                    return
                }
                when (client.device.bondState) {
                    BluetoothDevice.BOND_BONDED -> beginMtuNegotiation(client)
                    BluetoothDevice.BOND_BONDING -> state.value = "APPARIEMENT BLUETOOTH"
                    else -> {
                        state.value = "CONFIRMER APPARIEMENT MINI"
                        val started = runCatching { client.device.createBond() }.getOrDefault(false)
                        if (!started) failAndReconnect(client, "BLE_PAIRING_START_FAILED")
                    }
                }
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
            if (status != BluetoothGatt.GATT_SUCCESS || mtu < MelLinkV2Protocol.MIN_AUDIO_MTU) {
                if (!mtuRetryAttempted) {
                    mtuRetryAttempted = true
                    val retryQueued = runCatching { client.requestMtu(517) }.getOrDefault(false)
                    if (retryQueued) {
                        state.value = "RENEGOCIATION MTU"
                        Log.w(TAG, "Link V2 MTU retry requested after mtu=" + mtu + " status=" + status)
                        return
                    }
                }
                lastError.value = "MTU_" + mtu + "_STATUS_" + status
                state.value = "MTU INSUFFISANT (" + mtu + ")"
                Log.e(TAG, "Link V2 MTU insufficient: mtu=" + mtu + " status=" + status)
                failAndReconnect(client, "MTU_" + mtu + "_STATUS_" + status)
                return
            }
            Log.i(TAG, "Link V2 MTU negotiated: " + mtu)
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
            val eventCccdValue = byteArrayOf(3, 0)
            val queued = if (Build.VERSION.SDK_INT >= 33) {
                client.writeDescriptor(cccd, eventCccdValue) == BluetoothGatt.GATT_SUCCESS
            } else {
                @Suppress("DEPRECATION")
                run {
                    cccd.value = eventCccdValue
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
            state.value = "MINI CONNECTEE · ATTENTE HELLO V2"
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
            writeAck.offer(status)
            if (status != BluetoothGatt.GATT_SUCCESS) lastError.value = "WRITE_$status"
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
                refreshInternetState()
                validateMelSession()
                state.value = if (internetReady.value) "MINI V2 · INTERNET OK" else "MINI V2 PRETE"
                sendControlAsync(MelLinkV2Protocol.encode(MelLinkV2Protocol.SESSION, 0, 0, 0, sessionPayload()))
            }
            MelLinkV2Protocol.PING -> {
                sendControlAsync(MelLinkV2Protocol.encode(MelLinkV2Protocol.PONG, 0, frame.streamId, frame.seq))
            }
            MelLinkV2Protocol.ERROR -> {
                val code = frame.payload.toString(Charsets.UTF_8)
                if (code == "CANCEL") {
                    synchronized(outboundCredits) {
                        cancelledOutbound.add(frame.streamId)
                        outboundCredits[frame.streamId]?.release(64)
                    }
                    lastError.value = "REMOTE_CANCEL_" + frame.streamId
                    Log.i(TAG, "MINI cancelled outbound stream=" + frame.streamId)
                }
            }
            MelLinkV2Protocol.CREDIT -> {
                if (frame.payload.size < 2) return
                val credits = (frame.payload[0].toInt() and 0xff) or
                    ((frame.payload[1].toInt() and 0xff) shl 8)
                if (credits <= 0) return
                synchronized(outboundCredits) {
                    outboundCredits[frame.streamId]?.release(credits)
                }
            }
            MelLinkV2Protocol.MEDIA_CONFIG_REQUEST -> {
                if (!::mediaReceiver.isInitialized) {
                    sendErrorAsync(frame.streamId, "MEDIA_RECEIVER_UNAVAILABLE")
                    return
                }
                mediaReceiver.ensureStarted(
                    onReady = { cfg ->
                        val payload = JSONObject()
                            .put("ssid", cfg.ssid)
                            .put("pass", cfg.passphrase)
                            .put("port", cfg.port)
                            .put("token", cfg.token)
                            .toString()
                            .toByteArray(Charsets.UTF_8)
                        if (payload.size > 170) {
                            sendErrorAsync(frame.streamId, "MEDIA_CONFIG_TOO_LARGE")
                        } else {
                            sendControlAsync(
                                MelLinkV2Protocol.encode(
                                    MelLinkV2Protocol.MEDIA_CONFIG,
                                    0,
                                    frame.streamId,
                                    0,
                                    payload
                                )
                            )
                        }
                    },
                    onError = { code ->
                        lastError.value = code
                        sendErrorAsync(frame.streamId, code)
                    }
                )
            }
            MelLinkV2Protocol.REQUEST_BEGIN -> {
                synchronized(outboundCredits) { cancelledOutbound.remove(frame.streamId) }
                val meta = runCatching { JSONObject(frame.payload.toString(Charsets.UTF_8)) }.getOrNull() ?: return
                val path = meta.optString("path")
                val bodyLen = meta.optLong("body_len", -1L)
                if (!path.startsWith("/api/device/v1/") || bodyLen !in 0L..524_288L) {
                    sendErrorAsync(frame.streamId, "REQUEST_META")
                    return
                }
                synchronized(requests) { requests[frame.streamId] = IncomingRequest(frame.streamId, meta) }
                sendCreditAsync(frame.streamId, MelLinkV2Protocol.CREDIT_WINDOW)
            }
            MelLinkV2Protocol.REQUEST_DATA -> {
                val request = synchronized(requests) { requests[frame.streamId] } ?: return
                if (frame.seq != request.nextSeq) {
                    synchronized(requests) { requests.remove(frame.streamId) }
                    lastError.value = "REQUEST_SEQUENCE"
                    sendErrorAsync(frame.streamId, "REQUEST_SEQUENCE")
                    return
                }
                val expected = request.meta.optLong("body_len", -1L)
                if (request.body.size().toLong() + frame.payload.size > expected) {
                    synchronized(requests) { requests.remove(frame.streamId) }
                    lastError.value = "REQUEST_LENGTH"
                    sendErrorAsync(frame.streamId, "REQUEST_LENGTH")
                    return
                }
                request.nextSeq++
                request.body.write(frame.payload)
                sendCreditAsync(frame.streamId, 1)
            }
            MelLinkV2Protocol.REQUEST_END -> {
                val request = synchronized(requests) { requests.remove(frame.streamId) } ?: return
                if (frame.seq != request.nextSeq) {
                    lastError.value = "REQUEST_END_SEQUENCE"
                    sendErrorAsync(frame.streamId, "REQUEST_END_SEQUENCE")
                    return
                }
                if (request.body.size().toLong() != request.meta.optLong("body_len", -1L)) {
                    lastError.value = "REQUEST_LENGTH"
                    sendErrorAsync(frame.streamId, "REQUEST_LENGTH")
                    return
                }
                executor.execute { executeRequest(request) }
            }
            MelLinkV2Protocol.AUDIO_BEGIN -> {
                val meta = runCatching { JSONObject(frame.payload.toString(Charsets.UTF_8)) }.getOrNull() ?: return
                val expectedSamples = meta.optInt("samples", -1)
                if (meta.optString("codec") != "ima-adpcm" ||
                    meta.optInt("rate") != 16_000 ||
                    meta.optInt("ch") != 1 ||
                    meta.optInt("block") != MelImaAdpcm.BLOCK_SAMPLES ||
                    expectedSamples !in 1..160_000
                ) {
                    sendErrorAsync(frame.streamId, "AUDIO_FORMAT")
                    return
                }
                synchronized(audioStreams) {
                    audioStreams[frame.streamId] = IncomingAudio(frame.streamId, meta)
                }
                sendCreditAsync(frame.streamId, MelLinkV2Protocol.CREDIT_WINDOW)
            }
            MelLinkV2Protocol.AUDIO_DATA -> {
                val audio = synchronized(audioStreams) { audioStreams[frame.streamId] } ?: return
                if (frame.seq != audio.nextSeq) {
                    synchronized(audioStreams) { audioStreams.remove(frame.streamId) }
                    lastError.value = "AUDIO_SEQUENCE"
                    sendErrorAsync(frame.streamId, "AUDIO_SEQUENCE")
                    return
                }
                val pcm = runCatching { MelImaAdpcm.decodeBlock(frame.payload) }.getOrElse {
                    synchronized(audioStreams) { audioStreams.remove(frame.streamId) }
                    lastError.value = "AUDIO_ADPCM"
                    sendErrorAsync(frame.streamId, "AUDIO_ADPCM")
                    return
                }
                audio.nextSeq++
                for (sample in pcm) {
                    val value = sample.toInt()
                    audio.pcm16.write(value and 0xff)
                    audio.pcm16.write((value ushr 8) and 0xff)
                }
                audio.creditsConsumed++
                val replenishAt = maxOf(1, MelLinkV2Protocol.CREDIT_WINDOW / 2)
                if (audio.creditsConsumed >= replenishAt) {
                    sendCreditAsync(frame.streamId, audio.creditsConsumed)
                    audio.creditsConsumed = 0
                }
            }
            MelLinkV2Protocol.AUDIO_END -> {
                val audio = synchronized(audioStreams) { audioStreams.remove(frame.streamId) } ?: return
                if (frame.seq != audio.nextSeq) {
                    lastError.value = "AUDIO_END_SEQUENCE"
                    sendErrorAsync(frame.streamId, "AUDIO_END_SEQUENCE")
                    return
                }
                val expectedSamples = audio.meta.optInt("samples", -1)
                if (expectedSamples <= 0 || audio.pcm16.size() != expectedSamples * 2) {
                    lastError.value = "AUDIO_LENGTH"
                    sendErrorAsync(frame.streamId, "AUDIO_LENGTH")
                    return
                }
                executor.execute { executeAudio(audio) }
            }
        }
    }

    private fun sessionPayload(): ByteArray {
        val rawId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        val now = System.currentTimeMillis()
        val zone = TimeZone.getDefault()
        return JSONObject()
            .put("protocol", MelLinkV2Protocol.VERSION)
            .put("device_id", "android-" + (rawId ?: "unknown").take(64))
            .put("epoch_ms", now)
            .put("utc_offset_seconds", zone.getOffset(now) / 1000)
            .put("timezone", zone.id.take(64))
            .toString()
            .toByteArray()
    }

    private fun currentAndroidDeviceId(): String {
        val rawId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        return "android-" + (rawId ?: "unknown").take(64)
    }

    private fun miniDeviceConnection(
        path: String,
        method: String,
        miniDeviceId: String,
        miniToken: String
    ): java.net.HttpURLConnection {
        val connection = java.net.URL(
            BuildConfig.MEL_BASE_URL.trimEnd('/') + path
        ).openConnection() as java.net.HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 15_000
        connection.readTimeout = if (path == "/api/device/v1/chat") 120_000 else 90_000
        connection.setRequestProperty("Authorization", "Bearer $miniToken")
        connection.setRequestProperty("X-MEL-Device-ID", miniDeviceId)
        connection.setRequestProperty("X-MEL-Link-Protocol", "2")
        connection.setRequestProperty("Accept", "*/*")
        return connection
    }

    private fun sponsoredPairConnection(
        path: String,
        method: String,
        androidDeviceId: String,
        androidToken: String
    ): java.net.HttpURLConnection {
        val connection = java.net.URL(
            BuildConfig.MEL_BASE_URL.trimEnd('/') + path
        ).openConnection() as java.net.HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 15_000
        connection.readTimeout = 90_000
        // Existing production pairing contract: the Android token sponsors the
        // MINI but never crosses BLE.
        connection.setRequestProperty("X-MEL-Android-Device-ID", androidDeviceId)
        connection.setRequestProperty("X-MEL-Android-Token", androidToken)
        connection.setRequestProperty("X-MEL-Link-Protocol", "2")
        connection.setRequestProperty("Accept", "application/json")
        return connection
    }

    private fun executeAudio(audio: IncomingAudio) {
        val miniDeviceId = audio.meta.optString("mini").trim()
        if (miniDeviceId.isBlank()) {
            sendError(audio.streamId, "MINI_DEVICE_ID_REQUIRED")
            return
        }

        val miniToken = MiniTokenVault(this).load(miniDeviceId)
        if (miniToken.isNullOrBlank()) {
            sendResponse(
                audio.streamId,
                401,
                "application/json",
                JSONObject().put("ok", false).put("code", "MINI_TOKEN_MISSING")
                    .toString().toByteArray(Charsets.UTF_8)
            )
            return
        }

        val rawPcm = audio.pcm16.toByteArray()
        val samples = ShortArray(rawPcm.size / 2)
        var offset = 0
        for (i in samples.indices) {
            val lo = rawPcm[offset++].toInt() and 0xff
            val hi = rawPcm[offset++].toInt() and 0xff
            samples[i] = ((hi shl 8) or lo).toShort()
        }
        val wav = MelImaAdpcm.pcm16MonoWav(samples, 16_000)


        var connection: java.net.HttpURLConnection? = null
        try {
            val boundary = "mel-mini-v2-" + UUID.randomUUID().toString()
            connection = miniDeviceConnection(
                "/api/device/v1/voice/transcribe",
                "POST",
                miniDeviceId,
                miniToken
            )
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            connection.outputStream.use { output ->
                fun text(value: String) = output.write(value.toByteArray(Charsets.UTF_8))
                text("--$boundary\r\n")
                text("Content-Disposition: form-data; name=\"audio\"; filename=\"mini.wav\"\r\n")
                text("Content-Type: audio/wav\r\n\r\n")
                output.write(wav)
                text("\r\n--$boundary--\r\n")
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.use { it.readBytes() } ?: byteArrayOf()
            if (status == 401 || status == 403) {
                MiniTokenVault(this).clear(miniDeviceId)
            }
            sendResponse(
                audio.streamId,
                status,
                connection.contentType ?: "application/json",
                body
            )
            if (status in 200..299) {
                internetReady.value =
                    phoneInternetAvailable.value && miniReady.value && protocolReady.value && melSessionReady
                Log.i(TAG, "V2 ADPCM STT -> $status samples=${samples.size} wav=${wav.size}")
            } else {
                lastError.value = "STT_HTTP_$status"
            }
        } catch (error: Throwable) {
            val body = JSONObject()
                .put("ok", false)
                .put("code", "ANDROID_STT_RELAY")
                .put("detail", (error.message ?: error::class.java.simpleName).take(160))
                .toString()
                .toByteArray(Charsets.UTF_8)
            sendResponse(audio.streamId, 503, "application/json", body)
            lastError.value = "STT_RELAY"
        } finally {
            connection?.disconnect()
        }
    }

    private fun sendResponse(streamId: Int, status: Int, contentType: String, body: ByteArray): Boolean {
        val begin = JSONObject()
            .put("status", status)
            .put("content_type", contentType)
            .put("length", body.size)
            .toString()
            .toByteArray(Charsets.UTF_8)
        if (!sendControlBlocking(
                MelLinkV2Protocol.encode(
                    MelLinkV2Protocol.RESPONSE_BEGIN, 0, streamId, 0, begin
                )
            )) return false

        var seq = 0
        var offset = 0
        val chunk = 150
        while (offset < body.size) {
            val end = minOf(offset + chunk, body.size)
            if (!sendBulkBlocking(
                    MelLinkV2Protocol.encode(
                        MelLinkV2Protocol.RESPONSE_DATA, 0, streamId, seq++,
                        body.copyOfRange(offset, end)
                    )
                )) return false
            offset = end
        }
        return sendControlBlocking(
            MelLinkV2Protocol.encode(
                MelLinkV2Protocol.RESPONSE_END, 0, streamId, seq
            )
        )
    }

    private fun sendAudioResponse(streamId: Int, pcm16: ShortArray, outputRate: Int): Boolean {
        if (pcm16.isEmpty()) return false

        // Keep TTS frames comfortably below the negotiated MTU and use the
        // same credit-based flow control already used by the MINI uplink.
        // This prevents long spoken replies from overrunning Android's GATT
        // write queue while text/chat traffic still appears healthy.
        val audioBlockSamples = 128
        val credits = beginOutboundTransfer(streamId)
        requestBlePriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
        try {
            val meta = JSONObject()
                .put("codec", "ima-adpcm")
                .put("rate", outputRate)
                .put("ch", 1)
                .put("samples", pcm16.size)
                .put("block", audioBlockSamples)
                .put("output_rate", outputRate)
                .toString()
                .toByteArray(Charsets.UTF_8)

            if (!sendControlBlocking(
                    MelLinkV2Protocol.encode(
                        MelLinkV2Protocol.AUDIO_BEGIN, 0, streamId, 0, meta
                    )
                )) return false

            var seq = 0
            var offset = 0
            while (offset < pcm16.size) {
                if (outboundCancelled(streamId)) return false
                if (!awaitOutboundCredit(streamId, credits)) return false
                if (outboundCancelled(streamId)) return false
                val end = minOf(offset + audioBlockSamples, pcm16.size)
                val encoded = MelImaAdpcm.encodeBlock(pcm16.copyOfRange(offset, end))
                if (!sendBulkNoResponse(
                        MelLinkV2Protocol.encode(
                            MelLinkV2Protocol.AUDIO_DATA, 0, streamId, seq++, encoded
                        )
                    )) return false
                offset = end
            }

            return sendControlBlocking(
                MelLinkV2Protocol.encode(
                    MelLinkV2Protocol.AUDIO_END, 0, streamId, seq
                )
            )
        } finally {
            endOutboundTransfer(streamId, credits)
            requestBlePriority(BluetoothGatt.CONNECTION_PRIORITY_BALANCED)
        }
    }

    private fun executeRequest(request: IncomingRequest) {
        val method = request.meta.optString("method", "POST").uppercase()
        val path = request.meta.optString("path")
        val contentType = request.meta.optString("content_type", "application/json")
        if (!path.startsWith("/api/device/v1/")) {
            sendError(request.streamId, "BAD_PATH")
            return
        }

        val miniDeviceId = request.meta.optString("mini_device_id").trim()
        if (miniDeviceId.isBlank()) {
            sendError(request.streamId, "MINI_DEVICE_ID_REQUIRED")
            return
        }

        // Keep locally trained OK MEL / wake profile sync working after V2 migration.
        if (method == "POST" && path == "/api/device/v1/wake-profile/import") {
            val imported = runCatching {
                require(request.body.size() <= 128 * 1024) { "WAKE_PROFILE_TOO_LARGE" }
                WakePhraseProfileStore(this).importProfile(
                    JSONObject(request.body.toByteArray().toString(Charsets.UTF_8))
                )
            }.getOrDefault(false)
            if (imported) wakeProfileRevision.value = wakeProfileRevision.value + 1
            sendResponse(
                request.streamId, if (imported) 200 else 400, "application/json",
                JSONObject().put("ok", imported).put("restored", imported)
                    .put("source", "mini-nvs").toString().toByteArray(Charsets.UTF_8)
            )
            return
        }
        if (method == "GET" && path == "/api/device/v1/wake-profile") {
            val now = System.currentTimeMillis()
            val zone = TimeZone.getDefault()
            val store = WakePhraseProfileStore(this)
            val body = store.load()
                .put("reset_requested", store.resetRequested())
                .put("device_id", miniDeviceId)
                .put("epoch_ms", now)
                .put("utc_offset_seconds", zone.getOffset(now) / 1000)
                .put("timezone", zone.id)
                .toString().toByteArray(Charsets.UTF_8)
            sendResponse(request.streamId, 200, "application/json", body)
            return
        }
        if (method == "POST" && path == "/api/device/v1/render/card") {
            val card = runCatching {
                require(request.body.size() <= 16 * 1024) { "MINI_CARD_TOO_LARGE" }
                val json = JSONObject(request.body.toByteArray().toString(Charsets.UTF_8))
                MiniCardRenderer.renderMiniCardMimg(
                    json.optString("title", "Résultat MEL"),
                    json.optString("snippet", ""),
                    json.optString("url", ""),
                    json.optString("image_url", "")
                )
            }.getOrElse {
                sendError(request.streamId, "RENDER_CARD_FAILED")
                return
            }
            sendResponse(request.streamId, 200, "application/x-mel-mimg", card)
            return
        }

        // Preferred MINI voice path: synthesize French speech locally on Android.
        // This runs before server/token routing, so a healthy phone+BLE link can
        // speak even if cloud TTS or the MINI API token is unavailable.
        if (method == "POST" && path == "/api/device/v1/voice/tts") {
            val requestedText = runCatching {
                JSONObject(request.body.toString(Charsets.UTF_8))
                    .optString("text")
                    .trim()
            }.getOrDefault("")
            if (requestedText.isNotBlank()) {
                val localPcm = runCatching {
                    MelMiniVoiceSynthesizer.synthesizePcm48kMono(this, requestedText)
                }
                if (localPcm.isSuccess) {
                    val pcm = localPcm.getOrThrow()
                    if (outboundCancelled(request.streamId)) {
                        Log.i(TAG, "MINI local TTS discarded after remote cancel stream=" + request.streamId)
                        return
                    }
                    Log.i(TAG, "MINI local fr-FR TTS -> PCM48 samples=" + pcm.size)
                    state.value = "MINI V2 · VOIX FR LOCALE"
                    val sent = sendAudioResponse(request.streamId, pcm, outputRate = 48_000)
                    if (!sent && !outboundCancelled(request.streamId)) {
                        lastError.value = "TTS_LOCAL_BLE_SEND"
                        sendError(request.streamId, "TTS_LOCAL_BLE_SEND")
                    }
                    return
                } else {
                    val error = localPcm.exceptionOrNull()
                    Log.w(TAG, "Local French MINI TTS unavailable; server fallback", error)
                    lastError.value = "TTS_LOCAL_FALLBACK"
                }
            }
        }

        val isPair = path == "/api/device/v1/pair"
        val androidDeviceId = currentAndroidDeviceId()
        val androidToken = TokenVault(this).load()

        var connection: java.net.HttpURLConnection? = null
        try {
            connection = if (isPair) {
                if (androidToken.isNullOrBlank()) {
                    sendResponse(
                        request.streamId,
                        401,
                        "application/json",
                        JSONObject().put("ok", false).put("code", "ANDROID_NOT_PAIRED")
                            .toString().toByteArray(Charsets.UTF_8)
                    )
                    return
                }
                sponsoredPairConnection(path, method, androidDeviceId, androidToken)
            } else {
                val miniToken = MiniTokenVault(this).load(miniDeviceId)
                if (miniToken.isNullOrBlank()) {
                    // Deliberately return a normal 401 response. MINI already
                    // handles this by clearing its stale token and immediately
                    // requesting an Android-sponsored /pair refresh.
                    sendResponse(
                        request.streamId,
                        401,
                        "application/json",
                        JSONObject().put("ok", false).put("code", "MINI_TOKEN_MISSING")
                            .toString().toByteArray(Charsets.UTF_8)
                    )
                    return
                }
                miniDeviceConnection(path, method, miniDeviceId, miniToken)
            }

            if (request.body.size() > 0) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", contentType)
                connection.outputStream.use { it.write(request.body.toByteArray()) }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.use { it.readBytes() } ?: byteArrayOf()

            if (isPair && status in 200..299) {
                val response = runCatching {
                    JSONObject(body.toString(Charsets.UTF_8))
                }.getOrNull()
                val miniToken = response?.optString("token").orEmpty()
                val responseMiniId = response?.optString("device_id").orEmpty()
                if (miniToken.isBlank() || responseMiniId != miniDeviceId) {
                    sendResponse(
                        request.streamId,
                        502,
                        "application/json",
                        JSONObject().put("ok", false).put("code", "MINI_PAIR_RESPONSE_INVALID")
                            .toString().toByteArray(Charsets.UTF_8)
                    )
                    return
                }
                // Store the exact same MINI token Android is about to send back
                // to MINI over the encrypted local BLE link.
                MiniTokenVault(this).save(miniDeviceId, miniToken)
                miniPairingComplete.value = true
                getSharedPreferences("mel_link_v2", MODE_PRIVATE).edit()
                    .putBoolean("mini_pairing_complete", true).apply()
                state.value = "MINI V2 · IDENTITE OK"
            } else if (!isPair && (status == 401 || status == 403)) {
                MiniTokenVault(this).clear(miniDeviceId)
            }

            if (status in 200..299 && path == "/api/device/v1/voice/tts") {
                // Network fallback is strict: only a self-describing WAV is
                // accepted. Never reinterpret arbitrary compressed/JSON bytes
                // as PCM, which was the source of the long tone regression.
                val pcm48 = runCatching {
                    require(
                        body.size >= 12 &&
                            body.copyOfRange(0, 4).toString(Charsets.US_ASCII) == "RIFF" &&
                            body.copyOfRange(8, 12).toString(Charsets.US_ASCII) == "WAVE"
                    ) { "TTS_WAV_REQUIRED" }
                    MelImaAdpcm.decodePcm16MonoWav(body, 48_000)
                }.recoverCatching {
                    val pcm16 = MelImaAdpcm.decodePcm16MonoWav(body, 16_000)
                    MelImaAdpcm.upsample16kTo48k(pcm16)
                }.getOrElse {
                    lastError.value = "TTS_WAV"
                    sendResponse(
                        request.streamId, 503, "application/json",
                        JSONObject()
                            .put("ok", false)
                            .put("code", "TTS_WAV")
                            .put("content_type", connection.contentType.orEmpty())
                            .put("bytes", body.size)
                            .toString().toByteArray(Charsets.UTF_8)
                    )
                    return
                }
                sendAudioResponse(request.streamId, pcm48, outputRate = 48_000)
                return
            }

            sendResponse(
                request.streamId,
                status,
                connection.contentType ?: "application/octet-stream",
                body
            )
        } catch (error: Throwable) {
            sendError(request.streamId, "HTTP_RELAY")
            lastError.value = error.message.orEmpty()
        } finally {
            connection?.disconnect()
        }
    }

    private fun sendCreditAsync(streamId: Int, credits: Int) {
        val payload = byteArrayOf((credits and 0xff).toByte(), ((credits ushr 8) and 0xff).toByte())
        sendControlAsync(MelLinkV2Protocol.encode(MelLinkV2Protocol.CREDIT, 0, streamId, 0, payload))
    }

    private fun sendError(streamId: Int, code: String) {
        sendControlBlocking(MelLinkV2Protocol.encode(MelLinkV2Protocol.ERROR, 0, streamId, 0, code.toByteArray()))
    }

    private fun sendErrorAsync(streamId: Int, code: String) {
        if (!bleWriter.isShutdown) bleWriter.execute { sendError(streamId, code) }
    }

    private fun sendControlAsync(frame: ByteArray) {
        if (!bleWriter.isShutdown) bleWriter.execute { sendControlBlocking(frame) }
    }

    private fun sendControlBlocking(frame: ByteArray): Boolean =
        writeGattBlocking(controlRx, frame, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)

    private fun sendBulkBlocking(frame: ByteArray): Boolean =
        writeGattBlocking(bulkRx, frame, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)

    private fun beginOutboundTransfer(streamId: Int): Semaphore {
        val sem = Semaphore(0)
        synchronized(outboundCredits) {
            outboundCredits[streamId] = sem
        }
        return sem
    }

    private fun outboundCancelled(streamId: Int): Boolean =
        synchronized(outboundCredits) { cancelledOutbound.contains(streamId) }

    private fun endOutboundTransfer(streamId: Int, sem: Semaphore) {
        synchronized(outboundCredits) {
            if (outboundCredits[streamId] === sem) outboundCredits.remove(streamId)
            cancelledOutbound.remove(streamId)
        }
    }

    private fun awaitOutboundCredit(streamId: Int, sem: Semaphore): Boolean {
        val ok = sem.tryAcquire(5, TimeUnit.SECONDS)
        if (!ok) lastError.value = "BULK_CREDIT_TIMEOUT_$streamId"
        return ok
    }

    private fun requestBlePriority(priority: Int) {
        val client = gatt ?: return
        if (!hasBlePermissions()) return
        runCatching { client.requestConnectionPriority(priority) }
            .onFailure { Log.w(TAG, "BLE connection priority request failed", it) }
    }

    private fun sendBulkNoResponse(frame: ByteArray): Boolean =
        writeGattNoResponse(bulkRx, frame)

    private fun writeGattNoResponse(
        characteristic: BluetoothGattCharacteristic?,
        value: ByteArray
    ): Boolean {
        synchronized(writeLock) {
            val client = gatt ?: return false
            val target = characteristic ?: return false
            if (!hasBlePermissions()) return false

            repeat(6) { attempt ->
                val queued = if (Build.VERSION.SDK_INT >= 33) {
                    client.writeCharacteristic(
                        target,
                        value,
                        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    ) == BluetoothGatt.GATT_SUCCESS
                } else {
                    @Suppress("DEPRECATION")
                    run {
                        target.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                        target.value = value
                        client.writeCharacteristic(target)
                    }
                }
                if (queued) return true
                if (attempt < 5) Thread.sleep(4L)
            }
            lastError.value = "BULK_WRITE_QUEUE"
            return false
        }
    }

    private fun writeGattBlocking(
        characteristic: BluetoothGattCharacteristic?,
        value: ByteArray,
        writeType: Int
    ): Boolean {
        synchronized(writeLock) {
            val client = gatt ?: return false
            val target = characteristic ?: return false
            if (!hasBlePermissions()) return false
            while (writeAck.poll() != null) { }
            val queued = if (Build.VERSION.SDK_INT >= 33) {
                client.writeCharacteristic(target, value, writeType) == BluetoothGatt.GATT_SUCCESS
            } else {
                @Suppress("DEPRECATION")
                run {
                    target.writeType = writeType
                    target.value = value
                    client.writeCharacteristic(target)
                }
            }
            if (!queued) return false
            val status = writeAck.poll(5, TimeUnit.SECONDS) ?: return false
            return status == BluetoothGatt.GATT_SUCCESS
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
        melSessionReady = false
        internetReady.value = false
        state.value = reason
        controlRx = null
        eventTx = null
        bulkRx = null
        synchronized(requests) { requests.clear() }
        synchronized(audioStreams) { audioStreams.clear() }
        synchronized(outboundCredits) {
            outboundCredits.values.forEach { it.release(MelLinkV2Protocol.CREDIT_WINDOW) }
            outboundCredits.clear()
            cancelledOutbound.clear()
        }
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
