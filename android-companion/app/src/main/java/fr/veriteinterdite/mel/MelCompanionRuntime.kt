package fr.veriteinterdite.mel

import kotlinx.coroutines.flow.MutableStateFlow

object MelCompanionRuntime {
    val bridgeState = MutableStateFlow("COMPANION ARRÊTÉ")
    val miniLinkReady = MutableStateFlow(false)
    val phoneInternetAvailable = MutableStateFlow(false)
    val internetReady = MutableStateFlow(false)
    val miniPairingComplete = MutableStateFlow(false)
    val wakeProfileRevision = MutableStateFlow(0)
    val associationId = MutableStateFlow<Int?>(null)
    val deviceAddress = MutableStateFlow<String?>(null)

    fun markAssociated(id: Int, address: String?) {
        associationId.value = id
        deviceAddress.value = address
        miniPairingComplete.value = true
        bridgeState.value = "MINI ASSOCIÉE"
    }

    fun markPresent(address: String?) {
        if (!address.isNullOrBlank()) deviceAddress.value = address
        bridgeState.value = "MINI PRÉSENTE"
    }

    fun markConnecting() {
        miniLinkReady.value = false
        bridgeState.value = "CONNEXION LINK V2…"
    }

    fun markConnected() {
        miniLinkReady.value = true
        bridgeState.value = "MINI CONNECTÉE"
    }

    fun markDisconnected() {
        miniLinkReady.value = false
        internetReady.value = false
        bridgeState.value = "MINI HORS PORTÉE"
    }

    fun markError(message: String) {
        miniLinkReady.value = false
        bridgeState.value = "ERREUR MINI · $message"
    }
}
