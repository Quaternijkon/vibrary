import sys
import tempfile
import unittest
from pathlib import Path
from uuid import UUID


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vibrary_backend.config import AppPaths, IMAGE_LABEL_COLLECTION, TEXT_COLLECTION
from vibrary_backend.database import Database
from vibrary_backend.indexing import IndexService
from vibrary_backend.library import LibraryService
from vibrary_backend.pipeline import HnswIndexConfig, RetrievalMode, RetrievalStageConfig
from vibrary_backend.resolver import ReplicaResolver
from vibrary_backend.search import SearchService
from vibrary_backend.vector_store import InMemoryVectorStore, QdrantVectorStore, VectorPoint, default_collections


class StaticEmbeddingProvider:
    def dimension(self, collection_name: str) -> int:
        return 3

    def embed_document(self, collection_name: str, text: str, payload: dict[str, object]) -> list[float]:
        return [0.1, 0.2, 0.3]

    def embed_query(self, collection_name: str, query: str) -> list[float]:
        return [0.3, 0.2, 0.1]


class QdrantContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.paths = AppPaths.from_root(self.root)
        self.db = Database(self.paths.database_path)
        self.db.initialize()
        self.db.upsert_device("windows-local", "Windows", "windows", is_trusted=True)
        self.vector_store = InMemoryVectorStore()
        self.library = LibraryService(self.db, self.paths)
        self.resolver = ReplicaResolver(self.db, self.paths)
        self.indexer = IndexService(self.db, self.paths, self.vector_store)
        self.search = SearchService(self.db, self.paths, self.resolver, self.vector_store)

    def tearDown(self) -> None:
        self.db.close()
        self.temp.cleanup()

    def test_indexing_upserts_to_versioned_qdrant_collection(self) -> None:
        source = self.root / "red-car.txt"
        source.write_text("red car local search", encoding="utf-8")
        imported = self.library.import_path(source, device_id="windows-local")

        processed = self.indexer.process_next()

        self.assertEqual(processed.indexed_count, 1)
        self.assertEqual(self.vector_store.upsert_calls[0].collection_name, TEXT_COLLECTION)
        self.assertEqual(self.vector_store.upsert_calls[0].points[0].asset_id, imported.assets[0].asset_id)
        self.assertIn("red car", self.vector_store.upsert_calls[0].points[0].text)

    def test_indexing_uses_qdrant_compatible_uuid_point_ids(self) -> None:
        source = self.root / "point-id.txt"
        source.write_text("qdrant point id", encoding="utf-8")
        self.library.import_path(source, device_id="windows-local")

        self.indexer.process_next()

        point_id = self.vector_store.upsert_calls[0].points[0].point_id
        self.assertEqual(str(UUID(point_id)), point_id)

    def test_indexing_retries_existing_failed_jobs_after_a_code_fix(self) -> None:
        source = self.root / "retry-failed.txt"
        source.write_text("retry this failed job", encoding="utf-8")
        imported = self.library.import_path(source, device_id="windows-local")
        self.db.execute(
            "UPDATE index_jobs SET status = 'failed', retry_count = 1, error_message = 'HTTP Error 400: Bad Request' WHERE asset_id = ?",
            (imported.assets[0].asset_id,),
        )

        processed = self.indexer.process_next()

        self.assertEqual(processed.indexed_count, 1)
        self.assertEqual(self.vector_store.upsert_calls[0].points[0].asset_id, imported.assets[0].asset_id)

    def test_search_queries_qdrant_vector_store_not_sqlite_document_scan(self) -> None:
        source = self.root / "blue-truck.txt"
        source.write_text("blue truck only", encoding="utf-8")
        imported = self.library.import_path(source, device_id="windows-local")
        self.indexer.process_next()

        result = self.search.search(device_id="windows-local", query="blue truck", limit=5)

        self.assertEqual(self.vector_store.query_calls[0].query, "blue truck")
        self.assertEqual(result["results"][0]["asset_id"], imported.assets[0].asset_id)

    def test_qdrant_url_validation_rejects_userinfo_host_spoofing(self) -> None:
        with self.assertRaises(ValueError):
            QdrantVectorStore("http://127.0.0.1:6333@attacker.example", "secret")

    def test_qdrant_reuses_existing_collection_and_uses_query_api(self) -> None:
        store = QdrantVectorStore("http://127.0.0.1:6333", "secret", embedding_provider=StaticEmbeddingProvider())
        calls: list[tuple[str, str, dict[str, object] | None]] = []

        def fake_request(method: str, path: str, payload: dict[str, object] | None = None) -> dict[str, object]:
            calls.append((method, path, payload))
            if path == f"/collections/{TEXT_COLLECTION}/exists":
                return {"result": {"exists": True}}
            if path == f"/collections/{TEXT_COLLECTION}/points/query":
                return {
                    "result": {
                        "points": [
                            {
                                "id": "point_1",
                                "score": 0.91,
                                "payload": {
                                    "asset_id": "asset_1",
                                    "asset_version_id": "ver_1",
                                },
                            }
                        ]
                    }
                }
            return {"result": {}}

        store._request = fake_request  # type: ignore[method-assign]

        store.upsert(
            TEXT_COLLECTION,
            [
                VectorPoint(
                    point_id="point_1",
                    asset_id="asset_1",
                    asset_version_id="ver_1",
                    collection_name=TEXT_COLLECTION,
                    text="red car",
                    payload={"mime_type": "text/plain"},
                )
            ],
        )
        hits = store.query(TEXT_COLLECTION, "red car", limit=5)

        self.assertNotIn(("PUT", f"/collections/{TEXT_COLLECTION}", {"vectors": {"size": 3, "distance": "Cosine"}}), calls)
        self.assertIn(("GET", f"/collections/{TEXT_COLLECTION}/exists", None), calls)
        self.assertTrue(any(method == "PUT" and path == f"/collections/{TEXT_COLLECTION}/points?wait=true" for method, path, _ in calls))
        self.assertTrue(any(method == "POST" and path == f"/collections/{TEXT_COLLECTION}/points/query" for method, path, _ in calls))
        self.assertEqual(hits[0].asset_id, "asset_1")

    def test_qdrant_creates_payload_indexes_before_first_upsert(self) -> None:
        store = QdrantVectorStore("http://127.0.0.1:6333", "secret", embedding_provider=StaticEmbeddingProvider())
        calls: list[tuple[str, str, dict[str, object] | None]] = []

        def fake_request(method: str, path: str, payload: dict[str, object] | None = None) -> dict[str, object]:
            calls.append((method, path, payload))
            if path == f"/collections/{TEXT_COLLECTION}/exists":
                return {"result": {"exists": False}}
            return {"result": {}}

        store._request = fake_request  # type: ignore[method-assign]

        store.upsert(
            TEXT_COLLECTION,
            [
                VectorPoint(
                    point_id="point_1",
                    asset_id="asset_1",
                    asset_version_id="ver_1",
                    collection_name=TEXT_COLLECTION,
                    text="red car",
                    payload={"mime_type": "text/plain"},
                )
            ],
        )

        index_calls = [
            payload
            for method, path, payload in calls
            if method == "PUT" and path == f"/collections/{TEXT_COLLECTION}/index"
        ]
        self.assertIn({"field_name": "asset_id", "field_schema": "keyword"}, index_calls)
        self.assertIn({"field_name": "mime_type", "field_schema": "keyword"}, index_calls)
        self.assertLess(
            calls.index(("PUT", f"/collections/{TEXT_COLLECTION}/index", {"field_name": "asset_id", "field_schema": "keyword"})),
            next(i for i, call in enumerate(calls) if call[1] == f"/collections/{TEXT_COLLECTION}/points?wait=true"),
        )

    def test_image_search_queries_label_collection_before_raw_image_collection(self) -> None:
        self.assertEqual(default_collections(["image"])[0], IMAGE_LABEL_COLLECTION)

    def test_qdrant_label_collection_uses_text_vector_dimension(self) -> None:
        store = QdrantVectorStore("http://127.0.0.1:6333", "secret", embedding_provider=StaticEmbeddingProvider())
        calls: list[tuple[str, str, dict[str, object] | None]] = []

        def fake_request(method: str, path: str, payload: dict[str, object] | None = None) -> dict[str, object]:
            calls.append((method, path, payload))
            if path == f"/collections/{IMAGE_LABEL_COLLECTION}/exists":
                return {"result": {"exists": False}}
            return {"result": {}}

        store._request = fake_request  # type: ignore[method-assign]

        store.upsert(
            IMAGE_LABEL_COLLECTION,
            [
                VectorPoint(
                    point_id="point_1",
                    asset_id="asset_1",
                    asset_version_id="ver_1",
                    collection_name=IMAGE_LABEL_COLLECTION,
                    text="猴子 monkey",
                    payload={"mime_type": "image/jpeg"},
                )
            ],
        )

        creation_payload = next(payload for method, path, payload in calls if method == "PUT" and path == f"/collections/{IMAGE_LABEL_COLLECTION}")
        self.assertEqual(creation_payload["vectors"], {"size": 3, "distance": "Cosine"})

    def test_qdrant_collection_creation_applies_hnsw_config(self) -> None:
        retrieval = RetrievalStageConfig(
            mode=RetrievalMode.HNSW,
            hnsw=HnswIndexConfig(m=32, ef_construct=240, full_scan_threshold=512, search_ef=80),
        )
        store = QdrantVectorStore(
            "http://127.0.0.1:6333",
            "secret",
            embedding_provider=StaticEmbeddingProvider(),
            retrieval=retrieval,
        )
        calls: list[tuple[str, str, dict[str, object] | None]] = []

        def fake_request(method: str, path: str, payload: dict[str, object] | None = None) -> dict[str, object]:
            calls.append((method, path, payload))
            if path == f"/collections/{TEXT_COLLECTION}/exists":
                return {"result": {"exists": False}}
            return {"result": {"points": []}}

        store._request = fake_request  # type: ignore[method-assign]

        store.query(TEXT_COLLECTION, "monkey", limit=3)

        self.assertIn(
            (
                "PUT",
                f"/collections/{TEXT_COLLECTION}",
                {
                    "vectors": {"size": 3, "distance": "Cosine"},
                    "hnsw_config": {"m": 32, "ef_construct": 240, "full_scan_threshold": 512},
                },
            ),
            calls,
        )

    def test_qdrant_query_uses_hnsw_search_params_when_hnsw_mode_is_selected(self) -> None:
        retrieval = RetrievalStageConfig(
            mode=RetrievalMode.HNSW,
            hnsw=HnswIndexConfig(search_ef=123),
        )
        store = QdrantVectorStore(
            "http://127.0.0.1:6333",
            "secret",
            embedding_provider=StaticEmbeddingProvider(),
            retrieval=retrieval,
        )
        calls: list[tuple[str, str, dict[str, object] | None]] = []

        def fake_request(method: str, path: str, payload: dict[str, object] | None = None) -> dict[str, object]:
            calls.append((method, path, payload))
            if path == f"/collections/{TEXT_COLLECTION}/exists":
                return {"result": {"exists": True}}
            if path == f"/collections/{TEXT_COLLECTION}/points/query":
                return {"result": {"points": []}}
            return {"result": {}}

        store._request = fake_request  # type: ignore[method-assign]

        store.query(TEXT_COLLECTION, "monkey", limit=3)

        query_payload = next(payload for method, path, payload in calls if method == "POST" and path.endswith("/points/query"))
        self.assertEqual(query_payload["params"], {"hnsw_ef": 123, "exact": False})

    def test_qdrant_query_uses_exact_search_params_when_full_scan_mode_is_selected(self) -> None:
        retrieval = RetrievalStageConfig(mode=RetrievalMode.FULL_SCAN)
        store = QdrantVectorStore(
            "http://127.0.0.1:6333",
            "secret",
            embedding_provider=StaticEmbeddingProvider(),
            retrieval=retrieval,
        )
        calls: list[tuple[str, str, dict[str, object] | None]] = []

        def fake_request(method: str, path: str, payload: dict[str, object] | None = None) -> dict[str, object]:
            calls.append((method, path, payload))
            if path == f"/collections/{TEXT_COLLECTION}/exists":
                return {"result": {"exists": True}}
            if path == f"/collections/{TEXT_COLLECTION}/points/query":
                return {"result": {"points": []}}
            return {"result": {}}

        store._request = fake_request  # type: ignore[method-assign]

        store.query(TEXT_COLLECTION, "monkey", limit=3)

        query_payload = next(payload for method, path, payload in calls if method == "POST" and path.endswith("/points/query"))
        self.assertEqual(query_payload["params"], {"exact": True})


if __name__ == "__main__":
    unittest.main()
