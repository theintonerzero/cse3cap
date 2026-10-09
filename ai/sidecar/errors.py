import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("sidecar")


class AiError(Exception):
    """Every non-2xx the sidecar sends, in the diary's envelope."""

    def __init__(self, code: str, status: int, message: str, details: dict | None = None):
        super().__init__(f"{code}: {message}")
        self.code, self.status, self.message, self.details = code, status, message, details or {}

    def response(self) -> JSONResponse:
        body = {"error": {"code": self.code, "message": self.message, "details": self.details}}
        return JSONResponse(body, status_code=self.status)


def disabled() -> AiError:
    """A fresh instance per request: one shared exception, raised again and
    again, would keep every request's traceback alive."""
    return AiError("AI_DISABLED", 404, "AI features are switched off.")


def unavailable(reason: str) -> AiError:
    return AiError("AI_UNAVAILABLE", 503, "AI isn't available right now.", {"reason": reason})


def install(app: FastAPI) -> None:
    @app.exception_handler(AiError)
    async def _ai(_: Request, e: AiError) -> JSONResponse:
        return e.response()

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException) -> JSONResponse:
        if e.status_code == 404:
            if not app.state.settings.ai_enabled:
                return disabled().response()
            return AiError("NOT_FOUND", 404, "Not found.").response()
        return AiError("VALIDATION_FAILED", e.status_code, str(e.detail)).response()

    @app.exception_handler(RequestValidationError)
    async def _invalid(_: Request, e: RequestValidationError) -> JSONResponse:
        # Without the raw input or the exception objects a validator put in ctx,
        # neither of which belongs in a reply or can be serialised.
        problems = [{k: v for k, v in error.items() if k not in {"input", "ctx", "url"}} for error in e.errors()]
        return AiError("VALIDATION_FAILED", 400, "The request is not valid.", {"errors": jsonable_encoder(problems)}).response()

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, e: Exception) -> JSONResponse:
        # Every non-2xx is the envelope, this one too, and an operator can see why.
        log.exception("unexpected error on %s %s", request.method, request.url.path)
        return unavailable("upstream").response()
