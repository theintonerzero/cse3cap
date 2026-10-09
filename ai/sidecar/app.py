from fastapi import Depends, FastAPI

from . import errors
from .config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="Reflection Diary AI sidecar", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    errors.install(app)

    def enabled() -> None:
        if not settings.ai_enabled:
            raise errors.DISABLED

    @app.get("/ai/v1/status", dependencies=[Depends(enabled)])
    async def status() -> dict:
        return {"features": []}

    return app
