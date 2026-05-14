package com.vibrary.android.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.vibrary.android.data.entities.PairedServerEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PairedServerDao {
    @Query("SELECT * FROM paired_servers WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1")
    suspend fun activeServer(): PairedServerEntity?

    @Query("SELECT * FROM paired_servers WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1")
    fun observeActiveServer(): Flow<PairedServerEntity?>

    @Upsert
    suspend fun upsert(server: PairedServerEntity)

    @Query("UPDATE paired_servers SET is_active = 0 WHERE paired_server_id = :pairedServerId")
    suspend fun deactivate(pairedServerId: String)

    @Query("UPDATE paired_servers SET is_active = 0")
    suspend fun deactivateAll()

    @Query(
        """
        UPDATE paired_servers
        SET base_url = :baseUrl,
            display_name = :displayName,
            server_instance_id = :serverInstanceId,
            last_seen_at = :lastSeenAt
        WHERE paired_server_id = :pairedServerId
        """,
    )
    suspend fun refreshDiscoveredEndpoint(
        pairedServerId: String,
        baseUrl: String,
        displayName: String,
        serverInstanceId: String,
        lastSeenAt: String,
    )
}
