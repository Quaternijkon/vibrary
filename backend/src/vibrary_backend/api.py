from __future__ import annotations

import asyncio
import contextlib
from pathlib import Path
from typing import Any
import urllib.error
import urllib.request

from fastapi import BackgroundTasks, Body, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .cache import CacheService
from .config import AppPaths, BackendSettings
from .database import Database
from .embedding import FastEmbedEmbeddingProvider
from .indexing import IndexService
from .library import LibraryService
from .pairing import PairingService
from .resolver import ReplicaResolver
from .search import SearchService
from .uploads import UploadService
from .vector_store import InMemoryVectorStore, QdrantVectorStore, VectorStore


DESKTOP_RENDERER_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "file://",
    "null",
]


class PreflightRequest(BaseModel):
    device_id: str
    local_ref_id: str
    file_name: str
    mime_type: str | None = None
    size_bytes: int = Field(ge=0)
    last_modified_at: str | None = None
    quick_fingerprint: str | None = None
    content_sha256: str | None = None


class CompleteUploadRequest(BaseModel):
    content_sha256: str


class SearchRequest(BaseModel):
    device_id: str
    query: str
    search_types: list[str] = Field(default_factory=lambda: ["text", "image"])
    limit: int = Field(default=20, ge=1, le=100)
    filters: dict[str, Any] | None = None


class ResolveRequest(BaseModel):
    device_id: str
    request_context: dict[str, Any] | None = None


class DeviceClaimRequest(BaseModel):
    device_id: str
    device_name: str
    device_type: str = "android"
    pairing_token: str


class WindowsImportRequest(BaseModel):
    paths: list[str]
    device_id: str = "windows-local"


class FolderImportRequest(BaseModel):
    path: str
    device_id: str = "windows-local"


class RefSyncItem(BaseModel):
    asset_id: str
    asset_version_id: str | None = None
    ref_type: str
    local_ref_id: str | None = None
    display_name: str | None = None
    size_bytes: int | None = None
    content_sha256: str | None = None
    permission_status: str = "granted"


class RefSyncRequest(BaseModel):
    refs: list[RefSyncItem]


class Services:
    def __init__(self, settings: BackendSettings | None = None, paths: AppPaths | None = None, vector_store: VectorStore | None = None):
        self.settings = settings or BackendSettings.from_env()
        self.paths = paths or self.settings.paths
        self.db = Database(self.paths.database_path)
        self.db.initialize()
        self.db.upsert_device("windows-local", "Windows", "windows", is_trusted=True)
        self.vector_store = vector_store or self._create_vector_store()
        self.library = LibraryService(self.db, self.paths)
        self.resolver = ReplicaResolver(self.db, self.paths)
        self.indexer = IndexService(self.db, self.paths, self.vector_store)
        self.search = SearchService(self.db, self.paths, self.resolver, self.vector_store)
        self.uploads = UploadService(self.db, self.paths, self.library)
        self.cache = CacheService(self.db, self.paths)
        self.pairing = PairingService(self.db)

    def _create_vector_store(self) -> VectorStore:
        if not self.settings.use_qdrant:
            return InMemoryVectorStore()
        return QdrantVectorStore(
            self.settings.qdrant_url,
            self.settings.qdrant_api_key,
            embedding_provider=FastEmbedEmbeddingProvider(self.paths.models_dir),
        )


async def _request_device_id(request: Request) -> str | None:
    path_parts = request.url.path.strip("/").split("/")
    if len(path_parts) >= 3 and path_parts[0] == "v1" and path_parts[1] == "devices":
        return path_parts[2]
    query_device_id = request.query_params.get("device_id")
    if query_device_id:
        return query_device_id
    try:
        payload = await request.json()
    except Exception:
        return None
    if isinstance(payload, dict):
        value = payload.get("device_id")
        if isinstance(value, str):
            return value
    return None


