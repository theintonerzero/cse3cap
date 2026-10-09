from urllib.parse import unquote, urlparse

import aiomysql


async def connect(url: str) -> aiomysql.Pool:
    """A pool on diary_ai from a mysql:// URL. The deployed connection's TLS is
    added with the container in step 5."""
    u = urlparse(url)
    return await aiomysql.create_pool(
        host=u.hostname, port=u.port or 3306, user=unquote(u.username or ""), password=unquote(u.password or ""),
        db=u.path.lstrip("/"), autocommit=True, minsize=1, maxsize=5,
    )
