package com.vibrary.android.repository

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.vibrary.android.cache.AndroidCacheManager
import com.vibrary.android.core.DeliveryDescriptor
import com.vibrary.android.core.DeliveryMode
import com.vibrary.android.core.LocalOpenResult
import com.vibrary.android.core.ResultAction
import com.vibrary.android.core.ResultResolutionPolicy
import com.vibrary.android.data.dao.LocalAssetRefDao
import com.vibrary.android.data.dao.LocalSourceDao
import com.vibrary.android.data.dao.CacheEntryDao
import com.vibrary.android.data.entities.CacheEntryEntity
import com.vibrary.android.data.entities.LocalAssetRefEntity
import com.vibrary.android.network.DeliveryDto
import com.vibrary.android.network.RefSyncItem
import com.vibrary.android.network.RefSyncRequest
import com.vibrary.android.network.SearchResultDto
import com.vibrary.android.network.VibraryApi
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.time.Instant
import java.util.UUID

class SearchResultHandler(
    private val context: Context,
    private val localAssetRefDao: LocalAssetRefDao,
    private val localSourceDao: LocalSourceDao,
    private val cacheEntryDao: CacheEntryDao,
    private val cacheManager: AndroidCacheManager,
    private val api: VibraryApi,
    private val httpClient: OkHttpClient,
    private val deviceId: String,
    private val serverBaseUrl: String,
    private val bearerToken: String,
) {
    suspend fun handle(result: SearchResultDto): HandleResult {
        val descriptor = result.delivery.toDescriptor(result)
        val localOpenResult = descriptor.localRefId?.let { tryOpenLocal(it) } ?: LocalOpenResult.NotAttempted
        return when (val action = ResultResolutionPolicy.resolve(descriptor, localOpenResult)) {
            is ResultAction.OpenLocal -> HandleResult.Opened
            is ResultAction.ReportRevokedThenDownload -> {
                api.markPermissionRevoked(deviceId, action.refId)
                val resolved = api.resolveAsset(result.assetId, com.vibrary.android.network.ResolveRequest(deviceId))
                val downloadUrl = resolved.delivery.downloadUrl ?: action.downloadUrl
                downloadToCache(
                    assetId = descriptor.assetId ?: result.assetId,
                    assetVersionId = resolved.assetVersionId ?: result.assetVersionId,
                    fileName = descriptor.fileName ?: result.title,
                    downloadUrl = downloadUrl,
                )
            }

            is ResultAction.DownloadToAppCache -> downloadToCache(action.assetId, result.assetVersionId, action.fileName, action.downloadUrl)
            is ResultAction.OfferStreamOrDownload -> HandleResult.NeedsUserChoice(action.streamUrl, action.downloadUrl)
            ResultAction.Unavailable -> HandleResult.Unavailable
        }
    }

    private suspend fun tryOpenLocal(localRefId: String): LocalOpenResult {
        val ref = localAssetRefDao.findByLocalRefId(localRefId) ?: return LocalOpenResult.PermissionRevoked
        return when (val target = LocalRefOpenTarget.from(ref)) {
            is LocalRefOpenTarget.Source -> tryOpenSource(target.localSourceId)
            is LocalRefOpenTarget.Cache -> tryOpenCache(target.cacheEntryId)
            LocalRefOpenTarget.Unavailable -> LocalOpenResult.PermissionRevoked
        }
    }

    private suspend fun tryOpenSource(sourceId: String): LocalOpenResult {
        val source = localSourceDao.findById(sourceId) ?: return LocalOpenResult.PermissionRevoked
        val uri = Uri.parse(source.persistedUri)

        return runCatching {
            context.contentResolver.openInputStream(uri)?.use { }
            val intent = Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, source.mimeType ?: "*/*")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            LocalOpenResult.Opened
        }.getOrElse {
            LocalOpenResult.PermissionRevoked
        }
    }

    private suspend fun tryOpenCache(cacheEntryId: String): LocalOpenResult {
        val entry = cacheEntryDao.findById(cacheEntryId) ?: return LocalOpenResult.PermissionRevoked
        val file = cacheManager.resolveCacheEntry(entry) ?: return LocalOpenResult.PermissionRevoked
        return runCatching {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "*/*")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            LocalOpenResult.Opened
        }.getOrElse {
            LocalOpenResult.PermissionRevoked
        }
    }

    private suspend fun downloadToCache(assetId: String, assetVersionId: String?, fileName: String, downloadUrl: String): HandleResult {
        val output = cacheManager.downloadTarget(assetId, fileName)
        val request = Request.Builder()
            .url(resolveDownloadUrl(downloadUrl))
            .header("Authorization", "Bearer $bearerToken")
            .build()
        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                return HandleResult.DownloadFailed("HTTP ${response.code}")
            }
            val body = response.body ?: return HandleResult.DownloadFailed("empty response")
            output.outputStream().use { sink ->
                body.byteStream().copyTo(sink)
            }
        }

        recordDownloadedCache(assetId, assetVersionId, fileName, output)
        return HandleResult.DownloadedToCache(output)
    }

    private suspend fun recordDownloadedCache(assetId: String, assetVersionId: String?, fileName: String, output: File) {
        val timestamp = Instant.now().toString()
        val cacheEntryId = UUID.randomUUID().toString()
        val localRefId = "cache:$assetId:$cacheEntryId"
        val relativePath = output.relativeTo(cacheManager.cacheRoot()).invariantSeparatorsPath
        cacheEntryDao.upsert(
            CacheEntryEntity(
                cacheEntryId = cacheEntryId,
                assetId = assetId,
                cacheType = "downloaded_file",
                relativePath = relativePath,
                sizeBytes = output.length(),
                createdAt = timestamp,
                lastAccessedAt = timestamp,
                canDelete = true,
            ),
        )
        localAssetRefDao.upsert(
            LocalAssetRefEntity(
                refId = UUID.randomUUID().toString(),
                assetId = assetId,
                assetVersionId = assetVersionId,
                refType = "cache_copy",
                localRefId = localRefId,
                localSourceId = null,
                cacheEntryId = cacheEntryId,
                displayName = fileName,
                sizeBytes = output.length(),
                lastKnownMtime = timestamp,
                contentSha256 = null,
                permissionStatus = "not_applicable",
                createdAt = timestamp,
                lastVerifiedAt = timestamp,
                isAvailable = true,
            ),
        )
        api.syncRefs(
            deviceId,
            RefSyncRequest(
                refs = listOf(
                    RefSyncItem(
                        assetId = assetId,
                        assetVersionId = assetVersionId,
                        refType = "cache_copy",
                        localRefId = localRefId,
                        displayName = fileName,
                        sizeBytes = output.length(),
                        contentSha256 = null,
                        permissionStatus = "not_applicable",
                    ),
                ),
            ),
        )
    }

    private fun resolveUrl(url: String): String =
        if (url.startsWith("http://") || url.startsWith("https://")) {
            url
        } else {
            serverBaseUrl.trimEnd('/') + "/" + url.trimStart('/')
        }

    private fun resolveDownloadUrl(url: String): String {
        val resolved = resolveUrl(url)
        if ("device_id=" in resolved) return resolved
        val separator = if ("?" in resolved) "&" else "?"
        return "$resolved${separator}device_id=$deviceId"
    }
}

