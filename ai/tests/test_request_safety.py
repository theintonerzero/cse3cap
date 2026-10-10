from fastapi.testclient import TestClient
from pytest_httpserver import HTTPServer

from sidecar.app import create_app
from sidecar.config import Settings
from sidecar.deps import Deps
from sidecar.errors import AiError
from sidecar.routes_coach import own_reflection

E1 = "eeeeeeee-0000-4000-8000-000000000001"
G1 = "99999999-0000-4000-8000-000000000001"


def me(server: HTTPServer):
    server.expect_request("/api/v1/auth/me").respond_with_json({"id": "u1", "display_name": "Jane N", "participations": []})


def test_an_id_that_is_not_a_uuid_is_refused_before_laravel(httpserver: HTTPServer):
    me(httpserver)
    app = create_app(Settings(ai_enabled=True, diary_api_base=httpserver.url_for("/api/v1")))
    with TestClient(app) as client:
        app.state.deps = Deps(gateway=None, store=None, embedder=None, limiter=None)  # configured
        for path in (f"/ai/v1/reflections/..%2Fframeworks/entries/{E1}/coach",
                     f"/ai/v1/reflections/not-a-uuid/entries/{E1}/calibration",
                     "/ai/v1/reflections/aaaaaaaa-0000-4000-8000-000000000001/entries/x/related",
                     "/ai/v1/gigs/g1/themes"):
            method = client.get if path.endswith(("related", "themes")) else client.post
            response = method(path, headers={"Authorization": "Bearer t"})
            assert response.status_code in (400, 404), path
            assert response.json()["error"]["code"] in ("VALIDATION_FAILED", "NOT_FOUND"), path
    # Only /auth/me reached Laravel: no reflection, framework or gig was asked for.
    assert all(req.path == "/api/v1/auth/me" for req, _ in httpserver.log)


def test_ai_off_answers_disabled_for_any_method(httpserver: HTTPServer):
    app = create_app(Settings(ai_enabled=False, diary_api_base=httpserver.url_for("/api/v1")))
    with TestClient(app) as client:
        for method, path in (("POST", "/ai/v1/status"), ("DELETE", "/ai/v1/search"), ("GET", "/ai/v1/nowhere")):
            response = client.request(method, path, headers={"Authorization": "Bearer t"})
            assert response.status_code == 404 and response.json()["error"]["code"] == "AI_DISABLED", (method, path)


def test_status_lists_nothing_without_a_database(httpserver: HTTPServer):
    me(httpserver)
    app = create_app(Settings(ai_enabled=True, diary_api_base=httpserver.url_for("/api/v1"), ai_features=["coach"]))
    with TestClient(app) as client:  # no DATABASE_URL, so no deps: nothing can be served
        assert client.get("/ai/v1/status", headers={"Authorization": "Bearer t"}).json() == {"features": []}


def test_the_owner_check_fails_closed_without_ids():
    for reflection, who in (({}, {}), ({"owner": {}}, {"id": ""}), ({"owner": {"id": None}}, {"id": None})):
        try:
            own_reflection(reflection, who)
        except AiError as error:
            assert error.status == 403
        else:
            raise AssertionError(f"passed with {reflection!r} and {who!r}")
