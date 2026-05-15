import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vibrary_backend.config import BackendSettings
from vibrary_backend.pipeline import (
    JINA_OMNI_SMALL_MODEL,
    JINA_OMNI_SMALL_PROFILE,
    PipelineConfig,
    RetrievalMode,
)


class PipelineConfigTests(unittest.TestCase):
    def test_backend_settings_default_to_jina_hnsw_pipeline(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"VIBRARY_DATA_DIR": temp_dir}, clear=False):
                settings = BackendSettings.from_env()

        self.assertEqual(settings.pipeline.embedding.provider_id, "jina-v5-omni-small")
        self.assertEqual(settings.pipeline.embedding.profile_id, JINA_OMNI_SMALL_PROFILE)
        self.assertEqual(settings.pipeline.embedding.model_name, JINA_OMNI_SMALL_MODEL)
        self.assertEqual(settings.pipeline.embedding.dimension, 1024)
        self.assertEqual(settings.pipeline.retrieval.mode, RetrievalMode.HNSW)
        self.assertEqual(settings.pipeline.collections.text, "text_chunks_jina_v5_omni_small_v1")

    def test_backend_settings_read_pipeline_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            env = {
                "VIBRARY_DATA_DIR": temp_dir,
                "VIBRARY_RETRIEVAL_MODE": "full_scan",
                "VIBRARY_QDRANT_HNSW_M": "24",
                "VIBRARY_QDRANT_HNSW_EF_CONSTRUCT": "180",
                "VIBRARY_QDRANT_HNSW_FULL_SCAN_THRESHOLD": "640",
                "VIBRARY_QDRANT_HNSW_SEARCH_EF": "96",
            }
            with patch.dict(os.environ, env, clear=False):
                settings = BackendSettings.from_env()

        self.assertEqual(settings.pipeline.retrieval.mode, RetrievalMode.FULL_SCAN)
        self.assertEqual(settings.pipeline.retrieval.hnsw.m, 24)
        self.assertEqual(settings.pipeline.retrieval.hnsw.ef_construct, 180)
        self.assertEqual(settings.pipeline.retrieval.hnsw.full_scan_threshold, 640)
        self.assertEqual(settings.pipeline.retrieval.hnsw.search_ef, 96)

    def test_pipeline_options_leave_extension_points_visible(self) -> None:
        options = PipelineConfig.default().options_payload()

        self.assertEqual(options["embedding_providers"][0]["id"], "jina-v5-omni-small")
        self.assertEqual(options["retrieval_modes"], ["hnsw", "full_scan"])


if __name__ == "__main__":
    unittest.main()
