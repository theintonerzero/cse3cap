import httpx
import pytest
from pytest_httpserver import HTTPServer

from sidecar.errors import AiError
from sidecar.reader import DiaryReader


def reader(server: HTTPServer, token: str = "Bearer t") -> DiaryReader:
    return DiaryReader(server.url_for("/api/v1"), token, httpx.AsyncClient(timeout=5))


async def test_forwards_the_callers_token_unchanged_and_only_gets(httpserver: HTTPServer):
    httpserver.expect_request("/api/v1/auth/me", method="GET", headers={"Authorization": "Bearer t"}).respond_with_json(
        {"id": "u1", "display_name": "Jane N", "participations": []}
    )
    assert (await reader(httpserver).me())["id"] == "u1"


@pytest.mark.parametrize("status,code", [(401, "UNAUTHENTICATED"), (403, "ROLE_FORBIDDEN"), (404, "NOT_FOUND")])
async def test_laravel_refusals_pass_through_with_their_code(httpserver: HTTPServer, status, code):
    httpserver.expect_request("/api/v1/reflections/r1").respond_with_json(
        {"error": {"code": code, "message": "m", "details": {}}}, status=status
    )
    with pytest.raises(AiError) as e:
        await reader(httpserver).reflection("r1")
    assert (e.value.status, e.value.code, e.value.message) == (status, code, "m")


async def test_laravel_unreachable_is_ai_unavailable():
    r = DiaryReader("http://127.0.0.1:9/api/v1", "Bearer t", httpx.AsyncClient(timeout=1))
    with pytest.raises(AiError) as e:
        await r.me()
    assert (e.value.code, e.value.details) == ("AI_UNAVAILABLE", {"reason": "upstream"})


async def test_a_laravel_500_is_ai_unavailable_not_passed_through(httpserver: HTTPServer):
    httpserver.expect_request("/api/v1/auth/me").respond_with_data("boom", status=500)
    with pytest.raises(AiError) as e:
        await reader(httpserver).me()
    assert e.value.code == "AI_UNAVAILABLE"
