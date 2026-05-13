package com.vibrary.android.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.SocketTimeoutException

class LanDiscoveryClient(
    private val port: Int = 8766,
) {
    suspend fun listen(onAnnouncement: suspend (DiscoveryAnnouncement) -> Unit) {
        withContext(Dispatchers.IO) {
            DatagramSocket(port).use { socket ->
                socket.broadcast = true
                socket.soTimeout = 1000
                val buffer = ByteArray(4096)
                while (currentCoroutineContext().isActive) {
                    val packet = DatagramPacket(buffer, buffer.size)
                    try {
                        socket.receive(packet)
                        val payload = String(packet.data, packet.offset, packet.length, Charsets.UTF_8)
                        runCatching { DiscoveryAnnouncement.parse(payload) }
                            .onSuccess { announcement -> onAnnouncement(announcement) }
                    } catch (_: SocketTimeoutException) {
                    }
                }
            }
        }
    }
}
