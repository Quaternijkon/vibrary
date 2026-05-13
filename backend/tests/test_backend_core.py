import hashlib
import os
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
from vibrary_backend.uploads import UploadService
from vibrary_backend.vector_store import InMemoryVectorStore


class BackendCoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.paths = AppPaths.from_root(self.root)
        self.db = Database(self.paths.database_path)
        self.db.initialize()
        self.vector_store = InMemoryVectorStore()
        self.library = LibraryService(self.db, self.paths)
        self.resolver = ReplicaResolver(self.db, self.paths)
        self.indexer = IndexService(self.db, self.paths, self.vector_store)
        self.search = SearchService(self.db, self.paths, self.resolver, self.vector_store)
        self.uploads = UploadService(self.db, self.paths, self.library)
        self.cache = CacheService(self.db, self.paths)
        self.db.upsert_device("windows-local", "Windows", "windows", is_trusted=True)
        self.db.upsert_device("android-1", "Phone", "android", is_trusted=True)

    def tearDown(self) -> None:
        self.db.close()
        self.temp.cleanup()

    def write_file(self, relative: str, content: bytes) -> Path:
        path = self.root / "fixtures" / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def test_windows_import_copies_to_library_and_dedupes_by_sha256(self) -> None:
        source = self.write_file("notes.txt", b"red car document\n")
        duplicate = self.write_file("copy.md", b"red car document\n")

        first = self.library.import_path(source, device_id="windows-local")
        second = self.library.import_path(duplicate, device_id="windows-local")

        expected_sha = hashlib.sha256(b"red car document\n").hexdigest()
        library_path = self.paths.library_files_dir / expected_sha[:2] / f"{expected_sha}.txt"

        self.assertEqual(first.scanned_count, 1)
        self.assertEqual(first.imported_count, 1)
        self.assertEqual(first.duplicate_count, 0)
        self.assertEqual(first.index_queued_count, 1)
        self.assertEqual(second.imported_count, 0)
        self.assertEqual(second.duplicate_count, 1)
        self.assertEqual(self.db.scalar("SELECT COUNT(*) FROM assets"), 1)
        self.assertEqual(self.db.scalar("SELECT COUNT(*) FROM index_jobs"), 1)
        self.assertTrue(library_path.exists())
        self.assertEqual(library_path.read_bytes(), b"red car document\n")

    def test_resumable_upload_complete_imports_asset_and_is_idempotent(self) -> None:
        content = b"chunk-one::chunk-two"
        content_sha = hashlib.sha256(content).hexdigest()

        preflight = self.uploads.preflight(
            device_id="android-1",
            local_ref_id="local-77",
            file_name="upload.txt",
            mime_type="text/plain",
            size_bytes=len(content),
            quick_fingerprint="upload.txt:size",
        )
        self.assertEqual(preflight.decision, "upload_required")

        self.uploads.accept_chunk(preflight.upload_id, 0, content[:10])
        self.uploads.accept_chunk(preflight.upload_id, 1, content[10:])
        completed = self.uploads.complete(preflight.upload_id, content_sha256=content_sha)
        completed_again = self.uploads.complete(preflight.upload_id, content_sha256=content_sha)

        self.assertEqual(completed.asset_id, completed_again.asset_id)
        self.assertEqual(completed.status, "server_imported")
        self.assertEqual(self.db.scalar("SELECT COUNT(*) FROM assets"), 1)
        self.assertEqual(self.db.scalar("SELECT status FROM upload_jobs WHERE upload_id = ?", (preflight.upload_id,)), "server_imported")
        self.assertEqual(self.db.scalar("SELECT COUNT(*) FROM index_jobs"), 1)

    def test_resolver_prefers_android_local_original_and_falls_back_after_revocation(self) -> None:
        imported = self.library.import_path(self.write_file("phone.txt", b"local copy wins"), device_id="windows-local")
        asset_id = imported.assets[0].asset_id
        version_id = imported.assets[0].asset_version_id

        ref_id = self.db.add_device_asset_ref(
            device_id="android-1",
            asset_id=asset_id,
            asset_version_id=version_id,
            ref_type="source_original",
            local_ref_id="android-local-alias",
            display_name="phone.txt",
            size_bytes=len(b"local copy wins"),
            content_sha256=imported.assets[0].content_sha256,
            permission_status="granted",
        )

        local = self.resolver.resolve(asset_id, "android-1")
        self.assertEqual(local.delivery["mode"], "local_reference")
        self.assertEqual(local.delivery["local_ref_id"], "android-local-alias")
        self.assertEqual(local.delivery["ref_id"], ref_id)
        self.assertEqual(local.availability["requesting_device"]["recommended_action"], "open_local")
        self.assertIsNone(local.delivery["download_url"])

        self.resolver.mark_permission_revoked("android-1", ref_id)
        fallback = self.resolver.resolve(asset_id, "android-1")
        self.assertEqual(fallback.delivery["mode"], "download_to_cache")
        self.assertEqual(fallback.availability["requesting_device"]["recommended_action"], "download")

    def test_cache_cleanup_deletes_only_app_cache_not_library_or_source_originals(self) -> None:
        source = self.write_file("keep/source.txt", b"do not delete")
        imported = self.library.import_path(source, device_id="windows-local")
        asset_id = imported.assets[0].asset_id
        self.db.add_device_asset_ref(
            device_id="android-1",
            asset_id=asset_id,
            asset_version_id=imported.assets[0].asset_version_id,
            ref_type="source_original",
            local_ref_id="android-source-alias",
            display_name="source.txt",
            size_bytes=source.stat().st_size,
            content_sha256=imported.assets[0].content_sha256,
            permission_status="granted",
        )
        cache_file = self.paths.downloads_cache_dir / asset_id / "source.txt"
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_bytes(b"cached")
        self.db.add_cache_entry("android-1", asset_id, "downloaded_file", cache_file, cache_file.stat().st_size)

        cleared = self.cache.clear("downloaded_file")

        library_rel = self.db.scalar("SELECT relative_path FROM library_files WHERE asset_id = ?", (asset_id,))
        self.assertEqual(cleared.deleted_files, 1)
        self.assertFalse(cache_file.exists())
        self.assertTrue((self.paths.data_dir / library_rel).exists())
        self.assertTrue(source.exists())
        self.assertEqual(self.db.scalar("SELECT COUNT(*) FROM device_asset_refs WHERE ref_type = 'source_original'"), 1)

    def test_indexed_search_returns_source_aware_delivery_policy(self) -> None:
        imported = self.library.import_path(self.write_file("cars.txt", b"red car and blue truck"), device_id="windows-local")
        processed = self.indexer.process_next(limit=5)
        self.assertEqual(processed.indexed_count, 1)

        result = self.search.search(device_id="android-1", query="red car", limit=5)
        self.assertEqual(len(result["results"]), 1)
        self.assertEqual(result["results"][0]["asset_id"], imported.assets[0].asset_id)
        self.assertEqual(result["results"][0]["delivery"]["mode"], "download_to_cache")

        self.db.add_device_asset_ref(
            device_id="android-1",
            asset_id=imported.assets[0].asset_id,
            asset_version_id=imported.assets[0].asset_version_id,
            ref_type="source_original",
            local_ref_id="already-here",
            display_name="cars.txt",
            size_bytes=23,
            content_sha256=imported.assets[0].content_sha256,
            permission_status="granted",
        )
        local_result = self.search.search(device_id="android-1", query="red car", limit=5)
        self.assertEqual(local_result["results"][0]["delivery"]["mode"], "local_reference")


if __name__ == "__main__":
    unittest.main()
