package com.vibrary.android.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.vibrary.android.data.entities.LocalSourceEntity

@Dao
interface LocalSourceDao {
    @Query("SELECT * FROM local_sources WHERE local_source_id = :localSourceId LIMIT 1")
    suspend fun findById(localSourceId: String): LocalSourceEntity?

    @Upsert
    suspend fun upsertAll(sources: List<LocalSourceEntity>)
}