def create_app(paths: AppPaths | None = None, settings: BackendSettings | None = None, vector_store: VectorStore | None = None) -> FastAPI:
    services = Services(settings=settings, paths=paths, vector_store=vector_store)
    app = FastAPI(title="Vibrary Backend", version="0.1.4")
    app.state.services = services
    app.add_middleware(
        CORSMiddleware,
        allow_origins=DESKTOP_RENDERER_ORIGINS,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "api-key"],
    )

    @app.middleware("http")
    async def require_auth_for_lan(request: Request, call_next):
        client_host = request.client.host if request.client else ""
        is_local_client = client_host in {"127.0.0.1", "::1", "localhost"}
        if request.url.path in {"/v1/health", "/v1/pairing/claim"}:
            return await call_next(request)
        if request.url.path == "/v1/pairing/qr":
            if not is_local_client:
                return JSONResponse({"detail": "pairing QR is local-only"}, status_code=403)
            return await call_next(request)
        if request.url.path.startswith("/v1/imports/windows") and not is_local_client:
            return JSONResponse({"detail": "Windows import is local-only"}, status_code=403)
        if is_local_client:
            return await call_next(request)
        authorization = request.headers.get("authorization", "")
        prefix = "Bearer "
        if not authorization.startswith(prefix):
            return JSONResponse({"detail": "missing bearer token"}, status_code=401)
        authenticated_device_id = services.pairing.validate_bearer_token(authorization[len(prefix) :])
        if authenticated_device_id is None:
            return JSONResponse({"detail": "invalid bearer token"}, status_code=403)
        body_device = await _request_device_id(request)
        path_device = request.path_params.get("device_id")
        requested_device_id = path_device or body_device
        if _requires_remote_device_binding(request.url.path) and not requested_device_id:
            return JSONResponse({"detail": "device_id is required"}, status_code=403)
        if requested_device_id and requested_device_id != authenticated_device_id:
            return JSONResponse({"detail": "token/device mismatch"}, status_code=403)
        return await call_next(request)

    @app.on_event("shutdown")
    async def close_database() -> None:
        task = getattr(app.state, "auto_index_task", None)
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        services.db.close()

    @app.on_event("startup")
    async def start_auto_indexer() -> None:
        if services.settings.auto_index:
            app.state.auto_index_task = asyncio.create_task(_auto_index_loop(services))

    @app.get("/v1/health")
    def health() -> dict[str, Any]:
        return {
            "ok": True,
            "schema_version": services.db.scalar("SELECT schema_version FROM schema_info ORDER BY applied_at DESC LIMIT 1"),
            "qdrant": {"url": services.settings.qdrant_url, "exposed_to_lan": False},
            "public_url": services.settings.public_url,
            "auto_index": services.settings.auto_index,
        }

    @app.get("/v1/devices")
    def devices() -> list[dict[str, Any]]:
        return [dict(row) for row in services.db.query("SELECT * FROM devices ORDER BY device_name")]

    @app.delete("/v1/devices/{device_id}")
    def delete_device(device_id: str) -> dict[str, Any]:
        if device_id == "windows-local":
            raise HTTPException(status_code=400, detail="cannot revoke local Windows device")
        return {"device_id": device_id, "revoked": services.pairing.revoke_device(device_id)}

    @app.get("/v1/pairing/qr")
    def pairing_qr() -> dict[str, str]:
        payload = services.pairing.create_pairing_payload(services.settings.public_url)
        return payload.__dict__

    @app.post("/v1/pairing/claim")
    def pairing_claim(request: DeviceClaimRequest) -> dict[str, object]:
        try:
            token = services.pairing.claim_device(
                request.pairing_token,
                request.device_id,
                request.device_name,
                request.device_type,
            )
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return {"trusted": True, "device_token": token}

    @app.post("/v1/uploads/preflight")
    def upload_preflight(request: PreflightRequest) -> dict[str, Any]:
        try:
            result = services.uploads.preflight(**request.model_dump(exclude={"last_modified_at"}))
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return result.__dict__

    @app.put("/v1/uploads/{upload_id}/chunks/{chunk_index}")
    def upload_chunk(
        upload_id: str,
        chunk_index: int,
        chunk_sha256: str | None = None,
        body: bytes = Body(..., media_type="application/octet-stream"),
    ) -> dict[str, Any]:
        try:
            services.uploads.accept_chunk(upload_id, chunk_index, body, expected_sha256=chunk_sha256)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"upload_id": upload_id, "chunk_index": chunk_index, "status": "received"}

    @app.get("/v1/uploads/{upload_id}/status")
    def upload_status(upload_id: str) -> dict[str, Any]:
        try:
            return services.uploads.status(upload_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/v1/uploads/{upload_id}/complete")
    def upload_complete(upload_id: str, request: CompleteUploadRequest) -> dict[str, Any]:
        try:
            return services.uploads.complete(upload_id, request.content_sha256).__dict__
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/v1/uploads/{upload_id}/cancel")
    def upload_cancel(upload_id: str) -> dict[str, str]:
        services.db.execute("UPDATE upload_jobs SET status = 'cancelled' WHERE upload_id = ?", (upload_id,))
        return {"status": "cancelled"}

    @app.post("/v1/imports/windows/files")
    def import_windows_files(request: WindowsImportRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
        totals: dict[str, Any] = {"scanned_count": 0, "imported_count": 0, "duplicate_count": 0, "failed_count": 0, "index_queued_count": 0, "assets": []}
        for raw in request.paths:
            result = services.library.import_path(Path(raw), "windows-local")
            totals["scanned_count"] += result.scanned_count
            totals["imported_count"] += result.imported_count
            totals["duplicate_count"] += result.duplicate_count
            totals["failed_count"] += result.failed_count
            totals["index_queued_count"] += result.index_queued_count
            totals["assets"].extend(asset.__dict__ | {"library_path": str(asset.library_path)} for asset in result.assets)
        _schedule_indexing_kick(background_tasks, services, int(totals["index_queued_count"]))
        return totals

    @app.post("/v1/imports/windows/folder")
    def import_windows_folder(request: FolderImportRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
        result = services.library.import_path(Path(request.path), "windows-local")
        _schedule_indexing_kick(background_tasks, services, result.index_queued_count)
        return result.__dict__ | {"assets": [asset.__dict__ | {"library_path": str(asset.library_path)} for asset in result.assets]}

    @app.get("/v1/imports/{import_id}/status")
    def import_status(import_id: str) -> dict[str, str]:
        return {"import_id": import_id, "status": "completed"}

    @app.post("/v1/imports/{import_id}/cancel")
    def import_cancel(import_id: str) -> dict[str, str]:
        return {"import_id": import_id, "status": "cancelled"}

    @app.post("/v1/search")
    def search(request: SearchRequest) -> dict[str, Any]:
        return services.search.search(
            device_id=request.device_id,
            query=request.query,
            search_types=request.search_types,
            limit=request.limit,
            filters=request.filters,
        )

    @app.post("/v1/assets/{asset_id}/resolve")
    def resolve(asset_id: str, request: ResolveRequest) -> dict[str, Any]:
        try:
            return services.resolver.resolve(asset_id, request.device_id).__dict__
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/v1/assets/{asset_id}/content")
    def asset_content(asset_id: str) -> FileResponse:
        row = services.db.one("SELECT relative_path FROM library_files WHERE asset_id = ? AND exists_flag = 1", (asset_id,))
        if row is None:
            raise HTTPException(status_code=404, detail="asset has no library copy")
        path = services.paths.resolve_data_path(str(row["relative_path"]))
        if not path.exists():
            raise HTTPException(status_code=404, detail="library file missing")
        return FileResponse(path)

    @app.get("/v1/assets/{asset_id}/thumbnail")
    def asset_thumbnail(asset_id: str) -> dict[str, str]:
        raise HTTPException(status_code=404, detail="thumbnail not generated")

    @app.get("/v1/assets/{asset_id}/preview")
    def asset_preview(asset_id: str) -> dict[str, str]:
        raise HTTPException(status_code=404, detail="preview not generated")

    @app.post("/v1/devices/{device_id}/refs/sync")
    def refs_sync(device_id: str, request: RefSyncRequest) -> dict[str, int]:
        count = 0
        for ref in request.refs:
            services.db.add_device_asset_ref(device_id=device_id, **ref.model_dump())
            count += 1
        return {"accepted_count": count}

    @app.post("/v1/devices/{device_id}/refs/{ref_id}/permission-revoked")
    def permission_revoked(device_id: str, ref_id: str) -> dict[str, str]:
        services.resolver.mark_permission_revoked(device_id, ref_id)
        return {"ref_id": ref_id, "permission_status": "revoked"}

    @app.post("/v1/devices/{device_id}/refs/{ref_id}/verified")
    def permission_verified(device_id: str, ref_id: str) -> dict[str, str]:
        services.db.execute(
            "UPDATE device_asset_refs SET permission_status = 'granted', is_available = 1 WHERE device_id = ? AND ref_id = ?",
            (device_id, ref_id),
        )
        return {"ref_id": ref_id, "permission_status": "granted"}

    @app.get("/v1/queues/uploads")
    def uploads_queue() -> list[dict[str, Any]]:
        return [dict(row) for row in services.db.query("SELECT * FROM upload_jobs ORDER BY created_at DESC")]

    @app.get("/v1/queues/indexing")
    def indexing_queue() -> list[dict[str, Any]]:
        return [dict(row) for row in services.db.query("SELECT * FROM index_jobs ORDER BY priority ASC, created_at DESC")]

    @app.post("/v1/queues/indexing/process")
    def process_indexing(limit: int = 10) -> dict[str, int]:
        return services.indexer.process_next(limit).__dict__

    @app.get("/v1/assets/{asset_id}/status")
    def asset_status(asset_id: str) -> dict[str, Any]:
        row = services.db.one("SELECT * FROM assets WHERE asset_id = ?", (asset_id,))
        if row is None:
            raise HTTPException(status_code=404, detail="asset not found")
        return dict(row)

    @app.get("/v1/cache/summary")
    def cache_summary() -> dict[str, int]:
        return services.cache.summary()

    def clear_cache(cache_type: str) -> dict[str, int]:
        return services.cache.clear(cache_type).__dict__

    @app.delete("/v1/cache/thumbnails")
    def clear_thumbnails() -> dict[str, int]:
        return clear_cache("thumbnail")

    @app.delete("/v1/cache/previews")
    def clear_previews() -> dict[str, int]:
        return clear_cache("preview")

    @app.delete("/v1/cache/downloads")
    def clear_downloads() -> dict[str, int]:
        return clear_cache("downloaded_file")

    @app.delete("/v1/cache/temp")
    def clear_temp() -> dict[str, int]:
        upload = services.cache.clear("upload_temp")
        parse = services.cache.clear("parse_temp")
        return {
            "deleted_files": upload.deleted_files + parse.deleted_files,
            "deleted_bytes": upload.deleted_bytes + parse.deleted_bytes,
            "skipped_files": upload.skipped_files + parse.skipped_files,
        }

    return app


def _requires_remote_device_binding(path: str) -> bool:
    return path.startswith("/v1/assets/") and path.endswith("/content")


def _schedule_indexing_kick(background_tasks: BackgroundTasks, services: Services, queued_count: int) -> None:
    if queued_count <= 0 or not services.settings.auto_index:
        return
    background_tasks.add_task(_process_index_queue_once, services)


def _process_index_queue_once(services: Services) -> None:
    if _vector_store_ready(services):
        services.indexer.process_next(5)


async def _auto_index_loop(services: Services) -> None:
    while True:
        if not await asyncio.to_thread(_vector_store_ready, services):
            await asyncio.sleep(1.0)
            continue
        result = await asyncio.to_thread(services.indexer.process_next, 2)
        await asyncio.sleep(0.5 if result.indexed_count or result.failed_count else 2.0)


def _vector_store_ready(services: Services) -> bool:
    if not services.settings.use_qdrant:
        return True
    request = urllib.request.Request(
        f"{services.settings.qdrant_url}/collections",
        method="GET",
        headers={"api-key": services.settings.qdrant_api_key},
    )
    try:
        with urllib.request.urlopen(request, timeout=2) as response:
            return 200 <= response.status < 300
    except (OSError, urllib.error.URLError):
        return False
