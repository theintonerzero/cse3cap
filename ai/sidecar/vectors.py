import asyncio
import hashlib

from .embedder import Embedder


def content_hash(text: str, model: str = "") -> str:
    """The narrative and the model that embedded it: a vector from another model
    is stale even when the words are the same (core review M10)."""
    return hashlib.sha256(f"{model}\n{text}".encode()).hexdigest()


async def ensure_vectors(store, embedder: Embedder, entries: dict[str, str]) -> dict[str, list[float]]:
    """entry_id -> vector for these entries' narratives, embedding lazily.

    Only a narrative with no stored vector, or one stored under another hash
    because it was edited, is embedded now. Nothing is indexed in the
    background. Empty narratives have nothing to embed and are left out."""
    model = getattr(embedder, "MODEL", "")
    texts = {entry_id: text for entry_id, text in entries.items() if text and text.strip()}
    stored = await store.vectors(list(texts))
    stale = [entry_id for entry_id, text in texts.items() if stored.get(entry_id, ("", []))[0] != content_hash(text, model)]
    fresh = await asyncio.to_thread(embedder.embed, [texts[entry_id] for entry_id in stale]) if stale else []
    for entry_id, vector in zip(stale, fresh):
        await store.put(entry_id, content_hash(texts[entry_id], model), vector)
    kept = {entry_id: stored[entry_id][1] for entry_id in texts if entry_id not in stale}
    return kept | dict(zip(stale, fresh))
