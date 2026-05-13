package com.vibrary.android.core

enum class DeliveryMode(val wireValue: String) {
    LOCAL_REFERENCE("local_reference"),
    DOWNLOAD_TO_CACHE("download_to_cache"),
    STREAM_OR_DOWNLOAD("stream_or_download"),
    UNAVAILABLE("unavailable");
}

data class DeliveryDescriptor(
    val mode: DeliveryMode,
    val assetId: String? = null,
    val fileName: String? = null,
    val localRefId: String? = null,
    val refId: String? = null,
    val downloadUrl: String? = null,
    val streamUrl: String? = null,
)

sealed interface LocalOpenResult {
    data object NotAttempted : LocalOpenResult
    data object Opened : LocalOpenResult
    data object PermissionRevoked : LocalOpenResult
    data class Failed(val reason: String) : LocalOpenResult
}

sealed interface ResultAction {
    data class OpenLocal(val localRefId: String) : ResultAction
    data class ReportRevokedThenDownload(val refId: String, val downloadUrl: String) : ResultAction
    data class DownloadToAppCache(val assetId: String, val fileName: String, val downloadUrl: String) : ResultAction
    data class OfferStreamOrDownload(val streamUrl: String?, val downloadUrl: String?) : ResultAction
    data object Unavailable : ResultAction
}

object ResultResolutionPolicy {
    fun resolve(delivery: DeliveryDescriptor, localOpenResult: LocalOpenResult): ResultAction =
        when (delivery.mode) {
            DeliveryMode.LOCAL_REFERENCE -> when (localOpenResult) {
                LocalOpenResult.Opened -> ResultAction.OpenLocal(requireNotNull(delivery.localRefId))
                LocalOpenResult.PermissionRevoked,
                is LocalOpenResult.Failed,
                LocalOpenResult.NotAttempted,
                -> ResultAction.ReportRevokedThenDownload(
                    refId = requireNotNull(delivery.refId),
                    downloadUrl = requireNotNull(delivery.downloadUrl),
                )
            }

            DeliveryMode.DOWNLOAD_TO_CACHE -> ResultAction.DownloadToAppCache(
                assetId = requireNotNull(delivery.assetId),
                fileName = requireNotNull(delivery.fileName),
                downloadUrl = requireNotNull(delivery.downloadUrl),
            )

            DeliveryMode.STREAM_OR_DOWNLOAD -> ResultAction.OfferStreamOrDownload(
                streamUrl = delivery.streamUrl,
                downloadUrl = delivery.downloadUrl,
            )

            DeliveryMode.UNAVAILABLE -> ResultAction.Unavailable
        }
}
