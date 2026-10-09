import pytest
from fastapi.testclient import TestClient
from pytest_httpserver import HTTPServer

from sidecar.app import create_app
from sidecar.config import Settings
from sidecar.deps import Deps
from sidecar.errors import unavailable

R1 = "11111111-1111-4111-8111-111111111111"
E1 = "eeeeeeee-0000-4000-8000-000000000001"
E9 = "eeeeeeee-0000-4000-8000-000000000009"
SELF_LEVEL = "5e1f5e1f-0000-4000-8000-00000000c0de"

LONG = "I kept the team updated on my blockers during standups and posted in the channel before lunch when the migration stalled on Wednesday."


class FakeGateway:
    def __init__(self, reply=None, error=None):
        self.reply, self.error, self.calls = reply or {"questions": ["What happened next?"]}, error, []

    async def ask(self, feature, system, data, schema, max_tokens=2048):
        self.calls.append((feature, system, data))
        if self.error:
            raise self.error
        return self.reply


class FakeLimiter:
    def __init__(self, refuse=False):
        self.calls, self.refuse = [], refuse

    async def check(self, token_hash, bucket):
        self.calls.append(bucket)
        if self.refuse:
            from sidecar.errors import AiError
            raise AiError("AI_RATE_LIMITED", 429, "Too many requests.", {"retry_after": 30})


def laravel(server: HTTPServer, me="u1", owner="u1", status="draft", narrative=LONG, reflection_status=200, scores=()):
    server.expect_request("/api/v1/auth/me").respond_with_json({"id": me, "display_name": "X", "participations": []})
    if reflection_status != 200:
        server.expect_request(f"/api/v1/reflections/{R1}").respond_with_json(
            {"error": {"code": "NOT_FOUND", "message": "No.", "details": {}}}, status=reflection_status)
        return
    server.expect_request(f"/api/v1/reflections/{R1}").respond_with_json({
        "id": R1, "status": status, "framework_id": "f1", "owner": {"id": owner, "display_name": "Jane N"},
        "entries": [{"id": E1, "competency_id": "c1", "competency_name": "Communication", "narrative": narrative, "scores": list(scores)}],
    })
    server.expect_request("/api/v1/frameworks/f1").respond_with_json({
        "id": "f1", "scale": {"min": 1, "max": 4},
        "competencies": [{"id": "c1", "name": "Communication", "levels": [
            {"level_value": n, "descriptor": f"Descriptor {n}."} for n in range(1, 5)]}],
    })


def call(server: HTTPServer, gateway=None, entry=E1, limiter=None):
    app = create_app(Settings(ai_enabled=True, diary_api_base=server.url_for("/api/v1")))
    gateway, limiter = gateway or FakeGateway(), limiter or FakeLimiter()
    with TestClient(app) as client:
        app.state.deps = Deps(gateway=gateway, store=None, embedder=None, limiter=limiter)
        response = client.post(f"/ai/v1/reflections/{R1}/entries/{entry}/coach", headers={"Authorization": "Bearer t"})
    return response, gateway, limiter


def test_the_owner_of_a_draft_gets_questions(httpserver: HTTPServer):
    laravel(httpserver)
    response, gateway, limiter = call(httpserver)
    assert response.status_code == 200 and response.json() == {"questions": ["What happened next?"]}
    assert [c[0] for c in gateway.calls] == ["coach"] and limiter.calls == ["claude"]
    assert "Descriptor 1." in gateway.calls[0][2] and LONG in gateway.calls[0][2]


def test_a_reviewer_reading_the_draft_gets_no_coach(httpserver: HTTPServer):
    laravel(httpserver, me="s1", owner="u1")
    response, gateway, _ = call(httpserver)
    assert response.status_code == 403 and response.json()["error"]["code"] == "ROLE_FORBIDDEN"
    assert gateway.calls == []


def test_a_submitted_reflection_gets_no_coach(httpserver: HTTPServer):
    laravel(httpserver, status="submitted")
    response, gateway, _ = call(httpserver)
    assert response.status_code == 403 and gateway.calls == []


def test_an_entry_not_in_the_reflection_is_not_found(httpserver: HTTPServer):
    laravel(httpserver)
    response, gateway, _ = call(httpserver, entry=E9)
    assert response.status_code == 404 and gateway.calls == []
    assert response.json()["error"]["message"] == "That competency isn't part of this reflection."


def test_a_narrative_under_fifteen_words_is_too_short(httpserver: HTTPServer):
    laravel(httpserver, narrative="Only a few words here.")
    response, gateway, _ = call(httpserver)
    assert response.status_code == 400
    assert response.json()["error"] == {"code": "VALIDATION_FAILED", "message": "Write a few sentences first.", "details": {"reason": "too_short"}}
    assert gateway.calls == []


def test_a_reply_with_no_surviving_question_is_invalid_reply(httpserver: HTTPServer):
    laravel(httpserver)
    response, _, _ = call(httpserver, gateway=FakeGateway(reply={"questions": ["Is this a level 3?"]}))
    assert response.status_code == 503 and response.json()["error"]["details"] == {"reason": "invalid_reply"}


def test_the_gateways_refusal_passes_through(httpserver: HTTPServer):
    laravel(httpserver)
    response, _, _ = call(httpserver, gateway=FakeGateway(error=unavailable("daily_cap")))
    assert response.status_code == 503 and response.json()["error"]["details"] == {"reason": "daily_cap"}


def test_laravels_404_for_the_reflection_passes_through(httpserver: HTTPServer):
    laravel(httpserver, reflection_status=404)
    response, gateway, _ = call(httpserver)
    assert response.status_code == 404 and gateway.calls == []
    assert response.json()["error"]["message"] == "No."  # Laravel's own words, passed through


def test_the_self_score_never_reaches_the_prompt(httpserver: HTTPServer):
    # The route is handed the self-score with the entry; the prompt must not carry it.
    laravel(httpserver, scores=[{"scorer_class": "self", "level_id": SELF_LEVEL, "level_value": 3,
                                 "scorer_role": "student", "comment": None, "scored_at": "2026-08-01T00:00:00Z"}])
    response, gateway, _ = call(httpserver)
    assert response.status_code == 200
    data = gateway.calls[0][2]
    assert SELF_LEVEL not in data and "self" not in data.lower() and "scorer" not in data


def test_a_rate_limit_stops_it_before_claude(httpserver: HTTPServer):
    laravel(httpserver)
    response, gateway, _ = call(httpserver, limiter=FakeLimiter(refuse=True))
    assert response.status_code == 429 and gateway.calls == []
