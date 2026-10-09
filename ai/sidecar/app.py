from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import APIRouter, Depends, FastAPI, Request

from . import errors, routes_coach, routes_related
from .caller import Caller, caller
from .config import Settings


def enabled(request: Request) -> None:
    if not request.app.state.settings.ai_enabled:
        raise errors.disabled()


def features_router() -> APIRouter:
    """Every feature route sits here, so none can skip the off switch or the caller."""
    return APIRouter(prefix="/ai/v1", dependencies=[Depends(enabled), Depends(caller)])


async def _build_deps(settings: Settings):
    from .db import connect
    from .deps import Deps
    from .embedder import FastEmbedder
    from .gateway import ClaudeGateway, client_for
    from .limits import RateLimiter
    from .spend import SpendLedger
    from .store import VectorStore

    pool = await connect(settings.database_url)
    gateway = ClaudeGateway(client_for(settings.anthropic_api_key), SpendLedger(pool, settings.daily_cap_usd), settings.model)
    return pool, Deps(gateway=gateway, store=VectorStore(pool), embedder=FastEmbedder(), limiter=RateLimiter(pool))


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.http = httpx.AsyncClient(timeout=10)
        pool = None
        if settings.ai_enabled and settings.database_url:
            pool, app.state.deps = await _build_deps(settings)
        yield
        await app.state.http.aclose()
        if pool is not None:
            pool.close()
            await pool.wait_closed()

    app = FastAPI(title="Reflection Diary AI sidecar", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.settings = settings
    errors.install(app)

    @app.get("/ai/v1/status", dependencies=[Depends(enabled)])
    async def status(_: Caller = Depends(caller)) -> dict:
        return {"features": settings.ai_features}

    router = features_router()
    routes_coach.register(router)
    routes_related.register(router)
    app.include_router(router)
    return app
