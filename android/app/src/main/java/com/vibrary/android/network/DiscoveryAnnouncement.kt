package com.vibrary.android.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

data class DiscoveryAnnouncement(
    val instanceId: String,
    val deviceName: String,
    val serverUrl: String,
    val pairingPath: String,
) {
    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        fun parse(payload: String): DiscoveryAnnouncement {
            val decoded = json.decodeFromString(DiscoveryAnnouncementWire.serializer(), payload)
            require(decoded.type == "vibrary-desktop") { "not a Vibrary desktop announcement" }
            require(decoded.version == 1) { "unsupported Vibrary discovery version" }
            val normalizedUrl = normalizeRetrofitBaseUrl(decoded.serverUrl).trimEnd('/')
            return DiscoveryAnnouncement(
                instanceId = decoded.instanceId,
                deviceName = decoded.deviceName.ifBlank { "Windows Vibrary" },
                serverUrl = normalizedUrl,
                pairingPath = decoded.pairingPath.ifBlank { "/v1/pairing/claim" },
            )
        }
    }
}

@Serializable
private data class DiscoveryAnnouncementWire(
    val type: String,
    val version: Int,
    @SerialName("instance_id") val instanceId: String,
    @SerialName("device_name") val deviceName: String = "Windows Vibrary",
    @SerialName("server_url") val serverUrl: String,
    @SerialName("pairing_path") val pairingPath: String = "/v1/pairing/claim",
)
