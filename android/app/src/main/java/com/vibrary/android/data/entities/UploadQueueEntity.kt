package com.vibrary.android.data.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.vibrary.android.core.UploadQueueState

@Entity(
    tableName = "upload_queue",
    indices = [
        Index(value = ["local_source_id"]),
        Index(value = ["paired_server_id"]),
        Index(value = ["state"]),
    ],
)
data class UploadQueueEntity(
    @PrimaryKey
    @ColumnInfo(name = "queue_id")
    val queueId: String,
    @ColumnInfo(name = "local_source_id")
    val localSourceId: String,
    @ColumnInfo(name = "paired_server_id")
    val pairedServerId: String?,
    @ColumnInfo(name = "server_upload_id")
    val serverUploadId: String?,
    @ColumnInfo(name = "file_name")
    val fileName: String,
    @ColumnInfo(name = "mime_type")
    val mimeType: String?,
    @ColumnInfo(name = "size_bytes")
    val sizeBytes: Long,
    @ColumnInfo(name = "quick_fingerprint")
    val quickFingerprint: String?,
    @ColumnInfo(name = "content_sha256")
    val contentSha256: String?,
    @ColumnInfo(name = "state")
    val state: UploadQueueState,
    @ColumnInfo(name = "bytes_uploaded")
    val bytesUploaded: Long,
    @ColumnInfo(name = "chunk_size")
    val chunkSize: Int?,
    @ColumnInfo(name = "retry_count")
    val retryCount: Int,
    @ColumnInfo(name = "next_attempt_at")
    val nextAttemptAt: String?,
    @ColumnInfo(name = "created_at")
    val createdAt: String,
    @ColumnInfo(name = "updated_at")
    val updatedAt: String,
    @ColumnInfo(name = "completed_at")
    val completedAt: String?,
    @ColumnInfo(name = "error_message")
    val errorMessage: String?,
)
