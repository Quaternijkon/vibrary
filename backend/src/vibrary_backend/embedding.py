from __future__ import annotations

from pathlib import Path
from typing import Protocol

from .config import IMAGE_COLLECTION, TEXT_COLLECTION


TEXT_EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
IMAGE_TEXT_EMBEDDING_MODEL = "Qdrant/clip-ViT-B-32-text"
IMAGE_EMBEDDING_MODEL = "Qdrant/clip-ViT-B-32-vision"
TEXT_EMBEDDING_DIMENSION = 384
IMAGE_EMBEDDING_DIMENSION = 512


class EmbeddingProvider(Protocol):
    def dimension(self, collection_name: str) -> int:
        ...

    def embed_document(self, collection_name: str, text: str, payload: dict[str, object]) -> list[float]:
        ...

    def embed_query(self, collection_name: str, query: str) -> list[float]:
        ...


class FastEmbedEmbeddingProvider:
    def __init__(self, cache_dir: Path | None = None):
        self.cache_dir = str(cache_dir) if cache_dir else None
        self._text_model = None
        self._image_text_model = None
        self._image_model = None

    def dimension(self, collection_name: str) -> int:
        return IMAGE_EMBEDDING_DIMENSION if collection_name == IMAGE_COLLECTION else TEXT_EMBEDDING_DIMENSION

    def embed_document(self, collection_name: str, text: str, payload: dict[str, object]) -> list[float]:
        if collection_name == IMAGE_COLLECTION:
            source_path = payload.get("source_path")
            if isinstance(source_path, str) and Path(source_path).exists():
                return self._embed_image(source_path)
            return self._embed_image_text(text)
        return self._embed_text(f"passage: {text}")

    def embed_query(self, collection_name: str, query: str) -> list[float]:
        if collection_name == IMAGE_COLLECTION:
            return self._embed_image_text(query)
        return self._embed_text(f"query: {query}")

    def _embed_text(self, text: str) -> list[float]:
        model = self._load_text_model()
        return _as_float_list(next(iter(model.embed([text]))))

    def _embed_image_text(self, text: str) -> list[float]:
        model = self._load_image_text_model()
        return _as_float_list(next(iter(model.embed([text]))))

    def _embed_image(self, path: str) -> list[float]:
        model = self._load_image_model()
        return _as_float_list(next(iter(model.embed([path]))))

    def _load_text_model(self):
        if self._text_model is None:
            self._text_model = self._create_text_embedding(TEXT_EMBEDDING_MODEL)
        return self._text_model

    def _load_image_text_model(self):
        if self._image_text_model is None:
            self._image_text_model = self._create_text_embedding(IMAGE_TEXT_EMBEDDING_MODEL)
        return self._image_text_model

    def _load_image_model(self):
        if self._image_model is None:
            try:
                from fastembed import ImageEmbedding
            except ImportError as exc:  # pragma: no cover - depends on packaged runtime.
                raise RuntimeError("fastembed is required for image embedding; install backend requirements") from exc
            kwargs = {"cache_dir": self.cache_dir} if self.cache_dir else {}
            self._image_model = ImageEmbedding(model_name=IMAGE_EMBEDDING_MODEL, **kwargs)
        return self._image_model

    def _create_text_embedding(self, model_name: str):
        try:
            from fastembed import TextEmbedding
        except ImportError as exc:  # pragma: no cover - depends on packaged runtime.
            raise RuntimeError("fastembed is required for text embedding; install backend requirements") from exc
        kwargs = {"cache_dir": self.cache_dir} if self.cache_dir else {}
        return TextEmbedding(model_name=model_name, **kwargs)


def _as_float_list(vector) -> list[float]:
    if hasattr(vector, "tolist"):
        values = vector.tolist()
    else:
        values = list(vector)
    return [float(value) for value in values]
