#!/usr/bin/env bash
# The AI sidecar's fixed eval set against real Claude (CAP-69). Costs well under
# US$0.05 (the run's own cap). Read the output against ai/evals/README.md.
#   ANTHROPIC_API_KEY=... scripts/ai-eval.sh [--out FILE]
set -euo pipefail
[ -n "${ANTHROPIC_API_KEY:-}" ] || {
    printf 'Error: ANTHROPIC_API_KEY is not set. The evals call real Claude (under US$0.05).\n' >&2
    exit 1
}
cd "$(dirname "$0")/../ai"
exec uv run python -m sidecar.evals "$@"
