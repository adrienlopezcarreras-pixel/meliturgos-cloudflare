package fr.veriteinterdite.mel

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.companion.AssociationInfo
import android.companion.CompanionDeviceService
import android.os.Build

@SuppressLint("MissingPermission")
class MelCompanionDeviceService : CompanionDeviceService() {
    private val link by lazy { MelLinkV2Client(this) }

    override fun onDeviceAppeared(associationInfo: AssociationInfo) {
        super.onDeviceAppeared(associationInfo)
        connectAssociation(associationInfo)
    }

    override fun onDeviceDisappeared(associationInfo: AssociationInfo) {
        super.onDeviceDisappeared(associationInfo)
        link.close()
        MelCompanionRuntime.markDisconnected()
    }

    @Deprecated("API 31-32 compatibility")
    override fun onDeviceAppeared(address: String) {
        super.onDeviceAppeared(address)
        val adapter = getSystemService(BluetoothManager::class.java)?.adapter ?: return
        MelCompanionRuntime.markPresent(address)
        link.connect(adapter.getRemoteDevice(address))
    }

    @Deprecated("API 31-32 compatibility")
    override fun onDeviceDisappeared(address: String) {
        super.onDeviceDisappeared(address)
        link.close()
        MelCompanionRuntime.markDisconnected()
    }

    private fun connectAssociation(info: AssociationInfo) {
        val address = if (Build.VERSION.SDK_INT >= 33) {
            info.deviceMacAddress?.toString()
        } else null
        MelCompanionRuntime.markAssociated(info.id, address)
        val adapter = getSystemService(BluetoothManager::class.java)?.adapter ?: return
        if (!address.isNullOrBlank()) {
            link.connect(adapter.getRemoteDevice(address))
        } else {
            MelCompanionRuntime.markError("adresse MINI absente")
        }
    }

    override fun onDestroy() {
        link.close()
        super.onDestroy()
    }
}
