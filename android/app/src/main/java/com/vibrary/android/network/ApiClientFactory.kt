package com.vibrary.android.network

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

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
    val trimmed = baseUrl.trim()
    return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
}
