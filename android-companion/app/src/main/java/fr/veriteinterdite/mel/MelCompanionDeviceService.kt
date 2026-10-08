package fr.veriteinterdite.mel

import android.annotation.SuppressLint
import android.companion.AssociationInfo
import android.companion.CompanionDeviceService
import android.os.Build

@SuppressLint("MissingPermission")
class MelCompanionDeviceService : CompanionDeviceService() {
    override fun onDeviceAppeared(associationInfo: AssociationInfo) {
        super.onDeviceAppeared(associationInfo)
        connectAssociation(associationInfo)
    }

    override fun onDeviceDisappeared(associationInfo: AssociationInfo) {
        super.onDeviceDisappeared(associationInfo)
        MelCompanionLink.close()
        MelCompanionRuntime.markDisconnected()
    }

    @Deprecated("API 31-32 compatibility")
    override fun onDeviceAppeared(address: String) {
        super.onDeviceAppeared(address)
        MelCompanionLink.connect(this, address)
    }

    @Deprecated("API 31-32 compatibility")
    override fun onDeviceDisappeared(address: String) {
        super.onDeviceDisappeared(address)
        MelCompanionLink.close()
        MelCompanionRuntime.markDisconnected()
    }

    private fun connectAssociation(info: AssociationInfo) {
        val address = if (Build.VERSION.SDK_INT >= 33) {
            info.deviceMacAddress?.toString()
        } else null
        MelCompanionRuntime.markAssociated(info.id, address)
        MelCompanionLink.connect(this, address)
    }

    override fun onDestroy() {
        MelCompanionLink.close()
        super.onDestroy()
    }
}
