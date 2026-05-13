from __future__ import annotations

import hashlib
import json
import math
from urllib.parse import urlparse
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Protocol

from .config import IMAGE_COLLECTION, TEXT_COLLECTION
from .embedding import EmbeddingProvider, FastEmbedEmbeddingProvider


VECTOR_DIMENSION = 64
PAYLOAD_INDEX_FIELDS = (
    "asset_id",
    "asset_version_id",
    "mime_type",
    "job_type",
    "embedding_profile_id",
)


@dataclass(frozen=True)
class VectorPoint:
    point_id: str
    asset_id: str
    asset_version_id: str
    collection_name: str
    text: str
    payload: dict[str, object]


@dataclass(frozen=True)
class SearchHit:
    point_id: str
    asset_id: str
    asset_version_id: str
    collection_name: str
    score: float


@dataclass(frozen=True)
class UpsertCall:
    collection_name: str
    points: list[VectorPoint]


@dataclass(frozen=True)
class QueryCall:
    collection_name: str
    query: str
    limit: int
    filters: dict[str, object] | None


class VectorStore(Protocol):
    def upsert(self, collection_name: str, points: list[VectorPoint]) -> None:
        ...

    def query(self, collection_name: str, query: str, limit: int, filters: dict[str, object] | None = None) -> list[SearchHit]:
        ...


class InMemoryVectorStore:
    def __init__(self) -> None:
        self.points: dict[str, list[VectorPoint]] = {}
        self.upsert_calls: list[UpsertCall] = []
        self.query_calls: list[QueryCall] = []

    def upsert(self, collection_name: str, points: list[VectorPoint]) -> None:
        self.upsert_calls.append(UpsertCall(collection_name, points))
        collection = self.points.setdefault(collection_name, [])
        point_ids = {point.point_id for point in points}
        collection[:] = [point for point in collection if point.point_id not in point_ids]
        collection.extend(points)

    def query(self, collection_name: str, query: str, limit: int, filters: dict[str, object] | None = None) -> list[SearchHit]:
        self.query_calls.append(QueryCall(collection_name, query, limit, filters))
        query_tokens = _tokens(query)
        hits: list[SearchHit] = []
        for point in self.points.get(collection_name, []):
            if not _matches_filters(point.payload, filters):
                continue
            point_tokens = _tokens(point.text)
            overlap = query_tokens & point_tokens
            substring_bonus = 1.0 if query.lower() in point.text.lower() else 0.0
            score = float(len(overlap)) + substring_bonus
            if score > 0:
                hits.append(
                    SearchHit(
                        point_id=point.point_id,
                        asset_id=point.asset_id,
                        asset_version_id=point.asset_version_id,
                        collection_name=collection_name,
                        score=score,
                    )
                )
        hits.sort(key=lambda hit: hit.score, reverse=True)
        return hits[:limit]


