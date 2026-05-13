package com.vibrary.android.core

import kotlin.test.Test
import kotlin.test.assertEquals

class ResultResolutionPolicyTest {
    @Test
    fun `local reference opens local SAF uri when permission is valid`() {
        val action = ResultResolutionPolicy.resolve(
            delivery = DeliveryDescriptor(mode = DeliveryMode.LOCAL_REFERENCE, localRefId = "local-1"),
            localOpenResult = LocalOpenResult.Opened,
        )

        assertEquals(ResultAction.OpenLocal("local-1"), action)
    }

    @Test
    fun `local reference reports revoked permission and downloads to cache when open fails`() {
        val action = ResultResolutionPolicy.resolve(
            delivery = DeliveryDescriptor(
                mode = DeliveryMode.LOCAL_REFERENCE,
                localRefId = "local-1",
                refId = "server-ref-1",
                downloadUrl = "/v1/assets/a/content",
            ),
            localOpenResult = LocalOpenResult.PermissionRevoked,
        )

        assertEquals(
            ResultAction.ReportRevokedThenDownload(
                refId = "server-ref-1",
                downloadUrl = "/v1/assets/a/content",
            ),
            action,
        )
    }

    @Test
    fun `download to cache writes into app cache`() {
        val action = ResultResolutionPolicy.resolve(
            delivery = DeliveryDescriptor(
                mode = DeliveryMode.DOWNLOAD_TO_CACHE,
                assetId = "asset-1",
                fileName = "paper.pdf",
                downloadUrl = "/v1/assets/asset-1/content",
            ),
            localOpenResult = LocalOpenResult.NotAttempted,
        )

        assertEquals(
            ResultAction.DownloadToAppCache(
                assetId = "asset-1",
                fileName = "paper.pdf",
                downloadUrl = "/v1/assets/asset-1/content",
            ),
            action,
        )
    }
}
