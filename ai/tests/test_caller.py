from fastapi.testclient import TestClient
from pytest_httpserver import HTTPServer

from sidecar.app import create_app
from sidecar.config import Settings


def app_for(server: HTTPServer):
    return create_app(Settings(ai_enabled=True, diary_api_base=server.url_for("/api/v1")))


def test_invalid_token_stops_before_anything_else(httpserver: HTTPServer):
    httpserver.expect_request("/api/v1/auth/me").respond_with_json(
        {"error": {"code": "UNAUTHENTICATED", "message": "No.", "details": {}}}, status=401
    )
    with TestClient(app_for(httpserver)) as client:
        response = client.get("/ai/v1/status", headers={"Authorization": "Bearer bad"})
    assert response.status_code == 401 and response.json()["error"]["code"] == "UNAUTHENTICATED"
    assert [request.path for request, _ in httpserver.log] == ["/api/v1/auth/me"]


def test_no_authorization_header_is_unauthenticated_without_calling_laravel(httpserver: HTTPServer):
    with TestClient(app_for(httpserver)) as client:
        response = client.get("/ai/v1/status")
    assert response.status_code == 401 and response.json()["error"]["code"] == "UNAUTHENTICATED"
    assert httpserver.log == []


def test_a_valid_token_reaches_status(httpserver: HTTPServer):
    httpserver.expect_request("/api/v1/auth/me").respond_with_json({"id": "u1", "display_name": "Jane N", "participations": []})
    with TestClient(app_for(httpserver)) as client:
        assert client.get("/ai/v1/status", headers={"Authorization": "Bearer t"}).json() == {"features": []}
