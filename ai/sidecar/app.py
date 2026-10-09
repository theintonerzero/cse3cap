from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI

from . import errors
from .caller import Caller, caller
from .config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.http = httpx.AsyncClient(timeout=10)
        yield
        await app.state.http.aclose()

    app = FastAPI(title="Reflection Diary AI sidecar", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.settings = settings
    errors.install(app)

    def enabled() -> None:
        if not settings.ai_enabled:
            raise errors.disabled()

    @app.get("/ai/v1/status", dependencies=[Depends(enabled)])
    async def status(_: Caller = Depends(caller)) -> dict:
        return {"features": []}

    return app
