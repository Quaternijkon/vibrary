from __future__ import annotations

from pathlib import Path
from typing import Protocol

from .config import IMAGE_COLLECTION
from .pipeline import PipelineConfig


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
            return self._embed_image_text(_expand_visual_query(query))
        return self._embed_text(f"query: {_expand_visual_query(query)}")

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


class JinaOmniEmbeddingProvider:
    def __init__(self, pipeline: PipelineConfig, cache_dir: Path | None = None):
        self.pipeline = pipeline
        self.cache_dir = str(cache_dir) if cache_dir else None
        self._model = None

    def dimension(self, collection_name: str) -> int:
        return self.pipeline.embedding.dimension

    def embed_document(self, collection_name: str, text: str, payload: dict[str, object]) -> list[float]:
        source_path = payload.get("source_path")
        if collection_name == self.pipeline.collections.image and isinstance(source_path, str) and Path(source_path).exists():
            return self._encode_image_document(Path(source_path))
        return self._encode_document(text)

    def embed_query(self, collection_name: str, query: str) -> list[float]:
        return self._encode_query(query)

    def _encode_document(self, text: str) -> list[float]:
        model = self._load_model()
        return _as_float_list(_first_vector(_call_model(model, ["encode_document", "encode"], [text])))

    def _encode_query(self, query: str) -> list[float]:
        model = self._load_model()
        return _as_float_list(_first_vector(_call_model(model, ["encode_query", "encode"], [query])))

    def _encode_image_document(self, path: Path) -> list[float]:
        model = self._load_model()
        image = _open_rgb_image(path)
        return _as_float_list(_first_vector(_call_model(model, ["encode_image", "encode"], [image])))

    def _load_model(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as exc:  # pragma: no cover - depends on packaged runtime.
                raise RuntimeError(
                    "sentence-transformers is required for jina-v5-omni-small embedding; install backend requirements"
                ) from exc
            kwargs = {
                "trust_remote_code": self.pipeline.embedding.trust_remote_code,
                "model_kwargs": {"default_task": "retrieval", "modality": "vision"},
            }
            if self.cache_dir:
                kwargs["cache_folder"] = self.cache_dir
            self._model = SentenceTransformer(self.pipeline.embedding.model_name, **kwargs)
        return self._model


def create_embedding_provider(pipeline: PipelineConfig, cache_dir: Path | None = None) -> EmbeddingProvider:
    if pipeline.embedding.provider_id == "jina-v5-omni-small":
        return JinaOmniEmbeddingProvider(pipeline, cache_dir=cache_dir)
    raise ValueError(f"unsupported embedding provider: {pipeline.embedding.provider_id}")


def _as_float_list(vector) -> list[float]:
    if hasattr(vector, "tolist"):
        values = vector.tolist()
    else:
        values = list(vector)
    return [float(value) for value in values]


def _call_model(model, method_names: list[str], values: list[object]):
    last_type_error: TypeError | None = None
    for name in method_names:
        method = getattr(model, name, None)
        if method is None:
            continue
        try:
            return method(values, convert_to_numpy=True)
        except TypeError as exc:
            last_type_error = exc
            try:
                return method(values)
            except TypeError as inner_exc:
                last_type_error = inner_exc
    if last_type_error is not None:
        raise last_type_error
    raise RuntimeError("embedding model does not expose an encoding method")


def _first_vector(result):
    if isinstance(result, list) and result:
        return result[0]
    if hasattr(result, "shape") and len(result.shape) > 1:
        return result[0]
    return result


def _open_rgb_image(path: Path):
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover - depends on packaged runtime.
        raise RuntimeError("Pillow is required for image embedding") from exc
    return Image.open(path).convert("RGB")


_VISUAL_QUERY_ALIASES = {
    "猴": "monkey ape macaque primate animal",
    "猴子": "monkey ape macaque primate animal",
    "猿": "ape monkey primate animal",
    "猫": "cat kitten pet animal",
    "狗": "dog puppy pet animal",
    "鸟": "bird wildlife animal",
    "鱼": "fish aquatic animal sea life",
    "马": "horse animal",
    "牛": "cow cattle farm animal",
    "羊": "sheep goat farm animal",
    "大象": "elephant animal wildlife",
    "老虎": "tiger big cat wildlife",
    "狮子": "lion big cat wildlife",
    "熊猫": "panda animal wildlife",
    "熊": "bear animal wildlife",
    "人": "person people human portrait",
    "人脸": "face portrait selfie",
    "车": "car vehicle automobile",
    "汽车": "car vehicle automobile",
    "公交": "bus vehicle transport",
    "火车": "train railway transport",
    "飞机": "airplane aircraft transport",
    "自行车": "bicycle bike cycling",
    "摩托": "motorcycle bike vehicle",
    "船": "boat ship watercraft",
    "建筑": "building architecture house city",
    "桥": "bridge architecture river",
    "山": "mountain landscape nature",
    "河": "river water landscape",
    "海": "ocean sea beach water",
    "森林": "forest trees nature",
    "花": "flower plant blossom",
    "树": "tree plant forest",
    "食物": "food meal dish",
    "水果": "fruit apple banana orange",
    "咖啡": "coffee drink cup",
    "书": "book document paper",
    "文档": "document paper page text",
    "截图": "screenshot screen capture interface app",
    "图表": "chart graph plot diagram",
    "表格": "table spreadsheet grid",
    "票据": "receipt invoice bill paper",
    "标志": "logo brand icon",
    "地图": "map navigation location",
    "手机": "phone smartphone device",
    "电脑": "computer laptop desktop device",
    "键盘": "keyboard computer device",
    "服装": "clothing shirt dress fashion",
    "鞋": "shoes sneakers footwear",
    "运动": "sports ball exercise game",
    "音乐": "music instrument concert",
    "医疗": "medical hospital medicine health",
    "钱": "money cash banknote currency",
}


def _expand_visual_query(query: str) -> str:
    normalized = query.strip()
    if not normalized:
        return query
    aliases = [alias for key, alias in _VISUAL_QUERY_ALIASES.items() if key in normalized]
    if not aliases:
        return normalized
    return " ".join([normalized, *aliases])
