package fr.veriteinterdite.mel

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.UUID

data class MiniBleState(
    val scanning: Boolean = false,
    val connected: Boolean = false,
    val phase: String = "Bluetooth MINI prêt",
    val deviceName: String? = null,
    val deviceAddress: String? = null,
    val miniOnline: Boolean? = null,
    val miniState: Int? = null
)

class MelMiniBle(
    private val context: Context,
    private val onState: (MiniBleState) -> Unit
) {
    companion object {
        val SERVICE_UUID: UUID = UUID.fromString("7d4b0001-6d65-4c49-4e49-2d4252494447")
        val STATUS_UUID: UUID = UUID.fromString("7d4b0002-6d65-4c49-4e49-2d4252494447")
        val COMMAND_UUID: UUID = UUID.fromString("7d4b0003-6d65-4c49-4e49-2d4252494447")
        val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
        private const val PREFS = "mel_mini_ble"
        private const val PREF_ADDRESS = "mini_address"
        private const val DIRECT_FALLBACK_DELAY_MS = 3500L
    }

    private val main = Handler(Looper.getMainLooper())
    private val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val adapter get() = manager.adapter
    private var gatt: BluetoothGatt? = null
    private var commandCharacteristic: BluetoothGattCharacteristic? = null
    private var state = MiniBleState()
    private var manualDisconnect = false
    private var scanCallback: ScanCallback? = null
    private var reconnectAttempts = 0
    private var legacyMonitorStarted = false
    private var legacyConnected = false

    private val directFallback = Runnable {
        val bridge = MelBleBridgeService.bridgeState.value
        val legacyHandshake = bridge.startsWith("MINI LIÉE") || bridge.startsWith("MINI CONNECTÉE")
        if (!manualDisconnect && !legacyConnected && !state.connected && !legacyHandshake) startDirectConnection()
    }

    fun requiredPermissions(): Array<String> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        arrayOf(
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.BLUETOOTH_CONNECT,
            Manifest.permission.BLUETOOTH_ADVERTISE
        )
    } else {
        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }

    fun permissionsGranted(): Boolean =
        requiredPermissions().all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }

    @SuppressLint("MissingPermission")
    fun connect() {
        manualDisconnect = false
        if (!permissionsGranted()) {
            publish(state.copy(scanning = false, connected = false, phase = "Permission Bluetooth requise"))
            return
        }
        val bt = adapter
        if (bt == null || !bt.isEnabled) {
            publish(state.copy(scanning = false, connected = false, phase = "Active le Bluetooth Android"))
            return
        }

        // Compatibility with rollbacked MINI firmware 4818df9: that firmware
        // is the BLE central and looks for MEL Mobile service ABF0/ABF1/ABF2.
        ContextCompat.startForegroundService(context, Intent(context, MelBleBridgeService::class.java))
        startLegacyMonitor()
        publish(state.copy(scanning = true, connected = false, phase = "MEL prêt · recherche de MINI…"))

        // Give the rollbacked MINI (4818df9) first chance to discover the phone.
        // Only fall back to the newer direct-MINI scan if no legacy link appears.
        main.removeCallbacks(directFallback)
        main.postDelayed(directFallback, DIRECT_FALLBACK_DELAY_MS)
    }

    @SuppressLint("MissingPermission")
    private fun startDirectConnection() {
        if (manualDisconnect || legacyConnected || state.connected) return
        val bt = adapter ?: return
        val saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_ADDRESS, null)
        if (!saved.isNullOrBlank() && reconnectAttempts < 2) {
            runCatching { bt.getRemoteDevice(saved) }.getOrNull()?.let {
                publish(state.copy(scanning = false, phase = "Connexion directe à MINI…", deviceAddress = saved))
                connectGatt(it)
                return
            }
        }
        startScan()
    }

    @SuppressLint("MissingPermission")
    fun disconnect() {
        manualDisconnect = true
        main.removeCallbacks(directFallback)
        stopScan()
        commandCharacteristic = null
        gatt?.disconnect()
        gatt?.close()
        gatt = null
        reconnectAttempts = 0
        context.stopService(Intent(context, MelBleBridgeService::class.java))
        stopLegacyMonitor()
        legacyConnected = false
        publish(MiniBleState(phase = "MINI déconnectée"))
    }

    @SuppressLint("MissingPermission")
    fun release() {
        manualDisconnect = true
        main.removeCallbacks(directFallback)
        stopScan()
        commandCharacteristic = null
        gatt?.disconnect()
        gatt?.close()
        gatt = null
        stopLegacyMonitor()
    }

    @SuppressLint("MissingPermission")
    fun forget() {
        disconnect()
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(PREF_ADDRESS).apply()
        publish(MiniBleState(phase = "Association MINI oubliée"))
    }

    @SuppressLint("MissingPermission")
    fun send(command: String): Boolean {
        if (MelBleBridgeService.bridgeState.value == "MINI CONNECTÉE") {
            return command.equals("ping", ignoreCase = true)
        }
        val active = gatt ?: return false
        val characteristic = commandCharacteristic ?: return false
        val bytes = command.toByteArray(Charsets.UTF_8)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            active.writeCharacteristic(
                characteristic,
                bytes,
                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            ) == BluetoothGatt.GATT_SUCCESS
        } else {
            characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            characteristic.value = bytes
            active.writeCharacteristic(characteristic)
        }
    }

    @SuppressLint("MissingPermission")
    private fun startScan() {
        if (state.scanning) return
        val scanner = adapter?.bluetoothLeScanner
        if (scanner == null) {
            publish(state.copy(scanning = false, phase = "Scanner BLE indisponible"))
            return
        }
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE_UUID)).build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                stopScan()
                val device = result.device
                publish(
                    state.copy(
                        scanning = false,
                        phase = "MINI détectée · connexion…",
                        deviceName = result.scanRecord?.deviceName ?: "MEL-MINI",
                        deviceAddress = device.address
                    )
                )
                connectGatt(device)
            }

            override fun onScanFailed(errorCode: Int) {
                publish(state.copy(scanning = false, phase = "Scan MINI impossible · code $errorCode"))
            }
        }
        scanCallback = callback
        publish(state.copy(scanning = true, connected = false, phase = "Recherche de MINI…"))
        scanner.startScan(listOf(filter), settings, callback)
        main.postDelayed({
            if (state.scanning) {
                stopScan()
                publish(state.copy(scanning = false, phase = "MINI introuvable · vérifie qu’elle est allumée"))
            }
        }, 12_000)
    }

    @SuppressLint("MissingPermission")
    private fun stopScan() {
        val callback = scanCallback ?: return
        runCatching { adapter?.bluetoothLeScanner?.stopScan(callback) }
        scanCallback = null
        if (state.scanning) publish(state.copy(scanning = false))
    }

    @SuppressLint("MissingPermission")
    private fun connectGatt(device: android.bluetooth.BluetoothDevice) {
        gatt?.close()
        gatt = device.connectGatt(context, false, callback, android.bluetooth.BluetoothDevice.TRANSPORT_LE)
    }

    private val callback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(active: BluetoothGatt, status: Int, newState: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
                reconnectAttempts = 0
                publish(
                    state.copy(
                        scanning = false,
                        connected = true,
                        phase = "MINI connectée · découverte du service…",
                        deviceName = active.device.name ?: "MEL-MINI",
                        deviceAddress = active.device.address
                    )
                )
                active.discoverServices()
                return
            }

            if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                commandCharacteristic = null
                runCatching { active.close() }
                if (gatt === active) gatt = null
                publish(state.copy(connected = false, scanning = false, phase = "Liaison MINI perdue"))
                if (!manualDisconnect && reconnectAttempts < 5) {
                    reconnectAttempts += 1
                    main.postDelayed({ connect() }, (1_000L * reconnectAttempts).coerceAtMost(5_000L))
                }
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(active: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                publish(state.copy(phase = "Service MINI indisponible"))
                return
            }
            val service = active.getService(SERVICE_UUID)
            val statusCharacteristic = service?.getCharacteristic(STATUS_UUID)
            val command = service?.getCharacteristic(COMMAND_UUID)
            if (service == null || statusCharacteristic == null || command == null) {
                publish(state.copy(phase = "MINI incompatible · service BLE MEL absent"))
                return
            }

            commandCharacteristic = command
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(PREF_ADDRESS, active.device.address)
                .apply()

            active.setCharacteristicNotification(statusCharacteristic, true)
            statusCharacteristic.getDescriptor(CCCD_UUID)?.let { descriptor ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    active.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                } else {
                    descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    active.writeDescriptor(descriptor)
                }
            }
            active.readCharacteristic(statusCharacteristic)
            publish(state.copy(connected = true, phase = "MINI connectée en Bluetooth"))
        }

        @Deprecated("Deprecated in API 33")
        override fun onCharacteristicChanged(active: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (characteristic.uuid == STATUS_UUID) parseStatus(characteristic.value)
        }

        override fun onCharacteristicChanged(
            active: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            if (characteristic.uuid == STATUS_UUID) parseStatus(value)
        }

        @Deprecated("Deprecated in API 33")
        override fun onCharacteristicRead(
            active: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS && characteristic.uuid == STATUS_UUID) {
                parseStatus(characteristic.value)
            }
        }

        override fun onCharacteristicRead(
            active: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS && characteristic.uuid == STATUS_UUID) {
                parseStatus(value)
            }
        }
    }

    private val legacyMonitor = object : Runnable {
        override fun run() {
            val bridge = MelBleBridgeService.bridgeState.value
            if (bridge.startsWith("MINI CONNECTÉE")) {
                legacyConnected = true
                main.removeCallbacks(directFallback)
                stopScan()
                if (gatt != null) {
                    commandCharacteristic = null
                    runCatching { gatt?.disconnect() }
                    runCatching { gatt?.close() }
                    gatt = null
                }
                if (!state.connected || state.deviceName != "MINI" || state.phase != bridge) {
                    publish(
                        state.copy(
                            scanning = false,
                            connected = true,
                            phase = bridge,
                            deviceName = "MINI",
                            deviceAddress = null
                        )
                    )
                }
            } else if (legacyConnected) {
                legacyConnected = false
                if (gatt == null) {
                    publish(
                        state.copy(
                            scanning = true,
                            connected = false,
                            phase = if (bridge == "PRÊT") "MEL prêt · attente de MINI…" else "Liaison MINI perdue · reconnexion…",
                            deviceName = null,
                            deviceAddress = null
                        )
                    )
                    if (!manualDisconnect) {
                        main.removeCallbacks(directFallback)
                        main.postDelayed(directFallback, DIRECT_FALLBACK_DELAY_MS)
                    }
                }
            } else if (!state.connected && bridge == "PRÊT" && !state.phase.startsWith("MEL prêt")) {
                publish(state.copy(phase = "MEL prêt · attente de MINI…"))
            }
            if (legacyMonitorStarted) main.postDelayed(this, 250)
        }
    }

    private fun startLegacyMonitor() {
        if (legacyMonitorStarted) return
        legacyMonitorStarted = true
        main.post(legacyMonitor)
    }

    private fun stopLegacyMonitor() {
        legacyMonitorStarted = false
        main.removeCallbacks(legacyMonitor)
    }

    private fun parseStatus(value: ByteArray) {
        val raw = value.toString(Charsets.UTF_8)
        val json = runCatching { JSONObject(raw) }.getOrNull()
        publish(
            state.copy(
                connected = true,
                phase = "MINI connectée en Bluetooth",
                miniOnline = json?.optBoolean("online"),
                miniState = json?.optInt("state")
            )
        )
    }

    private fun publish(next: MiniBleState) {
        state = next
        main.post { onState(next) }
    }
}
