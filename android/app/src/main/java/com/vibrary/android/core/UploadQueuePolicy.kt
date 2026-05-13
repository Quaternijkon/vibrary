package com.vibrary.android.core

enum class UploadQueueState(val wireValue: String) {
    QUEUED("queued"),
    CHECKING("checking"),
    HASHING("hashing"),
    PREFLIGHT("preflight"),
    UPLOADING("uploading"),
    PAUSED("paused"),
    RETRY_WAIT("retry_wait"),
    UPLOADED("uploaded"),
    SERVER_IMPORTED("server_imported"),
    SERVER_INDEXING("server_indexing"),
    SERVER_INDEXED("server_indexed"),
    FAILED("failed"),
    CANCELLED("cancelled");

    companion object {
        fun fromWireValue(value: String): UploadQueueState =
            entries.first { it.wireValue == value }
    }
}

data class NewUploadQueueItem(
    val id: String,
    val localSourceId: String,
    val displayName: String,
    val sizeBytes: Long,
    val mimeType: String?,
    val state: UploadQueueState,
    val createdAtEpochMillis: Long,
    val hasStartedNetworkTransfer: Boolean,
)

object UploadQueuePolicy {
    fun newQueueItem(
        id: String,
        localSourceId: String,
        displayName: String,
        sizeBytes: Long,
        mimeType: String?,
        createdAtEpochMillis: Long,
    ): NewUploadQueueItem =
        NewUploadQueueItem(
            id = id,
            localSourceId = localSourceId,
            displayName = displayName,
            sizeBytes = sizeBytes,
            mimeType = mimeType,
            state = UploadQueueState.QUEUED,
            createdAtEpochMillis = createdAtEpochMillis,
            hasStartedNetworkTransfer = false,
        )

    fun isSchedulable(state: UploadQueueState): Boolean =
        state == UploadQueueState.QUEUED || state == UploadQueueState.RETRY_WAIT || state == UploadQueueState.FAILED
}
