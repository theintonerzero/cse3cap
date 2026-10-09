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
