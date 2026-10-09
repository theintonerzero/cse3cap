from datetime import date

import pytest

from sidecar.themes import ThemeCache

pytestmark = pytest.mark.db


async def test_a_day_is_cached_per_gig(db):
    cache = ThemeCache(db)
    day = date(2026, 10, 9)
    assert await cache.get("g1", day) is None
    await cache.put("g1", day, ["Blockers raised late"])
    assert await cache.get("g1", day) == ["Blockers raised late"]
    assert await cache.get("g1", date(2026, 10, 10)) is None
    assert await cache.get("g2", day) is None


async def test_the_lock_lets_one_holder_in_at_a_time(db):
    import asyncio

    cache = ThemeCache(db)
    day = date(2026, 10, 9)
    order = []

    async def hold(name):
        async with cache.lock("g1", day):
            order.append(f"{name} in")
            await asyncio.sleep(0.2)
            order.append(f"{name} out")

    await asyncio.gather(hold("a"), hold("b"))
    assert order in (["a in", "a out", "b in", "b out"], ["b in", "b out", "a in", "a out"])


def test_a_failure_is_remembered_for_a_while():
    cache = ThemeCache(None)
    day = date(2026, 10, 9)
    assert not cache.recently_failed("g1", day)
    cache.failed("g1", day)
    assert cache.recently_failed("g1", day) and not cache.recently_failed("g2", day)
