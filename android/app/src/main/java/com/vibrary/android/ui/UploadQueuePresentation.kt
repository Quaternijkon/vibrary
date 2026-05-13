package com.vibrary.android.ui

import com.vibrary.android.core.UploadQueueState
import com.vibrary.android.data.entities.UploadQueueEntity

data class UploadQueueRow(
    val id: String,
    val title: String,
    val stateLabel: String,
    val progressLabel: String,
    val progressFraction: Float,
    val detail: String?,
)

fun UploadQueueEntity.toUploadQueueRow(): UploadQueueRow =
    UploadQueueRow(
        id = queueId,
        title = fileName,
        stateLabel = uploadStateLabel(state),
        progressLabel = formatUploadProgress(bytesUploaded, sizeBytes),
        progressFraction = progressFraction(bytesUploaded, sizeBytes),
        detail = errorMessage,
    )

fun uploadStateLabel(state: UploadQueueState): String = when (state) {
    UploadQueueState.QUEUED -> "等待"
    UploadQueueState.CHECKING -> "检查"
    UploadQueueState.HASHING -> "计算哈希"
    UploadQueueState.PREFLIGHT -> "预检"
    UploadQueueState.UPLOADING -> "上传中"
    UploadQueueState.PAUSED -> "暂停"
    UploadQueueState.RETRY_WAIT -> "等待重试"
    UploadQueueState.UPLOADED -> "已上传"
    UploadQueueState.SERVER_IMPORTED -> "电脑已导入"
    UploadQueueState.SERVER_INDEXING -> "电脑正在索引"
    UploadQueueState.SERVER_INDEXED -> "已索引"
    UploadQueueState.FAILED -> "失败"
    UploadQueueState.CANCELLED -> "已取消"
}

private fun formatUploadProgress(bytesUploaded: Long, sizeBytes: Long): String {
    if (sizeBytes <= 0L) {
        return "${formatBytes(bytesUploaded)} / 未知大小"
    }
    val clamped = bytesUploaded.coerceIn(0L, sizeBytes)
    val percent = ((clamped * 100) / sizeBytes).toInt()
    return "${formatUploadedBytes(clamped, sizeBytes)} / ${formatBytes(sizeBytes)} ($percent%)"
}

private fun progressFraction(bytesUploaded: Long, sizeBytes: Long): Float {
    if (sizeBytes <= 0L) return 0f
    return bytesUploaded.toFloat().coerceIn(0f, sizeBytes.toFloat()) / sizeBytes.toFloat()
}

private fun formatBytes(value: Long): String {
    if (value < 1024) return "$value B"
    if (value < 1024 * 1024) return "${"%.1f".format(value / 1024.0)} KB"
    return "${"%.1f".format(value / 1024.0 / 1024.0)} MB"
}

private fun formatUploadedBytes(uploaded: Long, total: Long): String =
    if (total < 1024) uploaded.toString() else formatBytes(uploaded)
