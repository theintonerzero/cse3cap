from dataclasses import dataclass

from fastapi import Request

from .errors import unavailable


@dataclass
class Deps:
    """What a feature needs, built once at startup from settings. Tests set their own."""

    gateway: object
    store: object
    embedder: object
    limiter: object


def get_deps(request: Request) -> Deps:
    deps = getattr(request.app.state, "deps", None)
    if deps is None:  # no database configured: the features have nothing to work with
        raise unavailable("upstream")
    return deps
