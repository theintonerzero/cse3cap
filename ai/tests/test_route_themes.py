from fastapi.testclient import TestClient
from pytest_httpserver import HTTPServer

from sidecar.app import create_app
from sidecar.config import Settings
from sidecar.deps import Deps
from tests.test_route_calibration import Gateway
from tests.test_route_related import Limiter

G1 = "99999999-0000-4000-8000-000000000001"

LEE = {"id": "lee", "display_name": "Dr Lee", "participations": [{"gig_id": G1, "gig_title": "SFIA", "role": "supervisor"}]}
TEXT = "We kept finding the blocker late in the sprint, and nobody owned the import step."


class Cache:
    def __init__(self, held=None):
        self.held, self.put_calls = held, []

    async def get(self, gig_id, day):
        return self.held

    async def put(self, gig_id, day, themes):
        self.put_calls.append((gig_id, themes))


def laravel(server, me=LEE, n=6, status="submitted"):
    server.expect_request("/api/v1/auth/me").respond_with_json(me)
    rows = [{"id": f"r{i}", "status": status, "gig_id": G1} for i in range(n)] + [{"id": "rd", "status": "draft", "gig_id": G1}]
    server.expect_request("/api/v1/reflections").respond_with_json(rows)
    for i in range(n):
        server.expect_request(f"/api/v1/reflections/r{i}").respond_with_json(
            {"id": f"r{i}", "status": status, "gig_id": G1, "owner": {"id": f"s{i}", "display_name": f"Student {i}"},
             "entries": [{"id": f"e{i}", "competency_name": "Communication", "narrative": TEXT}]})
    server.expect_request("/api/v1/reflections/rd").respond_with_json(
        {"id": "rd", "status": "draft", "gig_id": G1, "owner": {"id": "sd", "display_name": "Drafty"},
         "entries": [{"id": "ed", "competency_name": "C", "narrative": "DRAFT TEXT"}]})


def themes(server, gateway, cache, limiter=None):
    app = create_app(Settings(ai_enabled=True, diary_api_base=server.url_for("/api/v1")))
    limiter = limiter or Limiter()
    with TestClient(app) as client:
        app.state.deps = Deps(gateway=gateway, store=None, embedder=None, limiter=limiter, themes=cache)
        return client.get(f"/ai/v1/gigs/{G1}/themes", headers={"Authorization": "Bearer t"}), limiter


def test_a_miss_asks_claude_once_and_caches_the_day(httpserver: HTTPServer):
    laravel(httpserver)
    gateway, cache = Gateway({"themes": ["Blockers raised late", "Unclear task ownership", "Import step"]}), Cache()
    response, limiter = themes(httpserver, gateway, cache)
    assert response.json() == {"themes": ["Blockers raised late", "Unclear task ownership", "Import step"]}
    assert len(gateway.calls) == 1 and gateway.calls[0][0] == "themes" and limiter.calls == ["search", "claude"]
    assert cache.put_calls == [(G1, ["Blockers raised late", "Unclear task ownership", "Import step"])]
    data = gateway.calls[0][2]
    assert "DRAFT TEXT" not in data and "Student" not in data and "s1" not in data


def test_a_cached_day_makes_no_claude_call(httpserver: HTTPServer):
    httpserver.expect_request("/api/v1/auth/me").respond_with_json(LEE)
    gateway = Gateway({"themes": ["x", "y", "z"]})
    response, limiter = themes(httpserver, gateway, Cache(held=["Blockers raised late"]))
    assert response.json() == {"themes": ["Blockers raised late"]} and gateway.calls == [] and limiter.calls == []


def test_too_few_narratives_is_no_themes_and_no_call(httpserver: HTTPServer):
    laravel(httpserver, n=3)
    gateway, cache = Gateway({"themes": ["x", "y", "z"]}), Cache()
    response, limiter = themes(httpserver, gateway, cache)
    assert response.json() == {"themes": []} and gateway.calls == [] and cache.put_calls == []
    # A thin gig is never cached, so it must not spend the Claude limit the coaches share.
    assert limiter.calls == ["search"]


def test_themes_refuse_a_gig_the_caller_studies_on(httpserver: HTTPServer):
    httpserver.expect_request("/api/v1/auth/me").respond_with_json(
        {"id": "lee", "display_name": "Dr Lee", "participations": [
            {"gig_id": G1, "gig_title": "SFIA", "role": "supervisor"},
            {"gig_id": G1, "gig_title": "SFIA", "role": "student"}]})
    response, _ = themes(httpserver, Gateway({"themes": []}), Cache())
    assert response.status_code == 403


def test_themes_refuse_a_gig_the_caller_does_not_review(httpserver: HTTPServer):
    httpserver.expect_request("/api/v1/auth/me").respond_with_json(
        {"id": "lee", "display_name": "Dr Lee", "participations": [{"gig_id": "g2", "gig_title": "Other", "role": "supervisor"}]})
    response, _ = themes(httpserver, Gateway({"themes": []}), Cache())
    assert response.status_code == 403
