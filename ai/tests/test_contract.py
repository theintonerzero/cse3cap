from pathlib import Path

import yaml

from sidecar.app import create_app
from sidecar.config import Settings

CONTRACT = Path(__file__).parents[2] / "docs" / "ai-openapi.yaml"


def test_every_route_is_in_the_contract_and_every_contract_path_is_served():
    spec = yaml.safe_load(CONTRACT.read_text())
    declared = {(m.upper(), p) for p, ops in spec["paths"].items() for m in ops if m in {"get", "post"}}
    app = create_app(Settings(ai_enabled=True))
    served = {
        (m, r.path.removeprefix("/ai/v1"))
        for r in app.routes
        for m in getattr(r, "methods", set())
        if r.path.startswith("/ai/v1")
    }
    assert served == declared


def test_the_error_codes_are_the_specs():
    spec = yaml.safe_load(CONTRACT.read_text())
    codes = spec["components"]["schemas"]["Error"]["properties"]["error"]["properties"]["code"]["enum"]
    assert set(codes) == {
        "UNAUTHENTICATED", "ROLE_FORBIDDEN", "NOT_FOUND", "VALIDATION_FAILED",
        "AI_DISABLED", "AI_RATE_LIMITED", "AI_UNAVAILABLE",
    }
