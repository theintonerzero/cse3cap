from fastapi.testclient import TestClient

from sidecar.app import create_app
from sidecar.config import Settings


def client(enabled: bool) -> TestClient:
    return TestClient(create_app(Settings(ai_enabled=enabled, diary_api_base="http://diary.invalid/api/v1")))


def test_off_means_every_route_is_ai_disabled():
    response = client(False).get("/ai/v1/status", headers={"Authorization": "Bearer x"})
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "AI_DISABLED", "message": "AI features are switched off.", "details": {}}}


def test_unknown_route_uses_the_envelope():
    response = client(False).get("/ai/v1/nothing-here")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "AI_DISABLED"
