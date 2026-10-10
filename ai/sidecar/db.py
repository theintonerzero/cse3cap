import ssl
from urllib.parse import unquote, urlparse

import aiomysql


async def connect(url: str, ca: str | None = None) -> aiomysql.Pool:
    """A pool on diary_ai from a mysql:// URL. Given a CA bundle, the connection
    is TLS and the server's certificate must name the host, as the API's is
    (MYSQL_ATTR_SSL_CA, db/letsencrypt-roots.pem). Tests run without one."""
    u = urlparse(url)
    context = None
    if ca:
        context = ssl.create_default_context(cafile=ca)  # CERT_REQUIRED, check_hostname
    return await aiomysql.create_pool(
        host=u.hostname, port=u.port or 3306, user=unquote(u.username or ""), password=unquote(u.password or ""),
        db=u.path.lstrip("/"), autocommit=True, minsize=1, maxsize=5, ssl=context,
    )
