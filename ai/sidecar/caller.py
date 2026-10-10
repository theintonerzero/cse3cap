import hashlib
from dataclasses import dataclass

from fastapi import Request

from .errors import AiError
from .reader import DiaryReader


@dataclass(frozen=True)
class Caller:
    me: dict
    reader: DiaryReader
    token_hash: str  # SHA-256 of the token, for rate limits. The token itself is never kept.


async def caller(request: Request) -> Caller:
    """Runs before every route body: no valid token, nothing else happens."""
    authorization = request.headers.get("Authorization", "")
    token = authorization.removeprefix("Bearer ")
    # A bearer token is printable ASCII. Anything else is not one, and can't be
    # forwarded to Laravel in a header anyway.
    if not authorization.startswith("Bearer ") or not token.strip() or not (token.isascii() and token.isprintable()):
        raise AiError("UNAUTHENTICATED", 401, "Sign in to use this.")
    reader = DiaryReader(request.app.state.settings.diary_api_base, authorization, request.app.state.http)
    me = await reader.me()
    return Caller(me=me, reader=reader, token_hash=hashlib.sha256(authorization.encode()).hexdigest())
