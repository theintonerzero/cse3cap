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


async def test_five_holders_at_once_never_starve_the_pool(db):
    # The pool holds five connections. A lock that kept one for its whole block
    # left five holders each waiting for a sixth, and every AI feature hung
    # (CAP-67 review, finding 1). Holders on five gigs read the cache inside it.
    import asyncio

    cache = ThemeCache(db)
    day = date(2026, 10, 9)

    async def hold(n):
        async with cache.lock(f"g{n}", day):
            return await cache.get(f"g{n}", day)

    assert await asyncio.wait_for(asyncio.gather(*(hold(n) for n in range(6))), timeout=5) == [None] * 6


def test_expired_failures_are_forgotten():
    cache = ThemeCache(None)
    day = date(2026, 10, 9)
    cache._failed[("g1", day)] = -10_000.0  # long ago
    assert not cache.recently_failed("g1", day)
    assert ("g1", day) not in cache._failed
