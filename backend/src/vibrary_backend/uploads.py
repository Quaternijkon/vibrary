from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from .config import DEFAULT_CHUNK_SIZE, AppPaths
from .database import Database, new_id
from .hashing import sha256_bytes
from .library import LibraryService
from .timeutil import utc_now


@dataclass(frozen=True)
class PreflightResult:
    upload_id: str
    decision: str
    chunk_size: int
    existing_asset_id: str | None = None
    bytes_received: int = 0
    received_chunks: list[int] | None = None


@dataclass(frozen=True)
class CompletedUpload:
    upload_id: str
    asset_id: str
    status: str


class UploadService:
    def __init__(self, db: Database, paths: AppPaths, library: LibraryService):
        self.db = db
        self.paths = paths
        self.library = library

    def preflight(
        self,
        *,
        device_id: str,
        local_ref_id: str,
        file_name: str,
        mime_type: str | None,
        size_bytes: int,
        quick_fingerprint: str | None,
        content_sha256: str | None = None,
    ) -> PreflightResult:
        self._ensure_trusted_device(device_id)
        safe_file_name = _safe_upload_file_name(file_name)
        if content_sha256:
            existing = self.db.one("SELECT asset_id FROM assets WHERE content_sha256 = ?", (content_sha256,))
            if existing:
                upload_id = new_id("upload")
                now = utc_now()
                self.db.execute(
                    """
                    INSERT INTO upload_jobs(
                        upload_id, device_id, local_ref_id, file_name, mime_type, size_bytes,
                        quick_fingerprint, content_sha256, status, bytes_received, chunk_size,
                        created_at, updated_at, completed_at, resulting_asset_id
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'server_imported', 0, ?, ?, ?, ?, ?)
                    """,
                    (
                        upload_id,
                        device_id,
                        local_ref_id,
                        safe_file_name,
                        mime_type,
                        size_bytes,
                        quick_fingerprint,
                        content_sha256,
                        DEFAULT_CHUNK_SIZE,
                        now,
                        now,
                        now,
                        existing["asset_id"],
                    ),
                )
                return PreflightResult(
                    upload_id=upload_id,
                    decision="already_exists",
                    chunk_size=DEFAULT_CHUNK_SIZE,
                    existing_asset_id=str(existing["asset_id"]),
                    bytes_received=0,
                    received_chunks=[],
                )

        resumable = self.db.one(
            """
            SELECT * FROM upload_jobs
            WHERE device_id = ? AND local_ref_id = ? AND file_name = ? AND size_bytes = ?
              AND status IN ('queued', 'uploading', 'retry_wait')
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (device_id, local_ref_id, safe_file_name, size_bytes),
        )
        if resumable:
            chunks = [int(row["chunk_index"]) for row in self.db.query("SELECT chunk_index FROM upload_chunks WHERE upload_id = ? ORDER BY chunk_index", (resumable["upload_id"],))]
            bytes_received = int(self.db.scalar("SELECT COALESCE(SUM(size_bytes), 0) FROM upload_chunks WHERE upload_id = ?", (resumable["upload_id"],)) or 0)
            return PreflightResult(
                upload_id=str(resumable["upload_id"]),
                decision="upload_required",
                chunk_size=int(resumable["chunk_size"] or DEFAULT_CHUNK_SIZE),
                bytes_received=bytes_received,
                received_chunks=chunks,
            )

        upload_id = new_id("upload")
        now = utc_now()
        self.db.execute(
            """
            INSERT INTO upload_jobs(
                upload_id, device_id, local_ref_id, file_name, mime_type, size_bytes,
                quick_fingerprint, status, bytes_received, chunk_size, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)
            """,
            (upload_id, device_id, local_ref_id, safe_file_name, mime_type, size_bytes, quick_fingerprint, DEFAULT_CHUNK_SIZE, now, now),
        )
        return PreflightResult(upload_id=upload_id, decision="upload_required", chunk_size=DEFAULT_CHUNK_SIZE, received_chunks=[])

    def accept_chunk(self, upload_id: str, chunk_index: int, data: bytes, expected_sha256: str | None = None) -> None:
        job = self._job(upload_id)
        chunk_dir = self.paths.upload_temp_dir / upload_id
        chunk_dir.mkdir(parents=True, exist_ok=True)
        chunk_path = chunk_dir / f"{chunk_index:08d}.part"
        chunk_sha = sha256_bytes(data)
        if expected_sha256 and chunk_sha != expected_sha256:
            self.db.execute(
                "UPDATE upload_jobs SET status = 'failed', error_message = ?, updated_at = ? WHERE upload_id = ?",
                ("chunk sha256 mismatch", utc_now(), upload_id),
            )
            raise ValueError("chunk sha256 mismatch")
        existing_size = chunk_path.stat().st_size if chunk_path.exists() else 0
        current_total = int(self.db.scalar("SELECT COALESCE(SUM(size_bytes), 0) FROM upload_chunks WHERE upload_id = ?", (upload_id,)) or 0)
        projected_total = current_total - existing_size + len(data)
        if projected_total > int(job["size_bytes"]):
            self.db.execute(
                "UPDATE upload_jobs SET status = 'failed', error_message = ?, updated_at = ? WHERE upload_id = ?",
                ("received bytes exceed declared upload size", utc_now(), upload_id),
            )
            raise ValueError("received bytes exceed declared upload size")
        chunk_path.write_bytes(data)
        offset = sum(path.stat().st_size for path in sorted(chunk_dir.glob("*.part")) if path.name < chunk_path.name)
        now = utc_now()
        self.db.execute(
            """
            INSERT INTO upload_chunks(upload_id, chunk_index, offset_bytes, size_bytes, chunk_sha256, status, received_at)
            VALUES (?, ?, ?, ?, ?, 'received', ?)
            ON CONFLICT(upload_id, chunk_index) DO UPDATE SET
                offset_bytes = excluded.offset_bytes,
                size_bytes = excluded.size_bytes,
                chunk_sha256 = excluded.chunk_sha256,
                status = 'received',
                received_at = excluded.received_at
            """,
            (upload_id, chunk_index, offset, len(data), chunk_sha, now),
        )
        bytes_received = self.db.scalar("SELECT COALESCE(SUM(size_bytes), 0) FROM upload_chunks WHERE upload_id = ?", (upload_id,))
        self.db.execute(
            "UPDATE upload_jobs SET status = 'uploading', bytes_received = ?, updated_at = ? WHERE upload_id = ?",
            (bytes_received, now, upload_id),
        )

    def complete(self, upload_id: str, content_sha256: str | None) -> CompletedUpload:
        job = self._job(upload_id)
        if job["resulting_asset_id"]:
            return CompletedUpload(upload_id=upload_id, asset_id=str(job["resulting_asset_id"]), status=str(job["status"]))

        chunk_rows = self.db.query("SELECT * FROM upload_chunks WHERE upload_id = ? ORDER BY chunk_index", (upload_id,))
        expected_indexes = list(range(len(chunk_rows)))
        actual_indexes = [int(row["chunk_index"]) for row in chunk_rows]
        if actual_indexes != expected_indexes:
            raise ValueError("upload chunks are not contiguous")
        assembled_path = self.paths.upload_temp_dir / upload_id / _safe_upload_file_name(str(job["file_name"]))
        import hashlib

        digest = hashlib.sha256()
        total_size = 0
        with assembled_path.open("wb") as assembled:
            for row in chunk_rows:
                chunk_path = self.paths.upload_temp_dir / upload_id / f"{int(row['chunk_index']):08d}.part"
                if not chunk_path.exists():
                    raise ValueError(f"missing upload chunk {row['chunk_index']}")
                with chunk_path.open("rb") as chunk_file:
                    for chunk in iter(lambda: chunk_file.read(1024 * 1024), b""):
                        digest.update(chunk)
                        total_size += len(chunk)
                        assembled.write(chunk)
        if total_size != int(job["size_bytes"]):
            raise ValueError("assembled upload size does not match declared size")
        actual_sha = digest.hexdigest()
        if not content_sha256:
            raise ValueError("content_sha256 is required to complete upload")
        if actual_sha != content_sha256:
            self.db.execute(
                "UPDATE upload_jobs SET status = 'failed', error_message = ?, updated_at = ? WHERE upload_id = ?",
                ("sha256 mismatch", utc_now(), upload_id),
            )
            raise ValueError("sha256 mismatch")

        import_result = self.library.import_path(assembled_path, device_id="windows-local", original_name=str(job["file_name"]))
        if not import_result.assets:
            raise ValueError("upload import failed")
        imported = import_result.assets[0]
        self.db.add_device_asset_ref(
            device_id=str(job["device_id"]),
            asset_id=imported.asset_id,
            asset_version_id=imported.asset_version_id,
            ref_type="source_original",
            local_ref_id=str(job["local_ref_id"]),
            display_name=str(job["file_name"]),
            size_bytes=int(job["size_bytes"]),
            content_sha256=actual_sha,
            permission_status="granted",
        )
        now = utc_now()
        self.db.execute(
            """
            UPDATE upload_jobs
            SET status = 'server_imported', content_sha256 = ?, resulting_asset_id = ?,
                updated_at = ?, completed_at = ?
            WHERE upload_id = ?
            """,
            (actual_sha, imported.asset_id, now, now, upload_id),
        )
        shutil.rmtree(self.paths.upload_temp_dir / upload_id, ignore_errors=True)
        return CompletedUpload(upload_id=upload_id, asset_id=imported.asset_id, status="server_imported")

    def status(self, upload_id: str) -> dict[str, object]:
        job = self._job(upload_id)
        status = dict(job)
        status["received_chunks"] = [
            int(row["chunk_index"])
            for row in self.db.query("SELECT chunk_index FROM upload_chunks WHERE upload_id = ? ORDER BY chunk_index", (upload_id,))
        ]
        return status

    def _job(self, upload_id: str):
        job = self.db.one("SELECT * FROM upload_jobs WHERE upload_id = ?", (upload_id,))
        if job is None:
            raise KeyError(f"unknown upload: {upload_id}")
        return job

    def _ensure_trusted_device(self, device_id: str) -> None:
        device = self.db.one("SELECT is_trusted FROM devices WHERE device_id = ?", (device_id,))
        if device is None or int(device["is_trusted"]) != 1:
            raise PermissionError(f"device is not trusted: {device_id}")


def _safe_upload_file_name(file_name: str) -> str:
    leaf = str(file_name).replace("\\", "/").rsplit("/", 1)[-1].strip()
    if leaf in {"", ".", ".."}:
        return "upload.bin"
    return leaf
