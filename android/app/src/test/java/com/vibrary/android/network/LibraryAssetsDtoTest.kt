package com.vibrary.android.network

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class LibraryAssetsDtoTest {
    @Test
    fun `decodes shared library center response with thumbnail urls`() {
        val decoded = Json.decodeFromString<LibraryAssetsResponse>(
            """
            {
              "total_count": 1,
              "limit": 100,
              "offset": 0,
              "assets": [
                {
                  "asset_id": "asset_1",
                  "asset_version_id": "ver_1",
                  "title": "photo.jpg",
                  "kind": "image",
                  "mime_type": "image/jpeg",
                  "size_bytes": 12,
                  "content_sha256": "abc",
                  "index_status": "indexed",
                  "library_status": "present",
                  "thumbnail_url": "/v1/assets/asset_1/thumbnail",
                  "content_url": "/v1/assets/asset_1/content",
                  "sources": [
                    {
                      "device_id": "windows-local",
                      "device_name": "Windows",
                      "device_type": "windows",
                      "ref_type": "library_copy",
                      "display_name": "photo.jpg"
                    }
                  ],
                  "availability": {
                    "requesting_device": {
                      "recommended_action": "download"
                    }
                  }
                }
              ]
            }
            """.trimIndent(),
        )

        assertEquals(1, decoded.totalCount)
        assertEquals("photo.jpg", decoded.assets.single().title)
        assertEquals("image", decoded.assets.single().kind)
        assertEquals("/v1/assets/asset_1/thumbnail", decoded.assets.single().thumbnailUrl)
        assertEquals("Windows", decoded.assets.single().sources.single().deviceName)
    }
}
