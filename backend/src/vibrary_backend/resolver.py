from __future__ import annotations

from dataclasses import dataclass

from .config import AppPaths
from .database import Database
from .timeutil import utc_now


SMALL_FILE_BYTES = 64 * 1024 * 1024


@dataclass(frozen=True)
class ResolveResult:
    asset_id: str
    asset_version_id: str
    title: str
    mime_type: str
    availability: dict[str, object]
    delivery: dict[str, object]


class ReplicaResolver:
    def __init__(self, db: Database, paths: AppPaths):
        self.db = db
        self.paths = paths

    def resolve(self, asset_id: str, requesting_device_id: str) -> ResolveResult:
        asset = self.db.one("SELECT * FROM assets WHERE asset_id = ?", (asset_id,))
        if asset is None:
            raise KeyError(f"unknown asset: {asset_id}")
        device = self.db.one("SELECT * FROM devices WHERE device_id = ?", (requesting_device_id,))
        device_type = str(device["device_type"]) if device else "android"
        library = self.db.one("SELECT * FROM library_files WHERE asset_id = ? AND exists_flag = 1", (asset_id,))

        local_original = self.db.one(
            """
            SELECT * FROM device_asset_refs
            WHERE device_id = ? AND asset_id = ? AND ref_type = 'source_original'
              AND permission_status = 'granted' AND is_available = 1
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (requesting_device_id, asset_id),
        )
        if local_original:
            return self._result(
                asset,
                True,
                False,
                True,
                "open_local",
                "local_reference",
                None,
                None,
                str(local_original["local_ref_id"]),
                str(local_original["ref_id"]),
            )

        cache_copy = self.db.one(
            """
            SELECT * FROM device_asset_refs
            WHERE device_id = ? AND asset_id = ? AND ref_type = 'cache_copy' AND is_available = 1
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (requesting_device_id, asset_id),
        )
        if cache_copy:
            return self._result(
                asset,
                False,
                True,
                bool(library),
                "open_cache",
                "local_reference",
                None,
                None,
                str(cache_copy["local_ref_id"]),
                str(cache_copy["ref_id"]),
            )

        has_library = bool(library)
        if device_type == "windows" and has_library:
            return self._result(asset, False, False, True, "open_library", "local_reference", None, None, str(library["relative_path"]), None)

        if has_library and int(asset["size_bytes"]) <= SMALL_FILE_BYTES:
            return self._result(
                asset,
                False,
                False,
                True,
                "download",
                "download_to_cache",
                f"/v1/assets/{asset_id}/content?device_id={requesting_device_id}",
                None,
                None,
                None,
            )
        if has_library:
            return self._result(
                asset,
                False,
                False,
                True,
                "stream_or_download",
                "stream_or_download",
                f"/v1/assets/{asset_id}/content?device_id={requesting_device_id}",
                f"/v1/assets/{asset_id}/content?device_id={requesting_device_id}",
                None,
                None,
            )
        return self._result(asset, False, False, False, "unavailable", "unavailable", None, None, None, None)

    def mark_permission_revoked(self, device_id: str, ref_id: str) -> None:
        self.db.execute(
            """
            UPDATE device_asset_refs
            SET permission_status = 'revoked', is_available = 0, last_verified_at = ?
            WHERE device_id = ? AND ref_id = ?
            """,
            (utc_now(), device_id, ref_id),
        )

    def _result(
        self,
        asset,
        has_local_original: bool,
        has_cache_copy: bool,
        server_has_library: bool,
        recommended_action: str,
        mode: str,
        download_url: str | None,
        stream_url: str | None,
        local_ref_id: str | None,
        ref_id: str | None,
    ) -> ResolveResult:
        return ResolveResult(
            asset_id=str(asset["asset_id"]),
            asset_version_id=str(asset["active_version_id"]),
            title=str(asset["original_name"]),
            mime_type=str(asset["mime_type"]),
            availability={
                "requesting_device": {
                    "has_local_original": has_local_original,
                    "has_cache_copy": has_cache_copy,
                    "local_ref_id": local_ref_id,
                    "ref_id": ref_id,
                    "recommended_action": recommended_action,
                },
                "server": {
                    "has_library_copy": server_has_library,
                    "can_stream": server_has_library,
                },
            },
            delivery={
                "mode": mode,
                "download_url": download_url,
                "stream_url": stream_url,
                "local_ref_id": local_ref_id,
                "ref_id": ref_id,
            },
        )
