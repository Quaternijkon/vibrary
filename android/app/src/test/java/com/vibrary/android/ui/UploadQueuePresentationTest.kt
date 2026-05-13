package com.vibrary.android.ui

import com.vibrary.android.core.UploadQueueState
import com.vibrary.android.data.entities.UploadQueueEntity
import kotlin.test.Test
import kotlin.test.assertEquals

class UploadQueuePresentationTest {
    @Test
    fun `formats upload queue rows with real progress and error`() {
        val uploading = entity(
            fileName = "report.pdf",
            state = UploadQueueState.UPLOADING,
            sizeBytes = 100,
            bytesUploaded = 40,
        )
        val failed = entity(
            fileName = "photo.jpg",
            state = UploadQueueState.RETRY_WAIT,
            sizeBytes = 200,
            bytesUploaded = 50,
            errorMessage = "network timeout",
        )

        assertEquals("report.pdf", uploading.toUploadQueueRow().title)
        assertEquals("上传中", uploading.toUploadQueueRow().stateLabel)
        assertEquals("40 / 100 B (40%)", uploading.toUploadQueueRow().progressLabel)
        assertEquals("network timeout", failed.toUploadQueueRow().detail)
    }

    private fun entity(
        fileName: String,
        state: UploadQueueState,
        sizeBytes: Long,
        bytesUploaded: Long,
        errorMessage: String? = null,
    ): UploadQueueEntity =
        UploadQueueEntity(
            queueId = fileName,
            localSourceId = "local-$fileName",
            pairedServerId = null,
            serverUploadId = null,
            fileName = fileName,
            mimeType = null,
            sizeBytes = sizeBytes,
            quickFingerprint = null,
            contentSha256 = null,
            state = state,
            bytesUploaded = bytesUploaded,
            chunkSize = null,
            retryCount = 0,
            nextAttemptAt = null,
            createdAt = "2026-05-13T00:00:00Z",
            updatedAt = "2026-05-13T00:00:00Z",
            completedAt = null,
            errorMessage = errorMessage,
        )
}
