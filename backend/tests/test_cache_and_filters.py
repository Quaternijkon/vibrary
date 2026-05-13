import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vibrary_backend.cache import CacheService
from vibrary_backend.config import AppPaths
from vibrary_backend.database import Database
from vibrary_backend.indexing import IndexService
from vibrary_backend.library import LibraryService
from vibrary_backend.resolver import ReplicaResolver
from vibrary_backend.search import SearchService
from vibrary_backend.vector_store import InMemoryVectorStore


class CacheAndFilterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.paths = AppPaths.from_root(self.root)
        self.db = Database(self.paths.database_path)
        self.db.initialize()
        self.db.upsert_device("windows-local", "Windows", "windows", is_trusted=True)
        self.vector_store = InMemoryVectorStore()
        self.library = LibraryService(self.db, self.paths)
        self.indexer = IndexService(self.db, self.paths, self.vector_store)
        self.resolver = ReplicaResolver(self.db, self.paths)
        self.search = SearchService(self.db, self.paths, self.resolver, self.vector_store)
        self.cache = CacheService(self.db, self.paths)

    def tearDown(self) -> None:
        self.db.close()
        self.temp.cleanup()

    def test_search_respects_mime_filters(self) -> None:
        text_file = self.root / "match.txt"
        text_file.write_text("shared keyword", encoding="utf-8")
        json_file = self.root / "match.json"
        json_file.write_text("shared keyword", encoding="utf-8")
        self.library.import_path(text_file, "windows-local")
        self.library.import_path(json_file, "windows-local")
        self.indexer.process_next(limit=5)

        result = self.search.search(
            device_id="windows-local",
            query="shared keyword",
            search_types=["text"],
            filters={"mime_types": ["text/plain"]},
        )

        self.assertEqual([item["title"] for item in result["results"]], ["match.txt"])

    def test_cache_cleanup_removes_directory_entries_under_cache_root(self) -> None:
        temp_dir = self.paths.parse_temp_dir / "job-1"
        temp_dir.mkdir(parents=True)
        (temp_dir / "page.txt").write_text("temporary", encoding="utf-8")
        self.db.add_cache_entry(
            "windows-local",
            None,
            "parse_temp",
            temp_dir,
            9,
            relative_path=self.paths.relative_to_data(temp_dir),
        )

        cleared = self.cache.clear("parse_temp")

        self.assertEqual(cleared.deleted_files, 1)
        self.assertFalse(temp_dir.exists())
        self.assertEqual(self.db.scalar("SELECT COUNT(*) FROM cache_entries"), 0)


if __name__ == "__main__":
    unittest.main()
