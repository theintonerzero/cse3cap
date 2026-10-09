import logging
from typing import Any

import httpx

from .errors import AiError, unavailable

PASSED_THROUGH = {401, 403, 404}
log = logging.getLogger("sidecar.reader")


class DiaryReader:
    """The only code that calls Laravel. GET only, with the caller's own token.

    It never sees or infers a role: Laravel decides what this token may read,
    and its 401, 403 and 404 reach the caller unchanged."""

    def __init__(self, base_url: str, authorization: str, client: httpx.AsyncClient):
        self._base = base_url.rstrip("/")
        self._headers = {"Authorization": authorization, "Accept": "application/json"}
        self._client = client

    async def get(self, path: str, **query: Any) -> Any:
        params = {k: v for k, v in query.items() if v is not None}
        try:
            response = await self._client.get(f"{self._base}{path}", headers=self._headers, params=params)
        except httpx.HTTPError:
            log.warning("diary API unreachable: GET %s", path, exc_info=True)
            raise unavailable("upstream")
        if response.status_code in PASSED_THROUGH:
            try:
                error = response.json()["error"]
                code, message, details = error["code"], error["message"], error.get("details") or {}
            except (ValueError, KeyError, TypeError):
                raise unavailable("upstream")
            raise AiError(code, response.status_code, message, details)
        if response.status_code != 200:
            log.warning("diary API answered %s to GET %s", response.status_code, path)
            raise unavailable("upstream")
        try:
            return response.json()
        except ValueError:
            raise unavailable("upstream")

    async def me(self) -> dict:
        return await self.get("/auth/me")

    async def reflections(self, **query: Any) -> list[dict]:
        return await self.get("/reflections", **query)

    async def reflection(self, reflection_id: str) -> dict:
        return await self.get(f"/reflections/{reflection_id}")

    async def framework(self, framework_id: str) -> dict:
        return await self.get(f"/frameworks/{framework_id}")
