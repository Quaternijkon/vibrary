from __future__ import annotations

import mimetypes
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from .config import DEFAULT_EMBEDDING_PROFILE, AppPaths
from .database import Database, new_id
from .hashing import sha256_file
from .timeutil import utc_now


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
        existing = self.db.scalar("SELECT COUNT(*) FROM index_jobs WHERE asset_id = ? AND asset_version_id = ?", (asset_id, version_id))
        if existing:
            return False
        lowered_mime = mime_type.lower()
        if ext in IMAGE_EXTENSIONS or lowered_mime.startswith("image/"):
            job_type = "image"
        elif ext == ".pdf":
            job_type = "text"
        elif ext in TEXT_EXTENSIONS or lowered_mime.startswith("text/"):
            job_type = "text"
        else:
            job_type = "text"
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
        return True
