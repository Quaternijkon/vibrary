from __future__ import annotations

import os
import socket
from dataclasses import dataclass
from pathlib import Path


PRODUCT_NAME = "Vibrary"
SCHEMA_VERSION = "v1"
TEXT_COLLECTION = "text_chunks_v1"
IMAGE_COLLECTION = "image_semantic_v1"
DEFAULT_EMBEDDING_PROFILE = "text-mini-multilingual-v1"
DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024


@dataclass(frozen=True)
class AppPaths:
    root: Path
    config_dir: Path
    data_dir: Path
    database_path: Path
    library_dir: Path
    library_files_dir: Path
    cache_dir: Path
    thumbnails_cache_dir: Path
    previews_cache_dir: Path
    downloads_cache_dir: Path
    upload_temp_dir: Path
    parse_temp_dir: Path
    qdrant_storage_dir: Path
    models_dir: Path
    logs_dir: Path

    @classmethod
    def from_root(cls, root: os.PathLike[str] | str) -> "AppPaths":
        root_path = Path(root).resolve()
        data_dir = root_path / "data"
        cache_dir = data_dir / "cache"
        paths = cls(
            root=root_path,
            config_dir=root_path / "config",
            data_dir=data_dir,
            database_path=data_dir / "app.sqlite",
            library_dir=data_dir / "library",
            library_files_dir=data_dir / "library" / "files",
            cache_dir=cache_dir,
            thumbnails_cache_dir=cache_dir / "thumbnails",
            previews_cache_dir=cache_dir / "previews",
            downloads_cache_dir=cache_dir / "downloads",
            upload_temp_dir=cache_dir / "upload-temp",
            parse_temp_dir=cache_dir / "parse-temp",
            qdrant_storage_dir=data_dir / "qdrant" / "storage",
            models_dir=data_dir / "models" / "fastembed",
            logs_dir=data_dir / "logs",
        )
        paths.ensure()
        return paths

    @classmethod
    def default(cls, product_name: str = PRODUCT_NAME, app_dir: os.PathLike[str] | str | None = None) -> "AppPaths":
        env_root = os.environ.get("VIBRARY_DATA_DIR")
        if env_root:
            return cls.from_root(env_root)
        base_dir = Path(app_dir).resolve() if app_dir else Path.cwd()
        if (base_dir / "portable.flag").exists():
            return cls.from_root(base_dir / "portable-data")
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            return cls.from_root(Path(local_app_data) / product_name)
        return cls.from_root(Path.home() / f".{product_name.lower()}")

    def ensure(self) -> None:
        for directory in [
            self.config_dir,
            self.data_dir,
            self.library_files_dir,
            self.thumbnails_cache_dir,
            self.previews_cache_dir,
            self.downloads_cache_dir,
            self.upload_temp_dir,
            self.parse_temp_dir,
            self.qdrant_storage_dir,
            self.models_dir,
            self.logs_dir,
        ]:
            directory.mkdir(parents=True, exist_ok=True)

    def relative_to_data(self, path: os.PathLike[str] | str) -> str:
        resolved = Path(path).resolve()
        try:
            return resolved.relative_to(self.data_dir).as_posix()
        except ValueError as exc:
            raise ValueError(f"path must be inside data directory: {resolved}") from exc

    def resolve_data_path(self, relative_path: str) -> Path:
        target = (self.data_dir / relative_path).resolve()
        data_root = self.data_dir.resolve()
        if data_root != target and data_root not in target.parents:
            raise ValueError(f"relative path escapes data directory: {relative_path}")
        return target


@dataclass(frozen=True)
class BackendSettings:
    paths: AppPaths
    backend_host: str
    backend_port: int
    public_url: str
    qdrant_url: str
    qdrant_api_key: str
    use_qdrant: bool

    @classmethod
    def from_env(cls) -> "BackendSettings":
        host = os.environ.get("VIBRARY_BACKEND_HOST", "127.0.0.1")
        port = int(os.environ.get("VIBRARY_BACKEND_PORT", "8765"))
        public_url = os.environ.get("VIBRARY_PUBLIC_URL") or _infer_public_url(host, port)
        return cls(
            paths=AppPaths.default(),
            backend_host=host,
            backend_port=port,
            public_url=public_url,
            qdrant_url=os.environ.get("VIBRARY_QDRANT_URL", "http://127.0.0.1:6333"),
            qdrant_api_key=os.environ.get("VIBRARY_QDRANT_API_KEY", "dev-local-qdrant-key"),
            use_qdrant=os.environ.get("VIBRARY_USE_QDRANT", "1") != "0",
        )


def _infer_public_url(host: str, port: int) -> str:
    if host not in {"0.0.0.0", "::"}:
        return f"http://{host}:{port}"
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            lan_ip = sock.getsockname()[0]
    except OSError:
        lan_ip = "127.0.0.1"
    return f"http://{lan_ip}:{port}"
