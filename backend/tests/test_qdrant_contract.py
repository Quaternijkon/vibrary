import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vibrary_backend.config import AppPaths, TEXT_COLLECTION
from vibrary_backend.database import Database
from vibrary_backend.indexing import IndexService
from vibrary_backend.library import LibraryService
from vibrary_backend.resolver import ReplicaResolver
from vibrary_backend.search import SearchService
from vibrary_backend.vector_store import InMemoryVectorStore, QdrantVectorStore


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


if __name__ == "__main__":
    unittest.main()
