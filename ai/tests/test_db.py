import ssl
from pathlib import Path

import pytest

from sidecar import db

ROOTS = Path(__file__).parents[2] / "db" / "letsencrypt-roots.pem"


@pytest.fixture
def created(monkeypatch):
    seen = {}

    async def fake_create_pool(**kwargs):
        seen.update(kwargs)
        return "pool"

    monkeypatch.setattr(db.aiomysql, "create_pool", fake_create_pool)
    return seen


async def test_with_a_ca_the_connection_is_tls_and_checks_the_name(created):
    # As the API does (MYSQL_ATTR_SSL_CA): the certificate's name is verified.
    await db.connect("mysql://u:p@rddb.darkovski.dev:3306/diary_ai", ca=str(ROOTS))
    context = created["ssl"]
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname
    assert created["host"] == "rddb.darkovski.dev" and created["db"] == "diary_ai"


async def test_without_a_ca_there_is_no_tls(created):
    await db.connect("mysql://u:p@127.0.0.1:3307/diary_ai_test")
    assert created.get("ssl") is None
