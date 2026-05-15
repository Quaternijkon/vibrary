from __future__ import annotations

from .config import AppPaths
from .database import Database
from .pipeline import PipelineConfig
from .resolver import ReplicaResolver
from .vector_store import VectorStore, default_collections


class SearchService:
    def __init__(
        self,
        db: Database,
        paths: AppPaths,
        resolver: ReplicaResolver,
        vector_store: VectorStore,
        pipeline: PipelineConfig | None = None,
    ):
        self.db = db
        self.paths = paths
        self.resolver = resolver
        self.vector_store = vector_store
        self.pipeline = pipeline or PipelineConfig.default()

    def search(
        self,
        *,
        device_id: str,
        query: str,
        search_types: list[str] | None = None,
        limit: int = 20,
        filters: dict | None = None,
    ) -> dict[str, object]:
        hits = []
        for collection in default_collections(search_types, self.pipeline.collections):
            hits.extend(self.vector_store.query(collection, query, limit, filters))
        hits.sort(key=lambda hit: hit.score, reverse=True)
        results = []
        seen_assets: set[str] = set()
        for hit in hits:
            asset_id = hit.asset_id
            if asset_id in seen_assets:
                continue
            seen_assets.add(asset_id)
            row = self.db.one(
                """
                SELECT sd.*, a.original_name, a.mime_type AS asset_mime_type
                FROM search_documents sd
                JOIN assets a ON a.asset_id = sd.asset_id
                WHERE sd.point_id = ?
                """,
                (hit.point_id,),
            )
            if row is None:
                continue
            resolved = self.resolver.resolve(asset_id, device_id)
            matched_by = [self._matched_by_collection(hit.collection_name)]
            results.append(
                {
                    "asset_id": asset_id,
                    "asset_version_id": str(row["asset_version_id"]),
                    "title": str(row["title"]),
                    "mime_type": str(row["asset_mime_type"]),
                    "score": hit.score,
                    "matched_by": matched_by,
                    "snippet": self._snippet(str(row["content"])),
                    "thumbnail_url": f"/v1/assets/{asset_id}/thumbnail",
                    "availability": resolved.availability,
                    "delivery": resolved.delivery,
                }
            )
            if len(results) >= limit:
                break
        return {"results": results}

    def _snippet(self, content: str) -> str | None:
        if not content:
            return None
        return content[:160]

    def _matched_by_collection(self, collection_name: str) -> str:
        if collection_name == self.pipeline.collections.image:
            return "image_semantic"
        if collection_name == self.pipeline.collections.image_labels:
            return "image_labels"
        return "text"
