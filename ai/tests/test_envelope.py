import gc
import logging

from fastapi import FastAPI, Query
from fastapi.testclient import TestClient
from pydantic import AfterValidator
from typing import Annotated
from pytest_httpserver import HTTPServer

from sidecar import errors
from sidecar.app import create_app
from sidecar.config import Settings


def test_ai_off_does_not_accumulate_tracebacks_across_requests():
    client = TestClient(create_app(Settings(ai_enabled=False)))
    for _ in range(50):
        client.get("/ai/v1/status")
    gc.collect()

    def depth(tb) -> int:
        n = 0
        while tb is not None:
            n, tb = n + 1, tb.tb_next
        return n

    live = [o for o in gc.get_objects() if isinstance(o, errors.AiError) and o.code == "AI_DISABLED"]
    assert all(depth(o.__traceback__) < 50 for o in live), "one AI_DISABLED instance is collecting every request's traceback"


def _not_blank(value: str) -> str:
    if not value.strip():
        raise ValueError("empty search")
    return value


def _app_with(route) -> FastAPI:
    app = FastAPI()
    app.state.settings = Settings(ai_enabled=True)
    errors.install(app)
    route(app)
    return app


def test_a_validator_error_is_a_400_envelope_not_a_500():
    def route(app):
        @app.get("/ai/v1/probe")
        async def probe(q: Annotated[str, Query(), AfterValidator(_not_blank)]) -> dict:
            return {"q": q}

    response = TestClient(_app_with(route)).get("/ai/v1/probe", params={"q": "  "})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_anything_unexpected_is_a_503_envelope_and_is_logged(caplog):
    def route(app):
        @app.get("/ai/v1/boom")
        async def boom() -> dict:
            raise RuntimeError("the database went away")

    with caplog.at_level(logging.ERROR):
        response = TestClient(_app_with(route), raise_server_exceptions=False).get("/ai/v1/boom")
    assert response.status_code == 503
    assert response.json() == {"error": {"code": "AI_UNAVAILABLE", "message": "AI isn't available right now.", "details": {"reason": "upstream"}}}
    assert "the database went away" in caplog.text


def test_a_token_that_is_not_printable_ascii_is_401_and_never_reaches_laravel(httpserver: HTTPServer):
    app = create_app(Settings(ai_enabled=True, diary_api_base=httpserver.url_for("/api/v1")))
    with TestClient(app) as client:
        response = client.get("/ai/v1/status", headers={"Authorization": "Bearer café".encode("latin-1")})
    assert response.status_code == 401 and response.json()["error"]["code"] == "UNAUTHENTICATED"
    assert httpserver.log == []


def test_laravel_unreachable_is_logged(caplog):
    app = create_app(Settings(ai_enabled=True, diary_api_base="http://127.0.0.1:9/api/v1"))
    with caplog.at_level(logging.WARNING), TestClient(app) as client:
        response = client.get("/ai/v1/status", headers={"Authorization": "Bearer t"})
    assert response.status_code == 503 and response.json()["error"]["details"] == {"reason": "upstream"}
    assert any(r.name.startswith("sidecar") for r in caplog.records)
