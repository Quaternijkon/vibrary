# Qdrant Pipeline Configuration Design

## Goal

Vibrary must make the retrieval pipeline transparent and user-controllable without moving core retrieval away from Qdrant. The Windows backend remains the only place that embeds content, builds Qdrant collections, and executes vector search. Desktop settings only persist user choices and restart the backend with those choices.

## Pipeline Shape

The backend owns a `PipelineConfig` with three explicit stages:

- Embedding stage: active provider is `jina-v5-omni-small`, backed by `jinaai/jina-embeddings-v5-omni-small`. The extension point is a provider registry, so later models can be added without changing indexing/search services.
- Index stage: Qdrant collection names are derived from the embedding profile. Jina uses new 1024-dimensional collections so it does not conflict with older FastEmbed collection dimensions.
- Retrieval stage: Qdrant query params choose either HNSW approximate search or exact full-scan traversal. Full-scan is implemented by Qdrant `params.exact=true`, not by a local SQLite or Python scan.

## User Controls

The desktop Settings page shows:

- Embedding provider selection. For this iteration only Jina is selectable.
- Retrieval mode: HNSW or exact traversal.
- HNSW parameters: `m`, `ef_construct`, `full_scan_threshold`, and query-time `hnsw_ef`.
- Active profile, model, vector dimension, collection names, and current index counts.
- Manual actions to process the index queue and rebuild all active indexes.

## Qdrant Behavior

For each active collection, the backend creates a dense cosine-vector collection with the active profile dimension and HNSW config. On existing collections, it updates HNSW config before first use. Payload indexes are still created for fields used by filters and diagnostics.

Search always calls Qdrant Query API:

- HNSW mode sends query vector plus `params.hnsw_ef`.
- Exact traversal mode sends query vector plus `params.exact=true`.

## Rebuild

Rebuild clears active SQL point/document records, drops active Qdrant collections when supported by the vector store, resets asset index status, and queues one fresh index job for every active asset. Old inactive collections are left alone so existing data is not destroyed unexpectedly.

## Tests

Backend tests cover environment parsing, profile registration, collection HNSW payloads, Qdrant query params, and rebuild queueing. Desktop tests cover persisted settings normalization and backend sidecar environment propagation.
