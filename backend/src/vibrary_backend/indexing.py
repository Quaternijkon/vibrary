from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass

from .config import DEFAULT_EMBEDDING_PROFILE, IMAGE_COLLECTION, TEXT_COLLECTION, AppPaths
from .database import Database
from .timeutil import utc_now
from .vector_store import VectorPoint, VectorStore


MAX_INDEX_RETRIES = 3


@dataclass(frozen=True)
class IndexProcessResult:
    indexed_count: int
    failed_count: int


class IndexService:
    def __init__(self, db: Database, paths: AppPaths, vector_store: VectorStore):
        self.db = db
        self.paths = paths
        self.vector_store = vector_store

    def process_next(self, limit: int = 10) -> IndexProcessResult:
        rows = self.db.query(
            """
            SELECT ij.*, a.original_name, a.mime_type, lf.relative_path
            FROM index_jobs ij
            JOIN assets a ON a.asset_id = ij.asset_id
            JOIN library_files lf ON lf.asset_id = ij.asset_id AND lf.exists_flag = 1
            WHERE ij.status IN ('queued', 'retry_wait')
               OR (ij.status = 'failed' AND ij.retry_count < ?)
            ORDER BY ij.priority ASC, ij.created_at ASC
            LIMIT ?
            """,
            (MAX_INDEX_RETRIES, limit),
        )
        indexed = 0
        failed = 0
        for row in rows:
            self.db.execute(
                "UPDATE index_jobs SET status = 'indexing', started_at = ?, error_message = NULL WHERE index_job_id = ?",
                (utc_now(), row["index_job_id"]),
            )
            try:
                path = self.paths.resolve_data_path(str(row["relative_path"]))
                if not path.exists():
                    raise FileNotFoundError(path)
                content = self._extract_content(path, str(row["job_type"]), str(row["original_name"]), str(row["mime_type"]))
                collection = IMAGE_COLLECTION if str(row["job_type"]) == "image" else TEXT_COLLECTION
                payload_hash = hashlib.sha256(content.encode("utf-8", errors="ignore")).hexdigest()
                point_id = str(uuid.uuid4())
                now = utc_now()
                payload = {
                    "asset_id": row["asset_id"],
                    "asset_version_id": row["asset_version_id"],
                    "title": row["original_name"],
                    "mime_type": row["mime_type"],
                    "job_type": row["job_type"],
                    "embedding_profile_id": DEFAULT_EMBEDDING_PROFILE,
                    "payload_hash": payload_hash,
                    "source_path": str(path) if collection == IMAGE_COLLECTION else None,
                }
                self.vector_store.upsert(
                    collection,
                    [
                        VectorPoint(
                            point_id=point_id,
                            asset_id=str(row["asset_id"]),
                            asset_version_id=str(row["asset_version_id"]),
                            collection_name=collection,
                            text=content,
                            payload=payload,
                        )
                    ],
                )
                self.db.execute(
                    """
                    INSERT OR REPLACE INTO search_documents(
                        point_id, collection_name, asset_id, asset_version_id, title, mime_type,
                        content, embedding_profile_id, upserted_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        point_id,
                        collection,
                        row["asset_id"],
                        row["asset_version_id"],
                        row["original_name"],
                        row["mime_type"],
                        content,
                        DEFAULT_EMBEDDING_PROFILE,
                        now,
                    ),
                )
                self.db.execute(
                    """
                    INSERT OR REPLACE INTO qdrant_points(
                        point_id, collection_name, asset_id, asset_version_id, logical_unit_id,
                        logical_unit_type, vector_name, embedding_profile_id, payload_hash, upserted_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        point_id,
                        collection,
                        row["asset_id"],
                        row["asset_version_id"],
                        "unit_0",
                        "image" if collection == IMAGE_COLLECTION else "chunk",
                        "default",
                        DEFAULT_EMBEDDING_PROFILE,
                        payload_hash,
                        now,
                    ),
                )
                self.db.execute(
                    "UPDATE index_jobs SET status = 'completed', completed_at = ? WHERE index_job_id = ?",
                    (now, row["index_job_id"]),
                )
                self.db.execute("UPDATE assets SET index_status = 'indexed' WHERE asset_id = ?", (row["asset_id"],))
                indexed += 1
            except Exception as exc:
                failed += 1
                next_retry_count = int(row["retry_count"]) + 1
                next_status = "retry_wait" if next_retry_count < MAX_INDEX_RETRIES else "failed"
                self.db.execute(
                    """
                    UPDATE index_jobs
                    SET status = ?, completed_at = ?, error_message = ?, retry_count = retry_count + 1
                    WHERE index_job_id = ?
                    """,
                    (next_status, utc_now(), str(exc), row["index_job_id"]),
                )
                asset_status = "queued" if next_status == "retry_wait" else "failed"
                self.db.execute("UPDATE assets SET index_status = ? WHERE asset_id = ?", (asset_status, row["asset_id"]))
        return IndexProcessResult(indexed_count=indexed, failed_count=failed)

    def _extract_content(self, path, job_type: str, title: str, mime_type: str) -> str:
        if job_type == "image":
            return f"{title} {mime_type} image photo picture screenshot"
        raw = path.read_bytes()
        text = raw.decode("utf-8", errors="ignore")
        text = re.sub(r"\s+", " ", text).strip()
        return f"{title} {text}".strip()
