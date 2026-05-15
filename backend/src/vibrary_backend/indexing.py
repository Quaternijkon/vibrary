from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass

from .config import (
    DEFAULT_EMBEDDING_PROFILE,
    AppPaths,
)
from .database import Database
from .image_semantics import ImageSemanticAnalyzer, NoopImageSemanticAnalyzer
from .pipeline import PipelineConfig
from .timeutil import utc_now
from .vector_store import VectorPoint, VectorStore


MAX_INDEX_RETRIES = 3


@dataclass(frozen=True)
class IndexProcessResult:
    indexed_count: int
    failed_count: int


class IndexService:
    def __init__(
        self,
        db: Database,
        paths: AppPaths,
        vector_store: VectorStore,
        image_semantic_analyzer: ImageSemanticAnalyzer | None = None,
        pipeline: PipelineConfig | None = None,
    ):
        self.db = db
        self.paths = paths
        self.vector_store = vector_store
        self.image_semantic_analyzer = image_semantic_analyzer or NoopImageSemanticAnalyzer()
        self.pipeline = pipeline or PipelineConfig.default()

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
                job_type = str(row["job_type"])
                title = str(row["original_name"])
                mime_type = str(row["mime_type"])
                label_content = self._extract_image_label_content(path, job_type, title, mime_type)
                content = self._extract_content(path, job_type, title, mime_type, label_content=label_content)
                now = utc_now()
                collection = self.pipeline.collections.image if job_type == "image" else self.pipeline.collections.text
                self._upsert_index_document(
                    collection_name=collection,
                    asset_id=str(row["asset_id"]),
                    asset_version_id=str(row["asset_version_id"]),
                    title=title,
                    mime_type=mime_type,
                    job_type=job_type,
                    logical_unit_id="unit_0",
                    logical_unit_type="image" if collection == self.pipeline.collections.image else "chunk",
                    text=content,
                    source_path=str(path) if collection == self.pipeline.collections.image else None,
                    now=now,
                )
                if job_type == "image" and label_content:
                    self._upsert_index_document(
                        collection_name=self.pipeline.collections.image_labels,
                        asset_id=str(row["asset_id"]),
                        asset_version_id=str(row["asset_version_id"]),
                        title=title,
                        mime_type=mime_type,
                        job_type="image_labels",
                        logical_unit_id="labels_0",
                        logical_unit_type="image_labels",
                        text=label_content,
                        source_path=None,
                        now=now,
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

    def _extract_content(self, path, job_type: str, title: str, mime_type: str, label_content: str = "") -> str:
        if job_type == "image":
            return f"{title} {mime_type} image photo picture screenshot 图片 照片 {label_content}".strip()
        raw = path.read_bytes()
        text = raw.decode("utf-8", errors="ignore")
        text = re.sub(r"\s+", " ", text).strip()
        return f"{title} {text}".strip()

    def _extract_image_label_content(self, path, job_type: str, title: str, mime_type: str) -> str:
        if job_type != "image":
            return ""
        semantic_text = self.image_semantic_analyzer.describe(path, title, mime_type)
        return re.sub(r"\s+", " ", f"{title} {mime_type} 图片 照片 image photo {semantic_text}").strip()

    def _upsert_index_document(
        self,
        *,
        collection_name: str,
        asset_id: str,
        asset_version_id: str,
        title: str,
        mime_type: str,
        job_type: str,
        logical_unit_id: str,
        logical_unit_type: str,
        text: str,
        source_path: str | None,
        now: str,
    ) -> None:
        embedding_profile_id = _embedding_profile_for_collection(collection_name, self.pipeline)
        payload_hash = hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()
        point_id = _stable_point_id(asset_id, asset_version_id, collection_name, logical_unit_id)
        payload = {
            "asset_id": asset_id,
            "asset_version_id": asset_version_id,
            "title": title,
            "mime_type": mime_type,
            "job_type": job_type,
            "embedding_profile_id": embedding_profile_id,
            "payload_hash": payload_hash,
            "source_path": source_path,
        }
        self.vector_store.upsert(
            collection_name,
            [
                VectorPoint(
                    point_id=point_id,
                    asset_id=asset_id,
                    asset_version_id=asset_version_id,
                    collection_name=collection_name,
                    text=text,
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
                collection_name,
                asset_id,
                asset_version_id,
                title,
                mime_type,
                text,
                embedding_profile_id,
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
                collection_name,
                asset_id,
                asset_version_id,
                logical_unit_id,
                logical_unit_type,
                "default",
                embedding_profile_id,
                payload_hash,
                now,
            ),
        )


def _stable_point_id(asset_id: str, asset_version_id: str, collection_name: str, logical_unit_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"vibrary:{collection_name}:{asset_id}:{asset_version_id}:{logical_unit_id}"))


class IndexMaintenanceService:
    def __init__(self, db: Database, vector_store: VectorStore, pipeline: PipelineConfig | None = None):
        self.db = db
        self.vector_store = vector_store
        self.pipeline = pipeline or PipelineConfig.default()

    def status(self) -> dict[str, object]:
        queue_counts = {
            str(row["status"]): int(row["count"])
            for row in self.db.query(
                """
                SELECT status, COUNT(*) AS count
                FROM index_jobs
                GROUP BY status
                ORDER BY status
                """
            )
        }
        point_counts = {
            str(row["collection_name"]): int(row["count"])
            for row in self.db.query(
                """
                SELECT collection_name, COUNT(*) AS count
                FROM qdrant_points
                GROUP BY collection_name
                ORDER BY collection_name
                """
            )
        }
        return {
            "pipeline": self.pipeline.as_payload(),
            "options": self.pipeline.options_payload(),
            "queue_counts": queue_counts,
            "point_counts": point_counts,
            "asset_counts": {
                "total": int(self.db.scalar("SELECT COUNT(*) FROM assets") or 0),
                "indexed": int(self.db.scalar("SELECT COUNT(*) FROM assets WHERE index_status = 'indexed'") or 0),
            },
        }

    def rebuild_all(self) -> dict[str, int]:
        active_collections = self.pipeline.collections.all()
        for collection_name in active_collections:
            self.db.execute("DELETE FROM qdrant_points WHERE collection_name = ?", (collection_name,))
            self.db.execute("DELETE FROM search_documents WHERE collection_name = ?", (collection_name,))
        self.vector_store.delete_collections(active_collections)
        self.db.execute("DELETE FROM index_jobs")
        rows = self.db.query(
            """
            SELECT asset_id, active_version_id, mime_type, normalized_ext
            FROM assets
            WHERE active_version_id IS NOT NULL AND library_status = 'present'
            ORDER BY first_seen_at ASC
            """
        )
        now = utc_now()
        queued = 0
        for row in rows:
            job_type = _job_type_for_asset(str(row["mime_type"] or ""), str(row["normalized_ext"] or ""))
            self.db.execute(
                """
                INSERT INTO index_jobs(
                    index_job_id, asset_id, asset_version_id, job_type, status, priority,
                    parser_version, embedding_profile_id, created_at
                )
                VALUES (?, ?, ?, ?, 'queued', 80, 'parser_v1', ?, ?)
                """,
                (
                    new_index_job_id(),
                    row["asset_id"],
                    row["active_version_id"],
                    job_type,
                    self.pipeline.embedding.profile_id,
                    now,
                ),
            )
            self.db.execute("UPDATE assets SET index_status = 'queued' WHERE asset_id = ?", (row["asset_id"],))
            queued += 1
        return {"queued_count": queued}


def new_index_job_id() -> str:
    return f"idx_{uuid.uuid4().hex}"


def _job_type_for_asset(mime_type: str, normalized_ext: str) -> str:
    ext = normalized_ext.lower().lstrip(".")
    if mime_type.lower().startswith("image/") or ext in {"jpg", "jpeg", "png", "gif", "webp", "bmp"}:
        return "image"
    return "text"


def _embedding_profile_for_collection(collection_name: str, pipeline: PipelineConfig | None = None) -> str:
    if pipeline is not None and collection_name in pipeline.collections.all():
        return pipeline.embedding.profile_id
    return DEFAULT_EMBEDDING_PROFILE
