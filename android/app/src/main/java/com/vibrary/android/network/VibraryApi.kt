package com.vibrary.android.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface VibraryApi {
    @POST("/v1/pairing/claim")
    suspend fun claimPairing(@Body request: PairingClaimRequest): PairingClaimResponse

    @POST("/v1/uploads/preflight")
    suspend fun preflight(@Body request: PreflightRequest): PreflightResponse

    @PUT("/v1/uploads/{upload_id}/chunks/{chunk_index}")
    suspend fun uploadChunk(
        @Path("upload_id") uploadId: String,
        @Path("chunk_index") chunkIndex: Int,
        @Query("chunk_sha256") chunkSha256: String,
        @Body body: RequestBody,
    ): ChunkUploadResponse

    @GET("/v1/uploads/{upload_id}/status")
    suspend fun uploadStatus(@Path("upload_id") uploadId: String): UploadStatusResponse

    @POST("/v1/uploads/{upload_id}/complete")
    suspend fun completeUpload(
        @Path("upload_id") uploadId: String,
        @Body request: CompleteUploadRequest,
    ): CompleteUploadResponse

    @POST("/v1/search")
    suspend fun search(@Body request: SearchRequest): SearchResponse

    @GET("/v1/library/assets")
    suspend fun libraryAssets(
        @Query("device_id") deviceId: String,
        @Query("limit") limit: Int = 100,
    ): LibraryAssetsResponse

    @POST("/v1/assets/{asset_id}/resolve")
    suspend fun resolveAsset(
        @Path("asset_id") assetId: String,
        @Body request: ResolveRequest,
    ): ResolveResponse

    @POST("/v1/devices/{device_id}/refs/sync")
    suspend fun syncRefs(
        @Path("device_id") deviceId: String,
        @Body request: RefSyncRequest,
    ): RefSyncResponse

    @POST("/v1/devices/{device_id}/refs/{ref_id}/permission-revoked")
    suspend fun markPermissionRevoked(
        @Path("device_id") deviceId: String,
        @Path("ref_id") refId: String,
    ): RefPermissionResponse

    @POST("/v1/devices/{device_id}/refs/{ref_id}/verified")
    suspend fun markRefVerified(
        @Path("device_id") deviceId: String,
        @Path("ref_id") refId: String,
    ): RefPermissionResponse

    @DELETE("/v1/devices/{device_id}")
    suspend fun deleteDevice(@Path("device_id") deviceId: String): DeleteDeviceResponse
}

@Serializable
data class PairingClaimRequest(
    @SerialName("device_id") val deviceId: String,
    @SerialName("device_name") val deviceName: String,
    @SerialName("device_type") val deviceType: String = "android",
    @SerialName("pairing_token") val pairingToken: String,
)

@Serializable
data class PairingClaimResponse(
    val trusted: Boolean,
    @SerialName("device_token") val deviceToken: String,
)

@Serializable
data class DeleteDeviceResponse(
    @SerialName("device_id") val deviceId: String,
    val revoked: Boolean,
)

@Serializable
data class PreflightRequest(
    @SerialName("device_id") val deviceId: String,
    @SerialName("local_ref_id") val localRefId: String,
    @SerialName("file_name") val fileName: String,
    @SerialName("mime_type") val mimeType: String?,
    @SerialName("size_bytes") val sizeBytes: Long,
    @SerialName("last_modified_at") val lastModifiedAt: String?,
    @SerialName("quick_fingerprint") val quickFingerprint: String,
    @SerialName("content_sha256") val contentSha256: String? = null,
)

@Serializable
data class PreflightResponse(
    @SerialName("upload_id") val uploadId: String,
    val decision: String,
    @SerialName("chunk_size") val chunkSize: Int,
    @SerialName("existing_asset_id") val existingAssetId: String?,
    @SerialName("bytes_received") val bytesReceived: Long = 0L,
    @SerialName("received_chunks") val receivedChunks: List<Int> = emptyList(),
)

@Serializable
data class ChunkUploadResponse(
    @SerialName("upload_id") val uploadId: String,
    @SerialName("chunk_index") val chunkIndex: Int,
    val status: String,
)

@Serializable
data class UploadStatusResponse(
    @SerialName("upload_id") val uploadId: String,
    val status: String,
    @SerialName("bytes_received") val bytesReceived: Long,
    @SerialName("resulting_asset_id") val resultingAssetId: String? = null,
    @SerialName("error_message") val errorMessage: String? = null,
)

@Serializable
data class CompleteUploadRequest(
    @SerialName("content_sha256") val contentSha256: String,
    @SerialName("total_size_bytes") val totalSizeBytes: Long,
)

