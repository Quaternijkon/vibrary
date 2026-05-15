from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .embedding import IMAGE_EMBEDDING_MODEL, IMAGE_TEXT_EMBEDDING_MODEL, _as_float_list


@dataclass(frozen=True)
class VisualConcept:
    english: str
    chinese: str
    aliases: tuple[str, ...] = ()

    @property
    def label_text(self) -> str:
        return " ".join((self.chinese, self.english, *self.aliases))


class ImageSemanticAnalyzer(Protocol):
    def describe(self, path: Path, title: str, mime_type: str) -> str:
        ...


class NoopImageSemanticAnalyzer:
    def describe(self, path: Path, title: str, mime_type: str) -> str:
        return ""


class FastEmbedImageSemanticAnalyzer:
    def __init__(self, cache_dir: Path | None = None, *, top_k: int = 8, min_score: float = 0.18):
        self.cache_dir = str(cache_dir) if cache_dir else None
        self.top_k = top_k
        self.min_score = min_score
        self._image_model = None
        self._text_model = None
        self._concept_vectors: list[tuple[VisualConcept, list[float]]] | None = None

    def describe(self, path: Path, title: str, mime_type: str) -> str:
        try:
            image_vector = _as_float_list(next(iter(self._load_image_model().embed([str(path)]))))
            ranked = sorted(
                (
                    (_cosine(image_vector, concept_vector), concept)
                    for concept, concept_vector in self._load_concept_vectors()
                ),
                key=lambda item: item[0],
                reverse=True,
            )
        except Exception:
            return ""
        selected = [concept for score, concept in ranked if score >= self.min_score][: self.top_k]
        if not selected:
            selected = [concept for _, concept in ranked[: min(3, self.top_k)]]
        return " ".join(concept.label_text for concept in selected)

    def _load_image_model(self):
        if self._image_model is None:
            try:
                from fastembed import ImageEmbedding
            except ImportError as exc:  # pragma: no cover - depends on packaged runtime.
                raise RuntimeError("fastembed is required for image semantic analysis") from exc
            kwargs = {"cache_dir": self.cache_dir} if self.cache_dir else {}
            self._image_model = ImageEmbedding(model_name=IMAGE_EMBEDDING_MODEL, **kwargs)
        return self._image_model

    def _load_text_model(self):
        if self._text_model is None:
            try:
                from fastembed import TextEmbedding
            except ImportError as exc:  # pragma: no cover - depends on packaged runtime.
                raise RuntimeError("fastembed is required for image semantic analysis") from exc
            kwargs = {"cache_dir": self.cache_dir} if self.cache_dir else {}
            self._text_model = TextEmbedding(model_name=IMAGE_TEXT_EMBEDDING_MODEL, **kwargs)
        return self._text_model

    def _load_concept_vectors(self) -> list[tuple[VisualConcept, list[float]]]:
        if self._concept_vectors is None:
            prompts = [f"a photo of {concept.english}" for concept in VISUAL_CONCEPTS]
            vectors = [_as_float_list(vector) for vector in self._load_text_model().embed(prompts)]
            self._concept_vectors = list(zip(VISUAL_CONCEPTS, vectors))
        return self._concept_vectors


def _cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left)) or 1.0
    right_norm = math.sqrt(sum(b * b for b in right)) or 1.0
    return dot / (left_norm * right_norm)


VISUAL_CONCEPTS: tuple[VisualConcept, ...] = (
    VisualConcept("monkey", "猴子", ("ape", "macaque", "primate", "animal")),
    VisualConcept("cat", "猫", ("kitten", "pet", "animal")),
    VisualConcept("dog", "狗", ("puppy", "pet", "animal")),
    VisualConcept("bird", "鸟", ("wildlife", "animal")),
    VisualConcept("fish", "鱼", ("aquatic animal", "sea life")),
    VisualConcept("horse", "马", ("animal", "riding")),
    VisualConcept("cow", "牛", ("cattle", "farm animal")),
    VisualConcept("sheep", "羊", ("goat", "farm animal")),
    VisualConcept("elephant", "大象", ("animal", "wildlife")),
    VisualConcept("tiger", "老虎", ("big cat", "wildlife")),
    VisualConcept("lion", "狮子", ("big cat", "wildlife")),
    VisualConcept("bear", "熊", ("wildlife", "animal")),
    VisualConcept("panda", "熊猫", ("animal", "wildlife")),
    VisualConcept("person", "人", ("people", "portrait", "human")),
    VisualConcept("face", "人脸", ("portrait", "selfie")),
    VisualConcept("baby", "婴儿", ("child", "kid")),
    VisualConcept("car", "汽车", ("vehicle", "automobile")),
    VisualConcept("bus", "公交车", ("vehicle", "transport")),
    VisualConcept("train", "火车", ("railway", "transport")),
    VisualConcept("airplane", "飞机", ("aircraft", "transport")),
    VisualConcept("bicycle", "自行车", ("bike", "cycling")),
    VisualConcept("motorcycle", "摩托车", ("bike", "vehicle")),
    VisualConcept("boat", "船", ("ship", "watercraft")),
    VisualConcept("building", "建筑", ("architecture", "house", "city")),
    VisualConcept("bridge", "桥", ("architecture", "river")),
    VisualConcept("road", "道路", ("street", "highway")),
    VisualConcept("mountain", "山", ("landscape", "nature")),
    VisualConcept("river", "河流", ("water", "landscape")),
    VisualConcept("lake", "湖泊", ("water", "landscape")),
    VisualConcept("ocean", "海洋", ("sea", "beach", "water")),
    VisualConcept("forest", "森林", ("trees", "nature")),
    VisualConcept("flower", "花", ("plant", "blossom")),
    VisualConcept("tree", "树", ("plant", "forest")),
    VisualConcept("food", "食物", ("meal", "dish")),
    VisualConcept("fruit", "水果", ("apple", "banana", "orange")),
    VisualConcept("coffee", "咖啡", ("drink", "cup")),
    VisualConcept("book", "书", ("document", "paper")),
    VisualConcept("document", "文档", ("paper", "page", "text")),
    VisualConcept("screenshot", "截图", ("screen capture", "interface", "app")),
    VisualConcept("chart", "图表", ("graph", "plot", "diagram")),
    VisualConcept("table", "表格", ("spreadsheet", "grid")),
    VisualConcept("receipt", "票据", ("invoice", "bill", "paper")),
    VisualConcept("logo", "标志", ("brand", "icon")),
    VisualConcept("map", "地图", ("navigation", "location")),
    VisualConcept("phone", "手机", ("smartphone", "device")),
    VisualConcept("computer", "电脑", ("laptop", "desktop", "device")),
    VisualConcept("keyboard", "键盘", ("computer", "device")),
    VisualConcept("clothing", "服装", ("shirt", "dress", "fashion")),
    VisualConcept("shoes", "鞋", ("sneakers", "footwear")),
    VisualConcept("sports", "运动", ("ball", "exercise", "game")),
    VisualConcept("music", "音乐", ("instrument", "concert")),
    VisualConcept("medical", "医疗", ("hospital", "medicine", "health")),
    VisualConcept("money", "钱", ("cash", "banknote", "currency")),
)