sealed interface HandleResult {
    data object Opened : HandleResult
    data class DownloadedToCache(val file: File) : HandleResult
    data class NeedsUserChoice(val streamUrl: String?, val downloadUrl: String?) : HandleResult
    data class DownloadFailed(val reason: String) : HandleResult
    data object Unavailable : HandleResult
}

private fun DeliveryDto.toDescriptor(result: SearchResultDto): DeliveryDescriptor =
    DeliveryDescriptor(
        mode = when (mode) {
            DeliveryMode.LOCAL_REFERENCE.wireValue -> DeliveryMode.LOCAL_REFERENCE
            DeliveryMode.DOWNLOAD_TO_CACHE.wireValue -> DeliveryMode.DOWNLOAD_TO_CACHE
            DeliveryMode.STREAM_OR_DOWNLOAD.wireValue -> DeliveryMode.STREAM_OR_DOWNLOAD
            else -> DeliveryMode.UNAVAILABLE
        },
        assetId = result.assetId,
        fileName = result.title,
        localRefId = localRefId ?: result.availability.requestingDevice.localRefId,
        refId = refId ?: result.availability.requestingDevice.refId,
        downloadUrl = downloadUrl ?: "/v1/assets/${result.assetId}/content",
        streamUrl = streamUrl,
    )