@Serializable
data class CompleteUploadResponse(
    @SerialName("upload_id") val uploadId: String,
    val status: String,
    @SerialName("asset_id") val assetId: String? = null,
)

@Serializable
data class SearchRequest(
    @SerialName("device_id") val deviceId: String,
    val query: String,
    @SerialName("search_types") val searchTypes: List<String>,
    val limit: Int,
    val filters: SearchFilters? = null,
)

@Serializable
data class SearchFilters(
    @SerialName("mime_types") val mimeTypes: List<String>? = null,
)

@Serializable
data class SearchResponse(
    val results: List<SearchResultDto>,
)

@Serializable
data class LibraryAssetsResponse(
    @SerialName("total_count") val totalCount: Int,
    val limit: Int,
    val offset: Int,
    val assets: List<LibraryAssetDto>,
)

@Serializable
data class LibraryAssetDto(
    @SerialName("asset_id") val assetId: String,
    @SerialName("asset_version_id") val assetVersionId: String? = null,
    val title: String,
    val kind: String,
    @SerialName("mime_type") val mimeType: String? = null,
    @SerialName("size_bytes") val sizeBytes: Long,
    @SerialName("content_sha256") val contentSha256: String,
    @SerialName("index_status") val indexStatus: String,
    @SerialName("library_status") val libraryStatus: String,
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
    @SerialName("content_url") val contentUrl: String? = null,
    val sources: List<LibraryAssetSourceDto> = emptyList(),
    val availability: AvailabilityDto? = null,
    val delivery: DeliveryDto? = null,
)

@Serializable
data class LibraryAssetSourceDto(
    @SerialName("ref_id") val refId: String? = null,
    @SerialName("device_id") val deviceId: String,
    @SerialName("device_name") val deviceName: String,
    @SerialName("device_type") val deviceType: String,
    @SerialName("ref_type") val refType: String,
    @SerialName("display_name") val displayName: String? = null,
)

@Serializable
data class SearchResultDto(
    @SerialName("asset_id") val assetId: String,
    @SerialName("asset_version_id") val assetVersionId: String?,
    val title: String,
    @SerialName("mime_type") val mimeType: String?,
    val score: Double,
    @SerialName("matched_by") val matchedBy: List<String>,
    val snippet: String?,
    @SerialName("thumbnail_url") val thumbnailUrl: String?,
    val availability: AvailabilityDto,
    val delivery: DeliveryDto,
)

@Serializable
data class AvailabilityDto(
    @SerialName("requesting_device") val requestingDevice: RequestingDeviceAvailabilityDto,
)

@Serializable
data class RequestingDeviceAvailabilityDto(
    @SerialName("has_local_original") val hasLocalOriginal: Boolean = false,
    @SerialName("has_cache_copy") val hasCacheCopy: Boolean = false,
    @SerialName("local_ref_id") val localRefId: String? = null,
    @SerialName("ref_id") val refId: String? = null,
    @SerialName("recommended_action") val recommendedAction: String,
)

@Serializable
data class DeliveryDto(
    val mode: String,
    @SerialName("local_ref_id") val localRefId: String? = null,
    @SerialName("ref_id") val refId: String? = null,
    @SerialName("download_url") val downloadUrl: String? = null,
    @SerialName("stream_url") val streamUrl: String? = null,
)

@Serializable
data class ResolveRequest(
    @SerialName("device_id") val deviceId: String,
)

@Serializable
data class ResolveResponse(
    @SerialName("asset_id") val assetId: String,
    @SerialName("asset_version_id") val assetVersionId: String?,
    val title: String,
    @SerialName("mime_type") val mimeType: String?,
    val availability: AvailabilityDto,
    val delivery: DeliveryDto,
)

@Serializable
data class RefSyncRequest(
    val refs: List<RefSyncItem>,
)

@Serializable
data class RefSyncItem(
    @SerialName("asset_id") val assetId: String,
    @SerialName("asset_version_id") val assetVersionId: String? = null,
    @SerialName("ref_type") val refType: String,
    @SerialName("local_ref_id") val localRefId: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("size_bytes") val sizeBytes: Long? = null,
    @SerialName("content_sha256") val contentSha256: String? = null,
    @SerialName("permission_status") val permissionStatus: String,
)

@Serializable
data class RefSyncResponse(
    @SerialName("accepted_count") val acceptedCount: Int,
)

@Serializable
data class RefPermissionResponse(
    @SerialName("ref_id") val refId: String,
    @SerialName("permission_status") val permissionStatus: String,
)
