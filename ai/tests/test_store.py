import pytest

from sidecar.store import VectorStore

pytestmark = pytest.mark.db


async def test_vectors_returns_only_the_ids_asked_for(db):
    store = VectorStore(db)
    await store.put("mine", "h1", [0.1] * 384)
    await store.put("theirs", "h2", [0.2] * 384)
    found = await store.vectors(["mine", "absent"])
    assert set(found) == {"mine"}
    assert found["mine"][0] == "h1" and len(found["mine"][1]) == 384


async def test_put_replaces_a_changed_narratives_vector(db):
    store = VectorStore(db)
    await store.put("e", "old", [0.1] * 384)
    await store.put("e", "new", [0.3] * 384)
    assert (await store.vectors(["e"]))["e"][0] == "new"


async def test_no_ids_is_no_query(db):
    assert await VectorStore(db).vectors([]) == {}