class QdrantVectorStore:
    def __init__(self, url: str, api_key: str, embedding_provider: EmbeddingProvider | None = None):
        self.url = _validated_local_qdrant_url(url)
        self.api_key = api_key
        self.embedding_provider = embedding_provider or FastEmbedEmbeddingProvider()
        self._collections_ready: set[str] = set()

    def upsert(self, collection_name: str, points: list[VectorPoint]) -> None:
        self._ensure_collection(collection_name)
        payload = {
            "points": [
                {
                    "id": point.point_id,
                    "vector": self.embedding_provider.embed_document(collection_name, point.text, point.payload),
                    "payload": point.payload | {
                        "asset_id": point.asset_id,
                        "asset_version_id": point.asset_version_id,
                        "collection_name": collection_name,
                        "text": point.text,
                    },
                }
                for point in points
            ]
        }
        self._request("PUT", f"/collections/{collection_name}/points?wait=true", payload)

    def query(self, collection_name: str, query: str, limit: int, filters: dict[str, object] | None = None) -> list[SearchHit]:
        self._ensure_collection(collection_name)
        payload: dict[str, object] = {
            "query": self.embedding_provider.embed_query(collection_name, query),
            "limit": limit,
            "with_payload": True,
        }
        qdrant_filter = _qdrant_filter(filters)
        if qdrant_filter:
            payload["filter"] = qdrant_filter
        response = self._request("POST", f"/collections/{collection_name}/points/query", payload)
        result = response.get("result", {})
        points = result.get("points", []) if isinstance(result, dict) else result
        return [
            SearchHit(
                point_id=str(item["id"]),
                asset_id=str(item.get("payload", {}).get("asset_id")),
                asset_version_id=str(item.get("payload", {}).get("asset_version_id")),
                collection_name=collection_name,
                score=float(item.get("score", 0.0)),
            )
            for item in points
        ]

    def _ensure_collection(self, collection_name: str) -> None:
        if collection_name in self._collections_ready:
            return
        if not self._collection_exists(collection_name):
            payload = {"vectors": {"size": self.embedding_provider.dimension(collection_name), "distance": "Cosine"}}
            self._request("PUT", f"/collections/{collection_name}", payload)
        self._ensure_payload_indexes(collection_name)
        self._collections_ready.add(collection_name)

    def _collection_exists(self, collection_name: str) -> bool:
        response = self._request("GET", f"/collections/{collection_name}/exists")
        result = response.get("result", {})
        return bool(result.get("exists")) if isinstance(result, dict) else False

    def _ensure_payload_indexes(self, collection_name: str) -> None:
        for field in PAYLOAD_INDEX_FIELDS:
            self._create_payload_index(collection_name, field)

    def _create_payload_index(self, collection_name: str, field_name: str) -> None:
        try:
            self._request(
                "PUT",
                f"/collections/{collection_name}/index",
                {"field_name": field_name, "field_schema": "keyword"},
            )
        except urllib.error.HTTPError as exc:
            if exc.code in {400, 409} and _http_error_mentions_existing_index(exc):
                return
            raise

    def _request(self, method: str, path: str, payload: dict[str, object] | None = None) -> dict[str, object]:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"api-key": self.api_key}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            f"{self.url}{path}",
            data=data,
            method=method,
            headers=headers,
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))


def deterministic_embedding(text: str) -> list[float]:
    values = [0.0] * VECTOR_DIMENSION
    for token in _tokens(text):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:2], "big") % VECTOR_DIMENSION
        sign = 1.0 if digest[2] % 2 == 0 else -1.0
        values[index] += sign
    norm = math.sqrt(sum(value * value for value in values)) or 1.0
    return [value / norm for value in values]


def _validated_local_qdrant_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Qdrant URL must use http or https")
    if parsed.username or parsed.password:
        raise ValueError("Qdrant URL must not include user info")
    if parsed.hostname != "127.0.0.1":
        raise ValueError("Qdrant must be bound to 127.0.0.1")
    if parsed.port is None:
        raise ValueError("Qdrant URL must include an explicit port")
    if parsed.params or parsed.query or parsed.fragment:
        raise ValueError("Qdrant URL must not include params, query, or fragment")
    return f"{parsed.scheme}://127.0.0.1:{parsed.port}{parsed.path.rstrip('/')}"


def _http_error_mentions_existing_index(exc: urllib.error.HTTPError) -> bool:
    try:
        body = exc.read().decode("utf-8", errors="ignore")
    except Exception:
        return False
    return "already" in body.lower() and "index" in body.lower()


def default_collections(search_types: list[str] | None = None) -> list[str]:
    requested = set(search_types or ["text", "image"])
    collections: list[str] = []
    if "text" in requested or "ocr" in requested:
        collections.append(TEXT_COLLECTION)
    if "image" in requested:
        collections.append(IMAGE_COLLECTION)
    return collections


def _tokens(value: str) -> set[str]:
    import re

    return {part for part in re.split(r"[^a-zA-Z0-9_\u4e00-\u9fff]+", value.lower()) if part}


def _matches_filters(payload: dict[str, object], filters: dict[str, object] | None) -> bool:
    if not filters:
        return True
    mime_types = filters.get("mime_types")
    if isinstance(mime_types, list) and mime_types and payload.get("mime_type") not in mime_types:
        return False
    return True


def _qdrant_filter(filters: dict[str, object] | None) -> dict[str, object] | None:
    if not filters:
        return None
    must = []
    mime_types = filters.get("mime_types")
    if isinstance(mime_types, list) and mime_types:
        must.append({"key": "mime_type", "match": {"any": mime_types}})
    return {"must": must} if must else None
