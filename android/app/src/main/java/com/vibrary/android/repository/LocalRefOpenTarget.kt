package com.vibrary.android.repository

import com.vibrary.android.data.entities.LocalAssetRefEntity

sealed interface LocalRefOpenTarget {
    data class Source(val localSourceId: String) : LocalRefOpenTarget
    data class Cache(val cacheEntryId: String) : LocalRefOpenTarget
    data object Unavailable : LocalRefOpenTarget

    companion object {
        fun from(ref: LocalAssetRefEntity): LocalRefOpenTarget =
            when {
                ref.localSourceId != null -> Source(ref.localSourceId)
                ref.cacheEntryId != null -> Cache(ref.cacheEntryId)
                else -> Unavailable
            }
    }
}
