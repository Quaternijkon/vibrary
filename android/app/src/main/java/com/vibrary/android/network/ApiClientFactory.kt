package com.vibrary.android.network

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.net.URI

object ApiClientFactory {
    fun create(baseUrl: String, pairingToken: String? = null): VibraryApi {
        val clientBuilder = OkHttpClient.Builder()
        if (!pairingToken.isNullOrBlank()) {
            clientBuilder.addInterceptor { chain ->
                val request = chain.request()
                    .newBuilder()
                    .header("Authorization", "Bearer $pairingToken")
                    .build()
                chain.proceed(request)
            }
        }
        val client = clientBuilder.build()

        val json = Json {
            ignoreUnknownKeys = true
        }

        return Retrofit.Builder()
            .baseUrl(normalizeRetrofitBaseUrl(baseUrl))
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(VibraryApi::class.java)
    }
}

fun normalizeRetrofitBaseUrl(baseUrl: String): String {
    val withScheme = baseUrl.trim().let { value ->
        if ("://" in value) value else "http://$value"
    }
    val uri = URI(withScheme)
    val scheme = uri.scheme?.lowercase()
    require(scheme == "http" || scheme == "https") {
        "服务器地址必须使用 http 或 https"
    }
    val host = requireNotNull(uri.host) {
        "服务器地址缺少主机名或 IP"
    }
    if (scheme == "http") {
        require(isAllowedCleartextHost(host)) {
            "HTTP 仅允许用于 localhost、.local 或局域网私有地址"
        }
    }
    return if (withScheme.endsWith("/")) withScheme else "$withScheme/"
}

private fun isAllowedCleartextHost(host: String): Boolean {
    val normalized = host.trim().lowercase().removeSurrounding("[", "]")
    if (normalized == "localhost" || normalized == "::1" || normalized.endsWith(".local")) {
        return true
    }
    val octets = normalized.split(".").mapNotNull { it.toIntOrNull() }
    if (octets.size != 4 || octets.any { it !in 0..255 }) {
        return false
    }
    return octets[0] == 10 ||
        octets[0] == 127 ||
        (octets[0] == 169 && octets[1] == 254) ||
        (octets[0] == 172 && octets[1] in 16..31) ||
        (octets[0] == 192 && octets[1] == 168)
}
