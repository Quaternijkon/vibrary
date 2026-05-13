package com.vibrary.android.work

import android.content.Context
import android.net.Uri
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.vibrary.android.VibraryApplication
import com.vibrary.android.core.UploadQueueState
import com.vibrary.android.data.entities.LocalAssetRefEntity
import com.vibrary.android.network.ApiClientFactory
import com.vibrary.android.network.CompleteUploadRequest
import com.vibrary.android.network.PreflightRequest
import com.vibrary.android.network.RefSyncItem
import com.vibrary.android.network.RefSyncRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

class UploadWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val queueId = inputData.getString(KEY_QUEUE_ID) ?: return Result.failure()
        val database = (applicationContext as VibraryApplication).database
        val queueDao = database.uploadQueueDao()
        val item = queueDao.findById(queueId) ?: return Result.failure()

        if (item.state == UploadQueueState.PAUSED || item.state == UploadQueueState.CANCELLED) {
            return Result.success()
        }

        val source = database.localSourceDao().findById(item.localSourceId) ?: return Result.failure()
        val server = database.pairedServerDao().activeServer() ?: return Result.retry()
        val api = ApiClientFactory.create(server.baseUrl, server.pairingToken)

        return runCatching {
            queueDao.updateState(queueId, UploadQueueState.CHECKING, now())
            val uri = Uri.parse(source.persistedUri)
            queueDao.updateState(queueId, UploadQueueState.HASHING, now())
            val contentSha256 = sha256(uri)

            queueDao.updateState(queueId, UploadQueueState.PREFLIGHT, now())
            val preflight = api.preflight(
                PreflightRequest(
                    deviceId = server.deviceId,
                    localRefId = item.localSourceId,
                    fileName = item.fileName,
                    mimeType = item.mimeType,
                    sizeBytes = item.sizeBytes,
                    lastModifiedAt = source.lastModifiedAt,
                    quickFingerprint = item.quickFingerprint ?: "${item.fileName}:${item.sizeBytes}",
                    contentSha256 = contentSha256,
                ),
            )

            if (preflight.decision == "already_exists") {
                val assetId = preflight.existingAssetId ?: return@runCatching Result.failure()
                persistSourceRef(assetId, null, item.localSourceId, item.fileName, item.sizeBytes, contentSha256)
                api.syncRefs(
                    server.deviceId,
                    RefSyncRequest(
                        refs = listOf(
                            RefSyncItem(
                                assetId = assetId,
                                assetVersionId = null,
                                refType = "source_original",
                                localRefId = item.localSourceId,
                                displayName = item.fileName,
                                sizeBytes = item.sizeBytes,
                                contentSha256 = contentSha256,
                                permissionStatus = "granted",
                            ),
                        ),
                    ),
                )
                queueDao.markCompleted(queueId, UploadQueueState.SERVER_IMPORTED, contentSha256, now())
                return@runCatching Result.success()
            }

            queueDao.markPreflightReady(
                queueId = queueId,
                state = UploadQueueState.UPLOADING,
                serverUploadId = preflight.uploadId,
                chunkSize = preflight.chunkSize,
                updatedAt = now(),
            )

            uploadChunks(
                queueId = queueId,
                uploadId = preflight.uploadId,
                chunkSize = preflight.chunkSize,
                receivedChunks = preflight.receivedChunks.toSet(),
                initialBytesUploaded = preflight.bytesReceived,
                uri = uri,
                api = api,
            )
            val completed = api.completeUpload(
                preflight.uploadId,
                CompleteUploadRequest(contentSha256 = contentSha256, totalSizeBytes = item.sizeBytes),
            )
            val completedState = if (completed.status == UploadQueueState.SERVER_IMPORTED.wireValue) {
                UploadQueueState.SERVER_INDEXING
            } else {
                UploadQueueState.UPLOADED
            }
            completed.assetId?.let { assetId ->
                persistSourceRef(assetId, null, item.localSourceId, item.fileName, item.sizeBytes, contentSha256)
                api.syncRefs(
                    server.deviceId,
                    RefSyncRequest(
                        refs = listOf(
                            RefSyncItem(
                                assetId = assetId,
                                assetVersionId = null,
                                refType = "source_original",
                                localRefId = item.localSourceId,
                                displayName = item.fileName,
                                sizeBytes = item.sizeBytes,
                                contentSha256 = contentSha256,
                                permissionStatus = "granted",
                            ),
                        ),
                    ),
                )
            }
            queueDao.markCompleted(queueId, completedState, contentSha256, now())
            Result.success()
        }.getOrElse { error ->
            queueDao.updateState(queueId, UploadQueueState.RETRY_WAIT, now(), error.message)
            Result.retry()
        }
    }

    private suspend fun uploadChunks(
        queueId: String,
        uploadId: String,
        chunkSize: Int,
        receivedChunks: Set<Int>,
        initialBytesUploaded: Long,
        uri: Uri,
        api: com.vibrary.android.network.VibraryApi,
    ) {
        val queueDao = (applicationContext as VibraryApplication).database.uploadQueueDao()
        val mediaType = "application/octet-stream".toMediaType()
        var chunkIndex = 0
        var uploaded = initialBytesUploaded
        applicationContext.contentResolver.openInputStream(uri).use { stream ->
            requireNotNull(stream) { "source URI is not readable" }
            val buffer = ByteArray(chunkSize.coerceAtLeast(64 * 1024))
            while (true) {
                val read = stream.read(buffer)
                if (read <= 0) break
                val bytes = buffer.copyOf(read)
                if (chunkIndex !in receivedChunks) {
                    val body = bytes.toRequestBody(mediaType)
                    api.uploadChunk(uploadId, chunkIndex, sha256(bytes), body)
                    uploaded += read
                    queueDao.updateUploadProgress(queueId, UploadQueueState.UPLOADING, uploaded, now())
                }
                chunkIndex += 1
            }
        }
    }

    private fun sha256(uri: Uri): String {
        val digest = MessageDigest.getInstance("SHA-256")
        applicationContext.contentResolver.openInputStream(uri).use { stream ->
            requireNotNull(stream) { "source URI is not readable" }
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = stream.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private suspend fun persistSourceRef(
        assetId: String,
        assetVersionId: String?,
        localSourceId: String,
        displayName: String,
        sizeBytes: Long,
        contentSha256: String,
    ) {
        val database = (applicationContext as VibraryApplication).database
        val timestamp = now()
        database.localAssetRefDao().upsert(
            LocalAssetRefEntity(
                refId = UUID.randomUUID().toString(),
                assetId = assetId,
                assetVersionId = assetVersionId,
                refType = "source_original",
                localRefId = localSourceId,
                localSourceId = localSourceId,
                cacheEntryId = null,
                displayName = displayName,
                sizeBytes = sizeBytes,
                lastKnownMtime = null,
                contentSha256 = contentSha256,
                permissionStatus = "granted",
                createdAt = timestamp,
                lastVerifiedAt = timestamp,
                isAvailable = true,
            ),
        )
    }

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun now(): String = Instant.now().toString()

    companion object {
        const val KEY_QUEUE_ID = "queue_id"
    }
}
