from fastapi.testclient import TestClient
from pytest_httpserver import HTTPServer

from sidecar.app import create_app
from sidecar.config import Settings
from sidecar.deps import Deps


class Gateway:
    def __init__(self, reply):
        self.reply, self.calls = reply, []

    async def ask(self, feature, system, data, schema, max_tokens=2048):
        self.calls.append((feature, system, data))
        return self.reply


class Limiter:
    def __init__(self, refuse=False):
        self.calls, self.refuse = [], refuse

    async def check(self, token_hash, bucket):
        self.calls.append(bucket)
        if self.refuse:
            from sidecar.errors import AiError
            raise AiError("AI_RATE_LIMITED", 429, "Too many requests.", {"retry_after": 30})


FRAMEWORK = {"id": "f1", "scale": {"min": 1, "max": 4}, "competencies": [{"id": "c1", "name": "Communication", "levels": [
    {"id": "l2", "level_value": 2, "descriptor": "Raises blockers when asked."},
    {"id": "l3", "level_value": 3, "descriptor": "Raises blockers unprompted, early."},
]}]}


def score(cls, level, at, comment=None, name="Dr Lee"):
    return {"scorer_class": cls, "level_id": level, "scored_at": at, "comment": comment,
            "scorer": {"id": "s9", "display_name": name}}


def laravel(server, status="assessed", owner="u1", scores=None):
    server.expect_request("/api/v1/auth/me").respond_with_json({"id": "u1", "display_name": "Jane N", "participations": []})
    scores = scores if scores is not None else [score("self", "l2", "2026-08-01T00:00:00Z"),
                                                score("counter", "l3", "2026-08-02T00:00:00Z", "Only once, in sprint 2.")]
    server.expect_request("/api/v1/reflections/r1").respond_with_json({
        "id": "r1", "status": status, "framework_id": "f1", "owner": {"id": owner, "display_name": "Jane N"},
        "entries": [{"id": "e1", "competency_id": "c1", "competency_name": "Communication",
                     "narrative": "I told Sam about the blocker.", "scores": scores}]})
    server.expect_request("/api/v1/frameworks/f1").respond_with_json(FRAMEWORK)


def call(server, gateway, limiter=None):
    app = create_app(Settings(ai_enabled=True, diary_api_base=server.url_for("/api/v1")))
    limiter = limiter or Limiter()
    with TestClient(app) as client:
        app.state.deps = Deps(gateway=gateway, store=None, embedder=None, limiter=limiter)
        return client.post("/ai/v1/reflections/r1/entries/e1/calibration", headers={"Authorization": "Bearer t"}), limiter


def test_calibration_asks_about_the_difference(httpserver: HTTPServer):
    laravel(httpserver)
    gateway = Gateway({"questions": ["What did Dr Lee see that you didn't mention?"]})
    response, limiter = call(httpserver, gateway)
    assert response.status_code == 200 and response.json() == {"questions": ["What did Dr Lee see that you didn't mention?"]}
    feature, _, data = gateway.calls[0]
    assert feature == "calibration" and limiter.calls == ["claude"]
    assert "Raises blockers when asked." in data and "Raises blockers unprompted, early." in data
    assert "Only once, in sprint 2." in data
    assert "Dr Lee" not in data and "Jane" not in data and "u1" not in data and "s9" not in data


def test_calibration_only_after_assessment(httpserver: HTTPServer):
    laravel(httpserver, status="submitted")
    response, _ = call(httpserver, Gateway({"questions": ["Why?"]}))
    assert response.status_code == 403 and response.json()["error"]["code"] == "ROLE_FORBIDDEN"


def test_calibration_is_the_owners_alone(httpserver: HTTPServer):
    laravel(httpserver, owner="someone-else")
    response, _ = call(httpserver, Gateway({"questions": ["Why?"]}))
    assert response.status_code == 403


def test_calibration_needs_a_difference(httpserver: HTTPServer):
    laravel(httpserver, scores=[score("self", "l3", "2026-08-01T00:00:00Z"), score("counter", "l3", "2026-08-02T00:00:00Z")])
    gateway = Gateway({"questions": ["Why?"]})
    response, _ = call(httpserver, gateway)
    assert response.status_code == 400 and response.json()["error"]["details"] == {"reason": "no_difference"}
    assert gateway.calls == []


def test_no_counter_score_is_no_difference(httpserver: HTTPServer):
    laravel(httpserver, scores=[score("self", "l3", "2026-08-01T00:00:00Z")])
    response, _ = call(httpserver, Gateway({"questions": ["Why?"]}))
    assert response.json()["error"]["details"] == {"reason": "no_difference"}


def test_the_rate_limit_stops_it_before_claude(httpserver: HTTPServer):
    laravel(httpserver)
    gateway = Gateway({"questions": ["Why?"]})
    response, _ = call(httpserver, gateway, Limiter(refuse=True))
    assert response.status_code == 429 and gateway.calls == []


def test_level_talk_is_dropped_and_none_left_is_invalid_reply(httpserver: HTTPServer):
    laravel(httpserver)
    response, _ = call(httpserver, Gateway({"questions": ["Should this be a level 3?"]}))
    assert response.status_code == 503 and response.json()["error"]["details"]["reason"] == "invalid_reply"
