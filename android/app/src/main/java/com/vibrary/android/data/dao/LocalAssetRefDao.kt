package com.vibrary.android.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.vibrary.android.data.entities.LocalAssetRefEntity

@Dao
interface LocalAssetRefDao {
    @Query("SELECT * FROM local_asset_refs WHERE local_ref_id = :localRefId AND is_available = 1 LIMIT 1")
    suspend fun findByLocalRefId(localRefId: String): LocalAssetRefEntity?

    @Upsert
    suspend fun upsert(ref: LocalAssetRefEntity)
}
