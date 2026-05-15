from __future__ import annotations

from dataclasses import dataclass

from .pipeline import RetrievalStageConfig
from .vector_store import QdrantVectorStore


@dataclass(frozen=True)
class QdrantSettings:
    url: str = "http://127.0.0.1:6333"
    api_key: str = "dev-local-qdrant-key"
    retrieval: RetrievalStageConfig | None = None


def create_qdrant_store(settings: QdrantSettings) -> QdrantVectorStore:
    """Create the production vector-store adapter used by the index/search path."""

    return QdrantVectorStore(settings.url, settings.api_key, retrieval=settings.retrieval)
