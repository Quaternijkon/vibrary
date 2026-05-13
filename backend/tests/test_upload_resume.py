import hashlib
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vibrary_backend.config import AppPaths
from vibrary_backend.database import Database
from vibrary_backend.library import LibraryService
from vibrary_backend.uploads import UploadService


class UploadResumeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.paths = AppPaths.from_root(Path(self.temp.name))
        self.db = Database(self.paths.database_path)
        self.db.initialize()
        self.db.upsert_device("windows-local", "Windows", "windows", is_trusted=True)
        self.db.upsert_device("android-1", "Phone", "android", is_trusted=True)
        self.library = LibraryService(self.db, self.paths)
        self.uploads = UploadService(self.db, self.paths, self.library)

    def tearDown(self) -> None:
        self.db.close()
        self.temp.cleanup()

    def test_preflight_returns_already_exists_when_hash_is_known(self) -> None:
        source = self.paths.root / "existing.txt"
        source.write_text("already here", encoding="utf-8")
        imported = self.library.import_path(source, "windows-local")

        preflight = self.uploads.preflight(
            device_id="android-1",
            local_ref_id="local-existing",
            file_name="existing.txt",
            mime_type="text/plain",
            size_bytes=source.stat().st_size,
            quick_fingerprint="existing",
            content_sha256=imported.assets[0].content_sha256,
        )

        self.assertEqual(preflight.decision, "already_exists")
        self.assertEqual(preflight.existing_asset_id, imported.assets[0].asset_id)

    def test_preflight_reuses_incomplete_upload_and_reports_received_chunks(self) -> None:
        first = self.uploads.preflight(
            device_id="android-1",
            local_ref_id="resume-local",
            file_name="resume.txt",
            mime_type="text/plain",
            size_bytes=11,
            quick_fingerprint="resume",
            content_sha256=None,
        )
        self.uploads.accept_chunk(first.upload_id, 0, b"hello ", expected_sha256=hashlib.sha256(b"hello ").hexdigest())

        second = self.uploads.preflight(
            device_id="android-1",
            local_ref_id="resume-local",
            file_name="resume.txt",
            mime_type="text/plain",
            size_bytes=11,
            quick_fingerprint="resume",
            content_sha256=None,
        )

        self.assertEqual(second.upload_id, first.upload_id)
        self.assertEqual(second.received_chunks, [0])
        self.assertEqual(second.bytes_received, 6)

    def test_chunk_hash_mismatch_is_rejected(self) -> None:
        preflight = self.uploads.preflight(
            device_id="android-1",
            local_ref_id="bad-chunk",
            file_name="bad.txt",
            mime_type="text/plain",
            size_bytes=3,
            quick_fingerprint="bad",
            content_sha256=None,
        )

        with self.assertRaises(ValueError):
            self.uploads.accept_chunk(preflight.upload_id, 0, b"bad", expected_sha256="not-the-hash")

    def test_oversized_chunk_is_rejected_without_persisting_state(self) -> None:
        preflight = self.uploads.preflight(
            device_id="android-1",
            local_ref_id="too-big",
            file_name="too-big.txt",
            mime_type="text/plain",
            size_bytes=3,
            quick_fingerprint="too-big",
            content_sha256=None,
        )

        with self.assertRaises(ValueError):
            self.uploads.accept_chunk(preflight.upload_id, 0, b"four", expected_sha256=hashlib.sha256(b"four").hexdigest())

        self.assertEqual(self.db.scalar("SELECT COUNT(*) FROM upload_chunks WHERE upload_id = ?", (preflight.upload_id,)), 0)
        self.assertEqual(self.uploads.status(preflight.upload_id)["bytes_received"], 0)

    def test_complete_sanitizes_uploaded_file_name_before_assembling(self) -> None:
        content = b"safe content"
        content_sha = hashlib.sha256(content).hexdigest()
        preflight = self.uploads.preflight(
            device_id="android-1",
            local_ref_id="path-name",
            file_name="../escape.txt",
            mime_type="text/plain",
            size_bytes=len(content),
            quick_fingerprint="path-name",
            content_sha256=None,
        )

        self.uploads.accept_chunk(preflight.upload_id, 0, content, expected_sha256=content_sha)
        completed = self.uploads.complete(preflight.upload_id, content_sha256=content_sha)

        self.assertFalse((self.paths.upload_temp_dir / "escape.txt").exists())
        self.assertEqual(
            self.db.scalar("SELECT original_name FROM assets WHERE asset_id = ?", (completed.asset_id,)),
            "escape.txt",
        )


if __name__ == "__main__":
    unittest.main()
