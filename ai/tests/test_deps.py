from fastapi.testclient import TestClient
from pytest_httpserver import HTTPServer

from sidecar.app import create_app
from sidecar.config import Settings


def me(server: HTTPServer):
    server.expect_request("/api/v1/auth/me").respond_with_json({"id": "u1", "display_name": "Jane N", "participations": []})


def test_status_lists_the_features_switched_on(httpserver: HTTPServer):
    me(httpserver)
    app = create_app(Settings(ai_enabled=True, diary_api_base=httpserver.url_for("/api/v1"), ai_features=["coach"]))
    with TestClient(app) as client:
        assert client.get("/ai/v1/status", headers={"Authorization": "Bearer t"}).json() == {"features": ["coach"]}


def test_every_feature_route_requires_the_switch_and_the_caller():
    app = create_app(Settings(ai_enabled=True))
    feature_routes = [r for r in app.routes if getattr(r, "path", "").startswith("/ai/v1/") and r.path != "/ai/v1/status"]
    for route in feature_routes:
        names = {d.call.__name__ for d in route.dependant.dependencies}
        assert {"enabled", "caller"} <= names, route.path
