from __future__ import annotations

import mimetypes
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .config import DEFAULT_EMBEDDING_PROFILE, IMAGE_COLLECTION, IMAGE_LABEL_COLLECTION, AppPaths
from .database import Database, new_id
from .hashing import sha256_file
from .timeutil import utc_now

if TYPE_CHECKING:
    from .resolver import ReplicaResolver


TEXT_EXTENSIONS = {".txt", ".md", ".json", ".csv", ".log", ".html", ".xml"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}


@dataclass(frozen=True)
class ImportedAsset:
    asset_id: str
    asset_version_id: str
    content_sha256: str
    library_path: Path


@dataclass
class ImportResult:
    scanned_count: int = 0
    imported_count: int = 0
    duplicate_count: int = 0
    failed_count: int = 0
    index_queued_count: int = 0
    assets: list[ImportedAsset] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class LibraryService:
    def __init__(self, db: Database, paths: AppPaths):
        self.db = db
        self.paths = paths

    def list_assets(
        self,
        resolver: "ReplicaResolver",
        *,
        device_id: str | None = None,
        query: str | None = None,
        kind: str = "all",
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        where_sql, params = self._asset_filters(query=query, kind=kind)
        total_count = int(self.db.scalar(f"SELECT COUNT(*) FROM assets a {where_sql}", params) or 0)
        rows = self.db.query(
            f"""
            SELECT
              a.*,
              lf.relative_path,
              lf.exists_flag,
              ij.status AS latest_index_status,
              ij.job_type AS latest_index_job_type,
              ij.error_message AS latest_index_error,
              ij.completed_at AS latest_index_completed_at
            FROM assets a
            LEFT JOIN library_files lf ON lf.asset_id = a.asset_id AND lf.exists_flag = 1
            LEFT JOIN index_jobs ij ON ij.index_job_id = (
              SELECT index_job_id
              FROM index_jobs
              WHERE asset_id = a.asset_id
              ORDER BY created_at DESC
              LIMIT 1
            )
            {where_sql}
            ORDER BY a.first_seen_at DESC, a.original_name COLLATE NOCASE ASC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        )
        assets = [self._library_asset_payload(row, resolver, device_id) for row in rows]
        return {"total_count": total_count, "limit": limit, "offset": offset, "assets": assets}

    def thumbnail_target(self, asset_id: str) -> tuple[Path, str] | None:
        row = self.db.one(
            """
            SELECT a.mime_type, a.normalized_ext, lf.relative_path
            FROM assets a
            JOIN library_files lf ON lf.asset_id = a.asset_id AND lf.exists_flag = 1
            WHERE a.asset_id = ?
            LIMIT 1
            """,
            (asset_id,),
        )
        if row is None:
            return None
        mime_type = str(row["mime_type"] or "application/octet-stream")
        ext = f".{row['normalized_ext']}" if row["normalized_ext"] else ""
        if _asset_kind(mime_type, ext) != "image":
            return None
        path = self.paths.resolve_data_path(str(row["relative_path"]))
        if not path.exists():
            return None
        return path, mime_type

    def import_path(self, path: Path, device_id: str, original_name: str | None = None) -> ImportResult:
        source = Path(path)
        result = ImportResult()
        if source.is_dir():
            for child in sorted(source.rglob("*")):
                if child.is_file():
                    self._import_file(child, device_id, result, original_name=None)
            return result
        self._import_file(source, device_id, result, original_name=original_name)
        return result

    def _import_file(self, source: Path, device_id: str, result: ImportResult, original_name: str | None) -> None:
        result.scanned_count += 1
        try:
            source = source.resolve()
            display_name = original_name or source.name
            size_bytes = source.stat().st_size
            content_sha = sha256_file(source)
            ext = Path(display_name).suffix.lower()
            mime_type = mimetypes.guess_type(display_name)[0] or "application/octet-stream"
            existing = self.db.one("SELECT * FROM assets WHERE content_sha256 = ?", (content_sha,))

            if existing:
                result.duplicate_count += 1
                asset_id = str(existing["asset_id"])
                version_id = str(existing["active_version_id"])
                library_row = self.db.one("SELECT relative_path FROM library_files WHERE asset_id = ? AND exists_flag = 1", (asset_id,))
                if library_row is None:
                    library_path = self._copy_to_library(source, content_sha, ext)
                    relative_path = self.paths.relative_to_data(library_path)
                    self._insert_library_file(asset_id, version_id, relative_path)
                else:
                    library_path = self.paths.resolve_data_path(str(library_row["relative_path"]))
                self._add_library_ref(device_id, asset_id, version_id, display_name, size_bytes, content_sha)
                if self._queue_index_job(asset_id, version_id, ext, mime_type):
                    result.index_queued_count += 1
                result.assets.append(ImportedAsset(asset_id, version_id, content_sha, library_path))
                return

            asset_id = new_id("asset")
            version_id = new_id("ver")
            library_path = self._copy_to_library(source, content_sha, ext)
            now = utc_now()
            self.db.execute(
                """
                INSERT INTO assets(
                    asset_id, content_sha256, original_name, normalized_ext, mime_type,
                    size_bytes, first_seen_device_id, first_seen_at, library_status,
                    index_status, active_version_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'present', 'queued', ?)
                """,
                (asset_id, content_sha, display_name, ext.lstrip(".") or None, mime_type, size_bytes, device_id, now, version_id),
            )
            self.db.execute(
                """
                INSERT INTO asset_versions(
                    asset_version_id, asset_id, content_sha256, size_bytes, mime_type,
                    parser_version, embedding_profile_id, created_at, is_active
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (version_id, asset_id, content_sha, size_bytes, mime_type, "parser_v1", DEFAULT_EMBEDDING_PROFILE, now),
            )
            self._insert_library_file(asset_id, version_id, self.paths.relative_to_data(library_path))
            self._add_library_ref(device_id, asset_id, version_id, display_name, size_bytes, content_sha)
            if self._queue_index_job(asset_id, version_id, ext, mime_type):
                result.index_queued_count += 1
            result.imported_count += 1
            result.assets.append(ImportedAsset(asset_id, version_id, content_sha, library_path))
        except Exception as exc:  # pragma: no cover - defensive path is asserted via failed_count.
            result.failed_count += 1
            result.errors.append(f"{source}: {exc}")

    def _copy_to_library(self, source: Path, content_sha: str, ext: str) -> Path:
        suffix = ext if ext else ".bin"
        target = self.paths.library_files_dir / content_sha[:2] / f"{content_sha}{suffix}"
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copy2(source, target)
        return target

    def _insert_library_file(self, asset_id: str, version_id: str, relative_path: str) -> None:
        self.db.execute(
            """
            INSERT OR IGNORE INTO library_files(
                library_file_id, asset_id, asset_version_id, relative_path,
                storage_class, created_at, verified_at, exists_flag
            )
            VALUES (?, ?, ?, ?, 'library_copy', ?, ?, 1)
            """,
            (new_id("lib"), asset_id, version_id, relative_path, utc_now(), utc_now()),
        )

    def _add_library_ref(
        self,
        device_id: str,
        asset_id: str,
        version_id: str,
        display_name: str,
        size_bytes: int,
        content_sha: str,
    ) -> None:
        self.db.add_device_asset_ref(
            device_id=device_id,
            asset_id=asset_id,
            asset_version_id=version_id,
            ref_type="library_copy",
            local_ref_id=asset_id,
            display_name=display_name,
            size_bytes=size_bytes,
            content_sha256=content_sha,
            permission_status="not_applicable",
        )

    def _queue_index_job(self, asset_id: str, version_id: str, ext: str, mime_type: str) -> bool:
        lowered_mime = mime_type.lower()
        if ext in IMAGE_EXTENSIONS or lowered_mime.startswith("image/"):
            job_type = "image"
        elif ext == ".pdf":
            job_type = "text"
        elif ext in TEXT_EXTENSIONS or lowered_mime.startswith("text/"):
            job_type = "text"
        else:
            job_type = "text"
        existing = self.db.one(
            """
            SELECT * FROM index_jobs
            WHERE asset_id = ? AND asset_version_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (asset_id, version_id),
        )
        if existing:
            if str(existing["status"]) in {"queued", "indexing", "retry_wait"}:
                return False
            if self._asset_is_searchable(asset_id, version_id):
                return False
            self.db.execute(
                """
                UPDATE index_jobs
                SET job_type = ?, status = 'queued', priority = 100, parser_version = 'parser_v1',
                    embedding_profile_id = ?, started_at = NULL, completed_at = NULL,
                    error_message = NULL, retry_count = 0
                WHERE index_job_id = ?
                """,
                (job_type, DEFAULT_EMBEDDING_PROFILE, existing["index_job_id"]),
            )
            self.db.execute("UPDATE assets SET index_status = 'queued' WHERE asset_id = ?", (asset_id,))
            return True
        if self._asset_is_searchable(asset_id, version_id):
            return False
        self.db.execute(
            """
            INSERT INTO index_jobs(
                index_job_id, asset_id, asset_version_id, job_type, status, priority,
                parser_version, embedding_profile_id, created_at
            )
            VALUES (?, ?, ?, ?, 'queued', 100, 'parser_v1', ?, ?)
            """,
            (new_id("idx"), asset_id, version_id, job_type, DEFAULT_EMBEDDING_PROFILE, utc_now()),
        )
        self.db.execute("UPDATE assets SET index_status = 'queued' WHERE asset_id = ?", (asset_id,))
        return True

    def _asset_is_searchable(self, asset_id: str, version_id: str) -> bool:
        index_status = self.db.scalar("SELECT index_status FROM assets WHERE asset_id = ?", (asset_id,))
        if index_status != "indexed":
            return False
        row = self.db.one("SELECT mime_type, normalized_ext FROM assets WHERE asset_id = ?", (asset_id,))
        if row is None:
            return False
        mime_type = str(row["mime_type"] or "application/octet-stream")
        ext = f".{row['normalized_ext']}" if row["normalized_ext"] else ""
        search_count = self.db.scalar(
            "SELECT COUNT(*) FROM search_documents WHERE asset_id = ? AND asset_version_id = ?",
            (asset_id, version_id),
        )
        if not search_count:
            return False
        if _asset_kind(mime_type, ext) == "image":
            image_count = self.db.scalar(
                """
                SELECT COUNT(*) FROM qdrant_points
                WHERE asset_id = ? AND asset_version_id = ? AND collection_name = ?
                """,
                (asset_id, version_id, IMAGE_COLLECTION),
            )
            label_count = self.db.scalar(
                """
                SELECT COUNT(*) FROM qdrant_points
                WHERE asset_id = ? AND asset_version_id = ? AND collection_name = ?
                """,
                (asset_id, version_id, IMAGE_LABEL_COLLECTION),
            )
            return bool(image_count and label_count)
        point_count = self.db.scalar(
            "SELECT COUNT(*) FROM qdrant_points WHERE asset_id = ? AND asset_version_id = ?",
            (asset_id, version_id),
        )
        return bool(point_count)

    def queue_missing_image_label_indexes(self) -> int:
        rows = self.db.query(
            f"""
            SELECT a.asset_id, a.active_version_id
            FROM assets a
            JOIN library_files lf ON lf.asset_id = a.asset_id AND lf.asset_version_id = a.active_version_id AND lf.exists_flag = 1
            WHERE (a.mime_type LIKE 'image/%' OR a.normalized_ext IN ({", ".join("?" for _ in IMAGE_EXTENSIONS)}))
              AND NOT EXISTS (
                SELECT 1 FROM qdrant_points qp
                WHERE qp.asset_id = a.asset_id
                  AND qp.asset_version_id = a.active_version_id
                  AND qp.collection_name = ?
              )
              AND NOT EXISTS (
                SELECT 1 FROM index_jobs ij
                WHERE ij.asset_id = a.asset_id
                  AND ij.asset_version_id = a.active_version_id
                  AND ij.status IN ('queued', 'indexing', 'retry_wait')
              )
            """,
            [ext.lstrip(".") for ext in sorted(IMAGE_EXTENSIONS)] + [IMAGE_LABEL_COLLECTION],
        )
        queued = 0
        now = utc_now()
        for row in rows:
            self.db.execute(
                """
                INSERT INTO index_jobs(
                    index_job_id, asset_id, asset_version_id, job_type, status, priority,
                    parser_version, embedding_profile_id, created_at
                )
                VALUES (?, ?, ?, 'image', 'queued', 90, 'parser_v2', ?, ?)
                """,
                (new_id("idx"), row["asset_id"], row["active_version_id"], DEFAULT_EMBEDDING_PROFILE, now),
            )
            self.db.execute("UPDATE assets SET index_status = 'queued' WHERE asset_id = ?", (row["asset_id"],))
            queued += 1
        return queued

    def _asset_filters(self, *, query: str | None, kind: str) -> tuple[str, list[Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        normalized_query = (query or "").strip()
        if normalized_query:
            clauses.append("(a.original_name LIKE ? OR a.mime_type LIKE ?)")
            like = f"%{normalized_query}%"
            params.extend([like, like])
        if kind == "image":
            image_exts = [ext.lstrip(".") for ext in sorted(IMAGE_EXTENSIONS)]
            placeholders = ", ".join("?" for _ in image_exts)
            clauses.append(f"(a.mime_type LIKE 'image/%' OR a.normalized_ext IN ({placeholders}))")
            params.extend(image_exts)
        elif kind == "text":
            image_exts = [ext.lstrip(".") for ext in sorted(IMAGE_EXTENSIONS)]
            placeholders = ", ".join("?" for _ in image_exts)
            clauses.append(f"(a.mime_type NOT LIKE 'image/%' AND (a.normalized_ext IS NULL OR a.normalized_ext NOT IN ({placeholders})))")
            params.extend(image_exts)
        if not clauses:
            return "", params
        return "WHERE " + " AND ".join(clauses), params

    def _library_asset_payload(self, row, resolver: "ReplicaResolver", device_id: str | None) -> dict[str, Any]:
        asset_id = str(row["asset_id"])
        mime_type = str(row["mime_type"] or "application/octet-stream")
        ext = f".{row['normalized_ext']}" if row["normalized_ext"] else ""
        kind = _asset_kind(mime_type, ext)
        has_library_copy = row["relative_path"] is not None and int(row["exists_flag"] or 0) == 1
        availability = resolver.resolve(asset_id, device_id).__dict__ if device_id else None
        latest_index_job = None
        if row["latest_index_status"] is not None:
            latest_index_job = {
                "status": row["latest_index_status"],
                "job_type": row["latest_index_job_type"],
                "error_message": row["latest_index_error"],
                "completed_at": row["latest_index_completed_at"],
            }
        return {
            "asset_id": asset_id,
            "asset_version_id": row["active_version_id"],
            "title": row["original_name"],
            "kind": kind,
            "mime_type": mime_type,
            "size_bytes": row["size_bytes"],
            "content_sha256": row["content_sha256"],
            "index_status": row["index_status"],
            "library_status": row["library_status"],
            "first_seen_at": row["first_seen_at"],
            "first_seen_device_id": row["first_seen_device_id"],
            "library_file_available": has_library_copy,
            "thumbnail_url": f"/v1/assets/{asset_id}/thumbnail" if kind == "image" and has_library_copy else None,
            "content_url": f"/v1/assets/{asset_id}/content" if has_library_copy else None,
            "sources": self._asset_sources(asset_id),
            "latest_index_job": latest_index_job,
            "availability": availability["availability"] if availability else None,
            "delivery": availability["delivery"] if availability else None,
        }

    def _asset_sources(self, asset_id: str) -> list[dict[str, Any]]:
        rows = self.db.query(
            """
            SELECT r.*, d.device_name, d.device_type, d.last_seen_at
            FROM device_asset_refs r
            JOIN devices d ON d.device_id = r.device_id
            WHERE r.asset_id = ? AND r.is_available = 1
            ORDER BY
              CASE r.ref_type
                WHEN 'source_original' THEN 0
                WHEN 'library_copy' THEN 1
                WHEN 'cache_copy' THEN 2
                ELSE 3
              END,
              d.device_name COLLATE NOCASE ASC
            """,
            (asset_id,),
        )
        return [
            {
                "ref_id": row["ref_id"],
                "device_id": row["device_id"],
                "device_name": row["device_name"],
                "device_type": row["device_type"],
                "ref_type": row["ref_type"],
                "display_name": row["display_name"],
                "size_bytes": row["size_bytes"],
                "permission_status": row["permission_status"],
                "last_verified_at": row["last_verified_at"],
                "last_seen_at": row["last_seen_at"],
            }
            for row in rows
        ]


def _asset_kind(mime_type: str, ext: str) -> str:
    lowered_mime = mime_type.lower()
    if lowered_mime.startswith("image/") or ext.lower() in IMAGE_EXTENSIONS:
        return "image"
    return "text"
