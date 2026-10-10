from sidecar.vectors import content_hash, ensure_vectors


class CountingEmbedder:
    def __init__(self):
        self.seen: list[str] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.seen += texts
        return [[float(len(t))] + [0.0] * 383 for t in texts]


class MemoryStore:
    def __init__(self):
        self.rows: dict[str, tuple[str, list[float]]] = {}

    async def vectors(self, ids):
        return {i: self.rows[i] for i in ids if i in self.rows}

    async def put(self, entry_id, content_hash_, vector):
        self.rows[entry_id] = (content_hash_, vector)


async def test_embeds_only_what_is_missing_or_changed():
    store, embedder = MemoryStore(), CountingEmbedder()
    store.rows["same"] = (content_hash("kept"), [9.0] + [0.0] * 383)
    store.rows["edited"] = (content_hash("before"), [9.0] + [0.0] * 383)
    out = await ensure_vectors(store, embedder, {"same": "kept", "edited": "after", "new": "fresh text"})
    assert sorted(embedder.seen) == ["after", "fresh text"]
    assert out["same"][0] == 9.0 and out["edited"][0] == 5.0 and out["new"][0] == 10.0
    assert store.rows["edited"][0] == content_hash("after")


async def test_empty_narratives_are_not_embedded():
    embedder = CountingEmbedder()
    assert await ensure_vectors(MemoryStore(), embedder, {"e": "   ", "f": ""}) == {}
    assert embedder.seen == []


def test_the_hash_names_the_model_that_made_the_vector():
    # A new embedding model must not reuse an old model's vectors (M10).
    assert content_hash("same words", "model-a") != content_hash("same words", "model-b")


async def test_a_vector_from_another_model_is_embedded_again():
    store, embedder = MemoryStore(), CountingEmbedder()
    store.rows["e1"] = (content_hash("text", "an-older-model"), [1.0] * 384)
    await ensure_vectors(store, embedder, {"e1": "text"})
    assert embedder.seen == ["text"]
