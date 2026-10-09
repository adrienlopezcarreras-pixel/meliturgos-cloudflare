package fr.veriteinterdite.mel

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.util.UUID

class MelLinkV2Client(private val context: Context) {
    companion object {
        val SERVICE_UUID: UUID = UUID.fromString("0000abf0-0000-1000-8000-00805f9b34fb")
        val RX_UUID: UUID = UUID.fromString("0000abf1-0000-1000-8000-00805f9b34fb")
        val TX_UUID: UUID = UUID.fromString("0000abf2-0000-1000-8000-00805f9b34fb")
        private val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }

    private var gatt: BluetoothGatt? = null
    private var rx: BluetoothGattCharacteristic? = null
    private var tx: BluetoothGattCharacteristic? = null

    @SuppressLint("MissingPermission")
    fun connect(device: BluetoothDevice) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
        ) {
            MelCompanionRuntime.markError("permission Bluetooth")
            return
        }
        close()
        MelCompanionRuntime.markConnecting()
        gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
    }

    @SuppressLint("MissingPermission")
    fun close() {
        runCatching { gatt?.disconnect() }
        runCatching { gatt?.close() }
        gatt = null
        rx = null
        tx = null
        MelCompanionRuntime.miniLinkReady.value = false
    }

    @SuppressLint("MissingPermission")
    fun write(frame: ByteArray): Boolean {
        val g = gatt ?: return false
        val characteristic = rx ?: return false
        return if (Build.VERSION.SDK_INT >= 33) {
            g.writeCharacteristic(
                characteristic,
                frame,
                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            ) == 0
        } else {
            @Suppress("DEPRECATION")
            characteristic.value = frame
            @Suppress("DEPRECATION")
            g.writeCharacteristic(characteristic)
        }
    }

    private val callback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                MelCompanionRuntime.markError("GATT $status")
                close()
                return
            }
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    MelCompanionRuntime.markPresent(g.device.address)
                    MelCompanionRuntime.bridgeState.value = "GATT CONNECTÉ · NÉGOCIATION MTU…"
                    val mtuStarted = g.requestMtu(517)
                    if (!mtuStarted) {
                        MelCompanionRuntime.bridgeState.value = "GATT CONNECTÉ · DÉCOUVERTE LINK V2…"
                        if (!g.discoverServices()) {
                            MelCompanionRuntime.markError("découverte services non démarrée")
                        }
                    }
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    MelCompanionRuntime.markDisconnected()
                    close()
                }
            }
        }

        @SuppressLint("MissingPermission")
        override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) {
            MelCompanionRuntime.bridgeState.value =
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    "MTU $mtu · DÉCOUVERTE LINK V2…"
                } else {
                    "MTU PAR DÉFAUT · DÉCOUVERTE LINK V2…"
                }
            if (!g.discoverServices()) {
                MelCompanionRuntime.markError("découverte services non démarrée")
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                MelCompanionRuntime.markError("services GATT $status")
                return
            }
            MelCompanionRuntime.bridgeState.value = "SERVICES GATT OK · RECHERCHE LINK V2…"
            val service: BluetoothGattService = g.getService(SERVICE_UUID)
                ?: run {
                    MelCompanionRuntime.markError("service Link V2 absent")
                    return
                }
            rx = service.getCharacteristic(RX_UUID)
            tx = service.getCharacteristic(TX_UUID)
            if (rx == null || tx == null) {
                MelCompanionRuntime.markError("caractéristiques Link V2 absentes")
                return
            }
            MelCompanionRuntime.bridgeState.value = "LINK V2 TROUVÉ · ACTIVATION NOTIFICATIONS…"
            enableNotifications(g, tx!!)
        }

        @SuppressLint("MissingPermission")
        private fun enableNotifications(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (!g.setCharacteristicNotification(characteristic, true)) {
                MelCompanionRuntime.markError("notifications Link V2")
                return
            }
            val cccd = characteristic.getDescriptor(CCCD_UUID)
            if (cccd == null) {
                MelCompanionRuntime.markError("CCCD Link V2 absent")
                return
            }
            if (Build.VERSION.SDK_INT >= 33) {
                g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
            } else {
                @Suppress("DEPRECATION")
                cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                @Suppress("DEPRECATION")
                g.writeDescriptor(cccd)
            }
        }

        override fun onDescriptorWrite(g: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            if (descriptor.uuid == CCCD_UUID && status == BluetoothGatt.GATT_SUCCESS) {
                MelCompanionRuntime.markConnected()
            } else if (descriptor.uuid == CCCD_UUID) {
                MelCompanionRuntime.markError("activation notifications $status")
            }
        }

        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            if (characteristic.uuid == TX_UUID) {
                // Transport frame dispatch will be reintroduced above this clean GATT layer.
            }
        }

        @Deprecated("API < 33")
        override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            @Suppress("DEPRECATION")
            onCharacteristicChanged(g, characteristic, characteristic.value ?: byteArrayOf())
        }
    }
}
