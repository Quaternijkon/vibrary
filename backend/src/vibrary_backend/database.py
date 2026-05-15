from __future__ import annotations

import sqlite3
import threading
import uuid
from pathlib import Path
from typing import Any, Iterable

from .config import IMAGE_EMBEDDING_PROFILE, IMAGE_LABEL_EMBEDDING_PROFILE, SCHEMA_VERSION, TEXT_EMBEDDING_PROFILE
from .timeutil import utc_now


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self.connection = sqlite3.connect(self.path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")

    def close(self) -> None:
        with self._lock:
            self.connection.close()

    def initialize(self) -> None:
        with self._lock:
            self.connection.executescript(SCHEMA_SQL)
        self.execute(
            """
            INSERT OR IGNORE INTO schema_info(schema_version, applied_at)
            VALUES (?, ?)
            """,
            (SCHEMA_VERSION, utc_now()),
        )
        self.executemany(
            """
            INSERT OR IGNORE INTO embedding_profiles(
                embedding_profile_id, model_name, model_revision, modality, dimension,
                distance, runtime, local_model_path, license_note, is_default, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    TEXT_EMBEDDING_PROFILE,
                    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
                    "mvp",
                    "text",
                    384,
                    "Cosine",
                    "fastembed",
                    "",
                    "model must be downloaded into the local models directory for production embedding",
                    1,
                    utc_now(),
                ),
                (
                    IMAGE_EMBEDDING_PROFILE,
                    "Qdrant/clip-ViT-B-32-vision",
                    "mvp",
                    "image",
                    512,
                    "Cosine",
                    "fastembed",
                    "",
                    "CLIP image encoder used for Qdrant image-semantic vectors",
                    0,
                    utc_now(),
                ),
                (
                    IMAGE_LABEL_EMBEDDING_PROFILE,
                    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
                    "mvp",
                    "image_label_text",
                    384,
                    "Cosine",
                    "fastembed",
                    "",
                    "bilingual visual labels generated from FastEmbed CLIP concepts and stored in Qdrant",
                    0,
                    utc_now(),
                ),
            ],
        )
        self.connection.commit()

    def execute(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Cursor:
        with self._lock:
            cursor = self.connection.execute(sql, tuple(params))
            self.connection.commit()
            return cursor

    def executemany(self, sql: str, rows: Iterable[Iterable[Any]]) -> sqlite3.Cursor:
        with self._lock:
            cursor = self.connection.executemany(sql, rows)
            self.connection.commit()
            return cursor

    def query(self, sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
        with self._lock:
            return list(self.connection.execute(sql, tuple(params)))

    def one(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Row | None:
        with self._lock:
            return self.connection.execute(sql, tuple(params)).fetchone()

    def scalar(self, sql: str, params: Iterable[Any] = ()) -> Any:
        with self._lock:
            row = self.connection.execute(sql, tuple(params)).fetchone()
        if row is None:
            return None
        return row[0]

    def upsert_device(self, device_id: str, device_name: str, device_type: str, is_trusted: bool = False) -> None:
        now = utc_now()
        self.execute(
            """
            INSERT INTO devices(device_id, device_name, device_type, paired_at, last_seen_at, is_trusted)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
                device_name = excluded.device_name,
                device_type = excluded.device_type,
                last_seen_at = excluded.last_seen_at,
                is_trusted = excluded.is_trusted
            """,
            (device_id, device_name, device_type, now, now, int(is_trusted)),
        )

    def add_device_asset_ref(
        self,
        *,
        device_id: str,
        asset_id: str,
        asset_version_id: str | None,
        ref_type: str,
        local_ref_id: str | None,
        display_name: str | None,
        size_bytes: int | None,
        content_sha256: str | None,
        permission_status: str = "not_applicable",
        is_available: bool = True,
    ) -> str:
        existing = self.one(
            """
            SELECT ref_id FROM device_asset_refs
            WHERE device_id = ? AND asset_id = ? AND ref_type = ? AND COALESCE(local_ref_id, '') = COALESCE(?, '')
            """,
            (device_id, asset_id, ref_type, local_ref_id),
        )
        now = utc_now()
        if existing:
            self.execute(
                """
                UPDATE device_asset_refs
                SET asset_version_id = ?, display_name = ?, size_bytes = ?, content_sha256 = ?,
                    permission_status = ?, last_verified_at = ?, is_available = ?
                WHERE ref_id = ?
                """,
                (
                    asset_version_id,
                    display_name,
                    size_bytes,
                    content_sha256,
                    permission_status,
                    now,
                    int(is_available),
                    existing["ref_id"],
                ),
            )
            return str(existing["ref_id"])
        ref_id = new_id("ref")
        self.execute(
            """
            INSERT INTO device_asset_refs(
                ref_id, device_id, asset_id, asset_version_id, ref_type, local_ref_id,
                display_name, size_bytes, content_sha256, permission_status, created_at,
                last_verified_at, is_available
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ref_id,
                device_id,
                asset_id,
                asset_version_id,
                ref_type,
                local_ref_id,
                display_name,
                size_bytes,
                content_sha256,
                permission_status,
                now,
                now,
                int(is_available),
            ),
        )
        return ref_id

    def add_cache_entry(
        self,
        device_id: str,
        asset_id: str | None,
        cache_type: str,
        absolute_path: Path,
        size_bytes: int,
        can_delete: bool = True,
        relative_path: str | None = None,
    ) -> str:
        cache_entry_id = new_id("cache")
        now = utc_now()
        if relative_path is None:
            marker = "data"
            parts = absolute_path.resolve().parts
            if marker in parts:
                data_index = parts.index(marker)
                relative_path = Path(*parts[data_index + 1 :]).as_posix()
            else:
                relative_path = absolute_path.name
        self.execute(
            """
            INSERT INTO cache_entries(
                cache_entry_id, device_id, asset_id, cache_type, relative_path,
                size_bytes, created_at, last_accessed_at, can_delete
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (cache_entry_id, device_id, asset_id, cache_type, relative_path, size_bytes, now, now, int(can_delete)),
        )
        return cache_entry_id


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS schema_info (
  schema_version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL CHECK (device_type IN ('windows', 'android')),
  pairing_public_key TEXT,
  paired_at TEXT,
  last_seen_at TEXT,
  is_trusted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assets (
  asset_id TEXT PRIMARY KEY,
  content_sha256 TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  normalized_ext TEXT,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  first_seen_device_id TEXT,
  first_seen_at TEXT NOT NULL,
  library_status TEXT NOT NULL,
  index_status TEXT NOT NULL,
  active_version_id TEXT
);

CREATE TABLE IF NOT EXISTS asset_versions (
  asset_version_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT,
  parser_version TEXT,
  embedding_profile_id TEXT,
  created_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id)
);

CREATE TABLE IF NOT EXISTS library_files (
  library_file_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  asset_version_id TEXT NOT NULL,
  relative_path TEXT NOT NULL UNIQUE,
  storage_class TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verified_at TEXT,
  exists_flag INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id),
  FOREIGN KEY(asset_version_id) REFERENCES asset_versions(asset_version_id)
);

CREATE TABLE IF NOT EXISTS device_asset_refs (
  ref_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_version_id TEXT,
  ref_type TEXT NOT NULL,
  local_ref_id TEXT,
  display_name TEXT,
  size_bytes INTEGER,
  last_known_mtime TEXT,
  content_sha256 TEXT,
  permission_status TEXT,
  created_at TEXT NOT NULL,
  last_verified_at TEXT,
  is_available INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(device_id) REFERENCES devices(device_id),
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id)
);

CREATE TABLE IF NOT EXISTS upload_jobs (
  upload_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  local_ref_id TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  quick_fingerprint TEXT,
  content_sha256 TEXT,
  status TEXT NOT NULL,
  bytes_received INTEGER NOT NULL DEFAULT 0,
  chunk_size INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  resulting_asset_id TEXT,
  error_message TEXT,
  FOREIGN KEY(device_id) REFERENCES devices(device_id)
);

CREATE TABLE IF NOT EXISTS upload_chunks (
  upload_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  offset_bytes INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  chunk_sha256 TEXT,
  status TEXT NOT NULL,
  received_at TEXT,
  PRIMARY KEY (upload_id, chunk_index),
  FOREIGN KEY(upload_id) REFERENCES upload_jobs(upload_id)
);

CREATE TABLE IF NOT EXISTS index_jobs (
  index_job_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  asset_version_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  parser_version TEXT,
  embedding_profile_id TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id),
  FOREIGN KEY(asset_version_id) REFERENCES asset_versions(asset_version_id)
);

CREATE TABLE IF NOT EXISTS qdrant_points (
  point_id TEXT PRIMARY KEY,
  collection_name TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_version_id TEXT NOT NULL,
  logical_unit_id TEXT,
  logical_unit_type TEXT,
  vector_name TEXT,
  embedding_profile_id TEXT NOT NULL,
  payload_hash TEXT,
  upserted_at TEXT NOT NULL,
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id)
);

CREATE TABLE IF NOT EXISTS cache_entries (
  cache_entry_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  asset_id TEXT,
  cache_type TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  last_accessed_at TEXT,
  can_delete INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(device_id) REFERENCES devices(device_id)
);

CREATE TABLE IF NOT EXISTS embedding_profiles (
  embedding_profile_id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  modality TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  distance TEXT NOT NULL,
  runtime TEXT NOT NULL,
  local_model_path TEXT,
  license_note TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pairing_tokens (
  token_hash TEXT PRIMARY KEY,
  server_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT
);

CREATE TABLE IF NOT EXISTS device_tokens (
  token_hash TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(device_id) REFERENCES devices(device_id)
);

CREATE TABLE IF NOT EXISTS search_documents (
  point_id TEXT PRIMARY KEY,
  collection_name TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_version_id TEXT NOT NULL,
  title TEXT NOT NULL,
  mime_type TEXT,
  content TEXT NOT NULL,
  embedding_profile_id TEXT NOT NULL,
  upserted_at TEXT NOT NULL,
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id)
);

CREATE INDEX IF NOT EXISTS idx_device_refs_device_asset ON device_asset_refs(device_id, asset_id, ref_type);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_status ON upload_jobs(status);
CREATE INDEX IF NOT EXISTS idx_index_jobs_status_priority ON index_jobs(status, priority);
CREATE INDEX IF NOT EXISTS idx_cache_entries_type ON cache_entries(cache_type, can_delete);
"""
