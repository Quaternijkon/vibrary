package com.vibrary.android.repository

import com.vibrary.android.core.UploadQueuePolicy
import com.vibrary.android.core.UploadQueueState
import com.vibrary.android.data.dao.LocalSourceDao
import com.vibrary.android.data.dao.UploadQueueDao
import com.vibrary.android.data.entities.LocalSourceEntity
import com.vibrary.android.data.entities.UploadQueueEntity
import com.vibrary.android.saf.SafDocumentRef
import com.vibrary.android.saf.SafSelectionStore
import com.vibrary.android.work.UploadWorkScheduler
import java.time.Instant
import java.util.UUID

class SelectionRepository(
    private val localSourceDao: LocalSourceDao,
    private val uploadQueueDao: UploadQueueDao,
    private val uploadWorkScheduler: UploadWorkScheduler? = null,
) : SafSelectionStore {
    override suspend fun persistSelection(documents: List<SafDocumentRef>) {
        val now = Instant.now().toString()
        val sources = documents.map { document ->
            LocalSourceEntity(
                localSourceId = document.localSourceId,
                sourceType = document.sourceType.wireValue,
                uriAlias = document.localSourceId,
                persistedUri = document.uri.toString(),
                displayName = document.displayName,
                mimeType = document.mimeType,
                sizeBytes = document.sizeBytes,
                lastModifiedAt = document.lastModifiedEpochMillis?.let(Instant::ofEpochMilli)?.toString(),
                permissionStatus = "granted",
                createdAt = now,
                lastVerifiedAt = now,
            )
        }
        localSourceDao.upsertAll(sources)

        val queueItems = documents.map { document ->
            val newItem = UploadQueuePolicy.newQueueItem(
                id = UUID.randomUUID().toString(),
                localSourceId = document.localSourceId,
                displayName = document.displayName,
                sizeBytes = document.sizeBytes ?: 0L,
                mimeType = document.mimeType,
                createdAtEpochMillis = System.currentTimeMillis(),
            )
            UploadQueueEntity(
                queueId = newItem.id,
                localSourceId = newItem.localSourceId,
                pairedServerId = null,
                serverUploadId = null,
                fileName = newItem.displayName,
                mimeType = newItem.mimeType,
                sizeBytes = newItem.sizeBytes,
                quickFingerprint = "${newItem.displayName}:${newItem.sizeBytes}:${document.lastModifiedEpochMillis ?: 0L}",
                contentSha256 = null,
                state = UploadQueueState.QUEUED,
                bytesUploaded = 0L,
                chunkSize = null,
                retryCount = 0,
                nextAttemptAt = null,
                createdAt = now,
                updatedAt = now,
                completedAt = null,
                errorMessage = null,
            )
        }
        uploadQueueDao.upsertAll(queueItems)
        queueItems.forEach { item ->
            uploadWorkScheduler?.enqueue(item)
        }
    }
}
