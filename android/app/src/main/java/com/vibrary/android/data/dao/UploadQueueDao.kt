package com.vibrary.android.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.vibrary.android.core.UploadQueueState
import com.vibrary.android.data.entities.UploadQueueEntity

@Dao
interface UploadQueueDao {
    @Query("SELECT * FROM upload_queue WHERE queue_id = :queueId LIMIT 1")
    suspend fun findById(queueId: String): UploadQueueEntity?

    @Upsert
    suspend fun upsertAll(items: List<UploadQueueEntity>)

    @Query(
        """
        UPDATE upload_queue
        SET state = :state, updated_at = :updatedAt, error_message = :errorMessage
        WHERE queue_id = :queueId
        """,
    )
    suspend fun updateState(
        queueId: String,
        state: UploadQueueState,
        updatedAt: String,
        errorMessage: String? = null,
    )

    @Query(
        """
        UPDATE upload_queue
        SET state = :state,
            server_upload_id = :serverUploadId,
            chunk_size = :chunkSize,
            updated_at = :updatedAt,
            error_message = NULL
        WHERE queue_id = :queueId
        """,
    )
    suspend fun markPreflightReady(
        queueId: String,
        state: UploadQueueState,
        serverUploadId: String,
        chunkSize: Int,
        updatedAt: String,
    )

    @Query(
        """
        UPDATE upload_queue
        SET state = :state,
            bytes_uploaded = :bytesUploaded,
            updated_at = :updatedAt,
            error_message = NULL
        WHERE queue_id = :queueId
        """,
    )
    suspend fun updateUploadProgress(
        queueId: String,
        state: UploadQueueState,
        bytesUploaded: Long,
        updatedAt: String,
    )

    @Query(
        """
        UPDATE upload_queue
        SET state = :state,
            content_sha256 = :contentSha256,
            updated_at = :updatedAt,
            completed_at = :updatedAt,
            error_message = NULL
        WHERE queue_id = :queueId
        """,
    )
    suspend fun markCompleted(
        queueId: String,
        state: UploadQueueState,
        contentSha256: String,
        updatedAt: String,
    )
}
