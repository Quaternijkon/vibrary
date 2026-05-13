package com.vibrary.android.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.vibrary.android.data.entities.PairedServerEntity

@Dao
interface PairedServerDao {
    @Query("SELECT * FROM paired_servers WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1")
    suspend fun activeServer(): PairedServerEntity?

    @Upsert
    suspend fun upsert(server: PairedServerEntity)
}
