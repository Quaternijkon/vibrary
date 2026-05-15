from __future__ import annotations

import os
from dataclasses import dataclass, field
from enum import Enum
from typing import Mapping


JINA_OMNI_SMALL_PROVIDER_ID = "jina-v5-omni-small"
JINA_OMNI_SMALL_PROFILE = "jina-v5-omni-small-retrieval-v1"
JINA_OMNI_SMALL_MODEL = "jinaai/jina-embeddings-v5-omni-small"
JINA_OMNI_SMALL_REVISION = "main"
JINA_OMNI_SMALL_DIMENSION = 1024


class RetrievalMode(str, Enum):
    HNSW = "hnsw"
    FULL_SCAN = "full_scan"


@dataclass(frozen=True)
class CollectionNames:
    text: str
    image: str
    image_labels: str

    def all(self) -> list[str]:
        return [self.text, self.image_labels, self.image]

    def for_search_types(self, search_types: list[str] | None = None) -> list[str]:
        requested = set(search_types or ["text", "image"])
        collections: list[str] = []
        if "text" in requested or "ocr" in requested:
            collections.append(self.text)
        if "image" in requested:
            collections.append(self.image_labels)
            collections.append(self.image)
        return collections

    def as_payload(self) -> dict[str, str]:
        return {"text": self.text, "image": self.image, "image_labels": self.image_labels}


@dataclass(frozen=True)
class EmbeddingStageConfig:
    provider_id: str
    profile_id: str
    model_name: str
    model_revision: str
    dimension: int
    runtime: str
    trust_remote_code: bool

    def profile_row(self) -> dict[str, object]:
        return {
            "embedding_profile_id": self.profile_id,
            "model_name": self.model_name,
            "model_revision": self.model_revision,
            "modality": "omni",
            "dimension": self.dimension,
            "distance": "Cosine",
            "runtime": self.runtime,
            "local_model_path": "",
            "license_note": "See model card for license and usage terms.",
            "is_default": 1,
        }

    def as_payload(self) -> dict[str, object]:
        return {
            "provider_id": self.provider_id,
            "profile_id": self.profile_id,
            "model_name": self.model_name,
            "model_revision": self.model_revision,
            "dimension": self.dimension,
            "runtime": self.runtime,
            "trust_remote_code": self.trust_remote_code,
        }


@dataclass(frozen=True)
class HnswIndexConfig:
    m: int = 16
    ef_construct: int = 200
    full_scan_threshold: int = 10000
    search_ef: int = 128

    def qdrant_collection_payload(self) -> dict[str, int]:
        return {
            "m": self.m,
            "ef_construct": self.ef_construct,
            "full_scan_threshold": self.full_scan_threshold,
        }

    def as_payload(self) -> dict[str, int]:
        return {
            "m": self.m,
            "ef_construct": self.ef_construct,
            "full_scan_threshold": self.full_scan_threshold,
            "search_ef": self.search_ef,
        }


@dataclass(frozen=True)
class RetrievalStageConfig:
    mode: RetrievalMode = RetrievalMode.HNSW
    hnsw: HnswIndexConfig = field(default_factory=HnswIndexConfig)

    def qdrant_search_params(self) -> dict[str, object]:
        if self.mode == RetrievalMode.FULL_SCAN:
            return {"exact": True}
        return {"hnsw_ef": self.hnsw.search_ef, "exact": False}

    def as_payload(self) -> dict[str, object]:
        return {"mode": self.mode.value, "hnsw": self.hnsw.as_payload()}


@dataclass(frozen=True)
class PipelineConfig:
    embedding: EmbeddingStageConfig
    retrieval: RetrievalStageConfig
    collections: CollectionNames

    @classmethod
    def default(cls) -> "PipelineConfig":
        return cls(
            embedding=_provider_config(JINA_OMNI_SMALL_PROVIDER_ID),
            retrieval=RetrievalStageConfig(),
            collections=CollectionNames(
                text="text_chunks_jina_v5_omni_small_v1",
                image="image_semantic_jina_v5_omni_small_v1",
                image_labels="image_labels_jina_v5_omni_small_v1",
            ),
        )

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "PipelineConfig":
        source = env or os.environ
        provider_id = source.get("VIBRARY_EMBEDDING_PROVIDER", JINA_OMNI_SMALL_PROVIDER_ID)
        mode = _retrieval_mode(source.get("VIBRARY_RETRIEVAL_MODE", RetrievalMode.HNSW.value))
        return cls(
            embedding=_provider_config(provider_id),
            retrieval=RetrievalStageConfig(
                mode=mode,
                hnsw=HnswIndexConfig(
                    m=_positive_int(source.get("VIBRARY_QDRANT_HNSW_M"), 16),
                    ef_construct=_positive_int(source.get("VIBRARY_QDRANT_HNSW_EF_CONSTRUCT"), 200),
                    full_scan_threshold=_positive_int(source.get("VIBRARY_QDRANT_HNSW_FULL_SCAN_THRESHOLD"), 10000),
                    search_ef=_positive_int(source.get("VIBRARY_QDRANT_HNSW_SEARCH_EF"), 128),
                ),
            ),
            collections=cls.default().collections,
        )

    def as_payload(self) -> dict[str, object]:
        return {
            "embedding": self.embedding.as_payload(),
            "retrieval": self.retrieval.as_payload(),
            "collections": self.collections.as_payload(),
        }

    def options_payload(self) -> dict[str, object]:
        return {
            "embedding_providers": [
                {
                    "id": JINA_OMNI_SMALL_PROVIDER_ID,
                    "label": "Jina embeddings v5 omni small",
                    "model_name": JINA_OMNI_SMALL_MODEL,
                    "dimension": JINA_OMNI_SMALL_DIMENSION,
                    "modalities": ["text", "image"],
                }
            ],
            "retrieval_modes": [mode.value for mode in RetrievalMode],
        }


def _provider_config(provider_id: str) -> EmbeddingStageConfig:
    if provider_id != JINA_OMNI_SMALL_PROVIDER_ID:
        raise ValueError(f"unsupported embedding provider: {provider_id}")
    return EmbeddingStageConfig(
        provider_id=JINA_OMNI_SMALL_PROVIDER_ID,
        profile_id=JINA_OMNI_SMALL_PROFILE,
        model_name=JINA_OMNI_SMALL_MODEL,
        model_revision=JINA_OMNI_SMALL_REVISION,
        dimension=JINA_OMNI_SMALL_DIMENSION,
        runtime="sentence-transformers",
        trust_remote_code=True,
    )


def _retrieval_mode(value: str) -> RetrievalMode:
    try:
        return RetrievalMode(value)
    except ValueError as exc:
        raise ValueError(f"unsupported retrieval mode: {value}") from exc


def _positive_int(raw: str | None, fallback: int) -> int:
    if raw is None:
        return fallback
    try:
        value = int(raw)
    except ValueError:
        return fallback
    return value if value > 0 else fallback
