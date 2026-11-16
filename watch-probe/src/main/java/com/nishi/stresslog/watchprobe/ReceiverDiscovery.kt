package com.nishi.stresslog.watchprobe

import android.net.ConnectivityManager
import android.net.Network
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** Discovery is not a trust source: HMAC + nonce, then the already pinned TLS certificate. */
internal object ReceiverDiscovery {
    private fun proof(token: String, message: String): String = Mac.getInstance("HmacSHA256").run {
        init(SecretKeySpec(token.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        doFinal(message.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 255) }
    }
    fun find(network: Network, connectivity: ConnectivityManager, token: String): String? {
        val nonceBytes = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val nonce = nonceBytes.joinToString("") { "%02x".format(it.toInt() and 255) }
        val kind = "stresslog-discover-v1"
        val bytes = JSONObject().put("kind", kind).put("nonce", nonce).put("proof", proof(token, "$kind|$nonce")).toString().toByteArray(Charsets.UTF_8)
        val targets = mutableSetOf("255.255.255.255")
        connectivity.getLinkProperties(network)?.linkAddresses?.filter { it.address is Inet4Address && it.prefixLength in 1..30 }?.forEach {
            val address = it.address.address
            var value = 0L; address.forEach { b -> value = (value shl 8) or (b.toLong() and 255) }
            val mask = (0xffffffffL shl (32 - it.prefixLength)) and 0xffffffffL
            val broadcast = value or (mask xor 0xffffffffL)
            targets.add((3 downTo 0).joinToString(".") { shift -> ((broadcast shr (shift * 8)) and 255).toString() })
        }
        return DatagramSocket().use { socket ->
            network.bindSocket(socket); socket.broadcast = true; socket.soTimeout = 1000
            targets.forEach { socket.send(DatagramPacket(bytes, bytes.size, InetAddress.getByName(it), 8789)) }
            val deadline = android.os.SystemClock.elapsedRealtime() + 1200
            while (android.os.SystemClock.elapsedRealtime() < deadline) {
                val packet = DatagramPacket(ByteArray(512), 512)
                try { socket.receive(packet) } catch (_: SocketTimeoutException) { break }
                val response = try { JSONObject(String(packet.data, 0, packet.length, Charsets.UTF_8)) } catch (_: Exception) { continue }
                val port = response.optInt("port", 0)
                if (response.optString("kind") != "stresslog-receiver-v1" || response.optString("nonce") != nonce || port != 8787) continue
                val actual = response.optString("proof")
                val expected = proof(token, "stresslog-receiver-v1|$nonce|$port")
                if (actual.matches(Regex("[a-f0-9]{64}")) && MessageDigest.isEqual(actual.toByteArray(), expected.toByteArray()) && packet.address is Inet4Address) {
                    return@use "https://${packet.address.hostAddress}:$port/ingest"
                }
            }
            null
        }
    }
}
