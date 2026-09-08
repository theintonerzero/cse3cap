#!/usr/bin/env bash
#
# Proves the typed API client in web/src/api/ still does what it claims.
#
#   ./run verify                     from the repository root
#   ./scripts/verify-client.sh       the same thing
#   ./scripts/verify-client.sh --static    no servers, no live calls
#
# The backend counterpart is scripts/smoke.sh, which walks the product over
# HTTP. This is the frontend half of the same idea. The client is covered by
# no test suite, and it is the thing every screen is built on, so breaking it
# breaks all of them at once.
#
# Three parts:
#
#   1. Static    gen:types is idempotent, and everything CI runs passes
#   2. Types     bad calls are compile errors, good ones are not. This is the
#                whole point of generating types, so it is checked rather
#                than assumed
#   3. Live      the client against the real API on :8000 and prism on :4010
#
# Part 3 needs the backend running (./run api) and a seeded token, which it
# reads from web/.env or from the file the seeder wrote. It starts prism
# itself and stops it again. It CREATES ROWS on the shared database: one
# export per run, the same as smoke.sh. It skips itself, loudly, rather than
# failing, when the backend is not up.
#
# Everything it writes into web/src is removed on exit, Ctrl-C included.
# Windows: use Git Bash or WSL, as with smoke.sh.

set -uo pipefail

# From the script's own location, so it works from any directory.
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
WEB="$REPO/web"
STATIC_ONLY=0
[ "${1:-}" = "--static" ] && STATIC_ONLY=1

if [ -t 1 ]; then
    b=$'\033[1m'; dim=$'\033[2m'; red=$'\033[1;31m'; grn=$'\033[1;32m'
    ylw=$'\033[1;33m'; blu=$'\033[1;34m'; off=$'\033[0m'
else
    b=''; dim=''; red=''; grn=''; ylw=''; blu=''; off=''
fi

pass=0; fail=0; skip=0
say()  { printf '\n%s==>%s %s\n' "$blu" "$off" "$1"; }
ok()   { pass=$((pass+1)); printf '  %sok%s   %-54s %s\n' "$grn" "$off" "$1" "${2:-}"; }
bad()  { fail=$((fail+1)); printf '  %sFAIL%s %-54s %s\n' "$red" "$off" "$1" "${2:-}"; }
skp()  { skip=$((skip+1)); printf '  %s--%s   %-54s %s%s%s\n' "$ylw" "$off" "$1" "$dim" "${2:-}" "$off"; }

PRISM_PID=''
cleanup() {
    rm -rf "$WEB/src/__verify_types.ts" "$WEB/src/__verify_live.ts" "$WEB/.verify-out"
    [ -n "$PRISM_PID" ] && kill "$PRISM_PID" 2>/dev/null
    return 0
}
trap cleanup EXIT INT TERM

[ -f "$WEB/package.json" ] || { printf '%sError:%s no web/ at %s\n' "$red" "$off" "$REPO"; exit 1; }
cd "$WEB" || exit 1
[ -d node_modules ] || { printf 'Installing frontend dependencies\n'; npm install >/dev/null 2>&1; }

# --------------------------------------------------------------------------
say "1. Static. The generated file, and everything CI runs"

before="$(md5 -q src/api/schema.ts 2>/dev/null || md5sum src/api/schema.ts | cut -d' ' -f1)"
if npm run gen:types >/dev/null 2>&1; then
    after="$(md5 -q src/api/schema.ts 2>/dev/null || md5sum src/api/schema.ts | cut -d' ' -f1)"
    if [ "$before" = "$after" ]; then
        ok "regenerating schema.ts changes nothing" "$dim$after$off"
    else
        bad "regenerating schema.ts changed it" "committed file is stale, or the contract moved"
    fi
else
    bad "npm run gen:types" "the generator did not run"
fi

git -C "$REPO" diff --quiet -- web/src/api/schema.ts 2>/dev/null \
    && ok "and leaves the working tree clean" \
    || bad "and leaves the working tree clean" "git sees a change after regenerating"

npm run lint            >/dev/null 2>&1 && ok "oxlint"            || bad "oxlint"
npx prettier --check .  >/dev/null 2>&1 && ok "prettier --check"  || bad "prettier --check"
npm run build           >/dev/null 2>&1 && ok "tsc -b and vite build" || bad "tsc -b and vite build"

# --------------------------------------------------------------------------
say "2. Types. What the contract refuses at compile time"

cat > src/__verify_types.ts <<'PROBE'
import { api, ApiError } from './api/client.ts';
import type { components } from './api/schema.ts';

export async function probe() {
  const me: components['schemas']['Me'] = await api.get('/auth/me');
  const gigs: components['schemas']['Gig'][] = await api.get('/gigs');
  const role: components['schemas']['Role'] = me.participations[0]!.role;
  const gig = await api.get('/gigs/{gig_id}', { path: { gig_id: 'x' } });
  const nothing: void = await api.delete('/reflections/{reflection_id}', {
    path: { reflection_id: 'x' },
  });
  await api.get('/reflections', { query: { status: 'draft' } });
  await api.get('/me/progress', { query: { gig_id: 'x' } });
  await api.post('/reflections', { body: { sprint_id: 'x' } });
  await api.put('/entries/{entry_id}/scores/self', {
    path: { entry_id: 'x' },
    body: { level_id: 'x' },
  });
  await api.post('/entries/{entry_id}/evidence', {
    path: { entry_id: 'x' },
    body: new FormData(),
  });
  const file: Blob = await api.blob('/exports/{export_id}/download', {
    path: { export_id: 'x' },
  });

  // Each of these must fail to compile. tsc reports an unused directive if not.
  // @ts-expect-error a path the contract does not declare
  await api.get('/nope');
  // @ts-expect-error /auth/me is GET only
  await api.post('/auth/me');
  // @ts-expect-error the gig id is not optional
  await api.get('/gigs/{gig_id}');
  // @ts-expect-error /me/progress requires gig_id
  await api.get('/me/progress');
  // @ts-expect-error status is an enum, not any string
  await api.get('/reflections', { query: { status: 'nearly' } });
  // @ts-expect-error camelCase is not a field. There is no mapping layer
  await api.post('/reflections', { body: { sprintId: 'x' } });
  // @ts-expect-error GET /gigs takes no body
  await api.get('/gigs', { body: {} });
  // @ts-expect-error format is enum [json]. PDF is CAP-17
  await api.post('/exports', { body: { format: 'pdf' } });

  const error = new ApiError(409, 'FRAMEWORK_IN_USE', 'x');
  switch (error.code) {
    case 'COMMENT_REQUIRED':
    case 'FRAMEWORK_IN_USE':
      break;
    // @ts-expect-error not a code in the contract
    case 'MADE_UP':
      break;
    default:
      break;
  }
  return { me, gigs, role, gig, nothing, file };
}
PROBE

out="$(npx tsc -b --force 2>&1)"
if [ -z "$out" ]; then
    ok "9 bad calls refused, 11 good calls accepted" "$dim""tsc -b clean$off"
else
    bad "the probe did not behave" "$(printf '%s' "$out" | head -3)"
fi

# A directive that is not needed is itself an error. Prove the probe can fail,
# so a clean run above means something.
printf '\n// @ts-expect-error nothing wrong with this line\nexport const sanity = 1;\n' >> src/__verify_types.ts
# Captured rather than piped: tsc exits non-zero when it finds the error we
# are asking for, and pipefail would read that as the pipeline failing.
sanity="$(npx tsc -b --force 2>&1)"
case "$sanity" in
    *TS2578*) ok  "and the probe is capable of failing" "$dim""unused directives are reported$off" ;;
    *)        bad "and the probe is capable of failing" "a clean run above proves nothing" ;;
esac
rm -f src/__verify_types.ts
npx tsc -b --force >/dev/null 2>&1

# --------------------------------------------------------------------------
say "3. Live. The client against real servers"

if [ "$STATIC_ONLY" = "1" ]; then
    skp "skipped" "--static was passed"
    printf '\n%s%s passed%s' "$grn" "$pass" "$off"
    [ "$fail" -gt 0 ] && printf ', %s%s FAILED%s' "$red" "$fail" "$off"
    [ "$skip" -gt 0 ] && printf ', %s%s skipped%s' "$ylw" "$skip" "$off"
    printf '\n'
    exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
fi

cat > src/__verify_live.ts <<'LIVE'
import { api, ApiError, getAuthToken, setAuthToken } from './api/client.ts';
import type { components } from './api/schema.ts';

const target = import.meta.env.VITE_VERIFY_TARGET ?? 'real';
let pass = 0, fail = 0;

async function check(name: string, run: () => Promise<string>) {
  try { console.log(`  ok   ${name.padEnd(54)} ${await run()}`); pass++; }
  catch (e) {
    fail++;
    console.log(`  FAIL ${name.padEnd(54)} ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
  }
}
function want(c: unknown, m: string) { if (!c) throw new Error(m); }
async function refusal(call: () => Promise<unknown>): Promise<ApiError> {
  try { await call(); } catch (e) { if (e instanceof ApiError) return e; throw e; }
  throw new Error('expected a refusal, got a success');
}
const CODES: readonly string[] = ['VALIDATION_FAILED','CONTEXT_REQUIRED','DUPLICATE_REFLECTION',
  'DUPLICATE_ASSIGNMENT','NOT_DRAFT','NOT_SUBMITTED','COMMENT_REQUIRED','LEVEL_NOT_IN_COMPETENCY',
  'EVIDENCE_REQUIRED','NARRATIVE_REQUIRED','SELF_SCORE_MISSING','FILE_TYPE_NOT_ACCEPTED',
  'FILE_TOO_LARGE','FRAMEWORK_NOT_ASSIGNED','FRAMEWORK_IN_USE','ALREADY_SCORED','ROLE_FORBIDDEN',
  'UNAUTHENTICATED','NOT_FOUND'];

async function real() {
  let gigs!: components['schemas']['Gig'][];

  // This bundle is built in production mode, where client.ts deliberately
  // does not seed itself from VITE_API_TOKEN -- that seed is gated behind
  // import.meta.env.DEV so a shipped bundle cannot carry a token (F1 in
  // docs/Security-Review.md). So do here what the app shell does in
  // production: hand it the token explicitly. Reading it from the
  // environment is fine in a harness that is never served to anyone.
  setAuthToken(import.meta.env.VITE_API_TOKEN ?? null);

  await check('the base URL and bearer token reach GET /auth/me', async () => {
    want(getAuthToken(), 'no token. Set VITE_API_TOKEN in web/.env');
    const me = await api.get('/auth/me');
    want(typeof me.display_name === 'string', 'no display_name');
    return `${me.display_name}, ${me.participations.length} participations`;
  });
  await check('snake_case survives, with no mapping layer', async () => {
    gigs = await api.get('/gigs');
    want(gigs.length > 0, 'no gigs');
    for (const k of ['org_name','starts_on','ends_on','my_role','reflection_summary'])
      want(k in gigs[0]!, `${k} missing`);
    want(!('orgName' in gigs[0]!), 'something camelCased the payload');
    return `${gigs.length} gigs, first is ${gigs[0]!.my_role} on ${gigs[0]!.org_name}`;
  });
  await check('a path parameter is interpolated', async () => {
    const gig = await api.get('/gigs/{gig_id}', { path: { gig_id: gigs[0]!.id } });
    want(gig.id === gigs[0]!.id, 'got a different gig back');
    return `${gig.sprints.length} sprints, rubric ${gig.framework?.fw_key}`;
  });
  await check('a query parameter is appended and applied', async () => {
    const drafts = await api.get('/reflections', { query: { status: 'draft' } });
    want(drafts.every((r) => r.status === 'draft'), 'the filter was not applied');
    return `${drafts.length} drafts`;
  });
  await check('a bad token unwraps to a typed 401', async () => {
    setAuthToken('nonsense');
    const e = await refusal(() => api.get('/auth/me'));
    want(e.status === 401 && e.code === 'UNAUTHENTICATED', `got ${e.status} ${e.code}`);
    return `${e.code} — ${e.message}`;
  });
  await check('no token at all is the same envelope', async () => {
    setAuthToken(null);
    const e = await refusal(() => api.get('/auth/me'));
    want(e.code === 'UNAUTHENTICATED', `code was ${e.code}`);
    setAuthToken(import.meta.env.VITE_API_TOKEN ?? null);
    return `${e.status} ${e.code}`;
  });
  await check('a gig that is not yours unwraps to a typed 404', async () => {
    const e = await refusal(() => api.get('/gigs/{gig_id}',
      { path: { gig_id: '00000000-0000-4000-8000-000000000000' } }));
    want(e.status === 404 && e.code === 'NOT_FOUND', `got ${e.status} ${e.code}`);
    return `${e.status} ${e.code}`;
  });
  await check('403 unwraps, which also proves a JSON body went out', async () => {
    const e = await refusal(() => api.post('/frameworks',
      { body: { based_on_framework_id: gigs[0]!.framework!.id, name: 'CAP-2 verification' } }));
    want(e.status === 403 && e.code === 'ROLE_FORBIDDEN', `got ${e.status} ${e.code}`);
    return `${e.status} ${e.code}`;
  });
  await check('400 carries code, message and details', async () => {
    const e = await refusal(() => api.post('/reflections', { body: {} }));
    want(e.status === 400 && e.code === 'CONTEXT_REQUIRED', `got ${e.status} ${e.code}`);
    want(typeof e.details === 'object' && e.details !== null, 'details is not an object');
    return `${e.code}, details ${JSON.stringify(e.details)}`;
  });
  await check('a 202 body is typed and the file downloads as a Blob', async () => {
    const requested = await api.post('/exports', { body: { format: 'json' } });
    const polled = await api.get('/exports/{export_id}', { path: { export_id: requested.id } });
    want(polled.status === 'complete', `export is ${polled.status}`);
    const file = await api.blob('/exports/{export_id}/download', { path: { export_id: requested.id } });
    want(file.size > 0, 'the download was empty');
    return `${polled.format}, ${file.size} bytes, ${polled.summary?.reflections ?? '?'} reflections`;
  });
  await check('an aborted request stays an abort, not an ApiError', async () => {
    try { await api.get('/auth/me', { signal: AbortSignal.abort() }); }
    catch (e) {
      want(!(e instanceof ApiError), 'an abort was reported as an API failure');
      want((e as Error).name === 'AbortError', `got ${(e as Error).name}`);
      return 'AbortError';
    }
    throw new Error('the abort was ignored');
  });
}

async function mock() {
  // Same reason as in real(): this bundle is production, where client.ts does
  // not seed itself from VITE_API_TOKEN. The mock checks the token is sent at
  // all, so it needs one; the value is irrelevant to prism.
  setAuthToken(import.meta.env.VITE_API_TOKEN ?? 'mock-token');

  await check('the same client, answered with no backend', async () => {
    const me = await api.get('/auth/me');
    return `${me.display_name}, ${me.participations.length} participations`;
  });
  await check('the mock enforces the bearer token', async () => {
    setAuthToken(null);
    const e = await refusal(() => api.get('/auth/me'));
    want(e.status === 401, `status was ${e.status}`);
    setAuthToken('mock-token');
    return `${e.status} without a token`;
  });
  await check('a path parameter is interpolated', async () => {
    const gig = await api.get('/gigs/{gig_id}',
      { path: { gig_id: 'b2c3d4e5-1111-4a2b-9c3d-4e5f60718293' } });
    return `${gig.title}, ${gig.sprints.length} sprints`;
  });
  await check('a query parameter is appended', async () =>
    `${(await api.get('/reflections', { query: { status: 'submitted' } })).length} reflections`);
  await check('a requested 409 unwraps to a typed code', async () => {
    const e = await refusal(() => api.post('/reflections', {
      body: { sprint_id: '11111111-aaaa-4111-8111-111111111111' },
      headers: { Prefer: 'code=409' },
    }));
    want(e.status === 409, `status was ${e.status}`);
    want(CODES.includes(e.code ?? ''), `code ${e.code} is not in the contract`);
    return `${e.code} — ${e.message}`;
  });
  await check('a requested 400 carries the submit gate details', async () => {
    const e = await refusal(() => api.post('/reflections/{reflection_id}/submit', {
      path: { reflection_id: 'd1d1d1d1-0000-4000-8000-000000000001' },
      headers: { Prefer: 'code=400' },
    }));
    want(e.status === 400, `status was ${e.status}`);
    return `${e.code}, details ${JSON.stringify(e.details)}`;
  });
  await check('a 204 resolves to undefined, not a parse error', async () => {
    const nothing = await api.delete('/reflections/{reflection_id}', {
      path: { reflection_id: 'd1d1d1d1-0000-4000-8000-000000000001' },
      headers: { Prefer: 'code=204' },
    });
    want(nothing === undefined, `got ${JSON.stringify(nothing)}`);
    return 'undefined';
  });
  await check('the download comes back as a Blob', async () => {
    const f = await api.blob('/exports/{export_id}/download',
      { path: { export_id: 'e1e1e1e1-0000-4000-8000-000000000001' } });
    return `${f.size} bytes, ${f.type || 'no content-type'}`;
  });
}

async function unreachable() {
  await check('a server that is not there is an ApiError, status 0', async () => {
    const e = await refusal(() => api.get('/auth/me'));
    want(e.status === 0 && e.code === null, `got ${e.status} ${e.code}`);
    return e.message;
  });
}

async function unset() {
  await check('no VITE_API_BASE_URL names the line that is missing', async () => {
    try { await api.get('/auth/me'); }
    catch (e) {
      want(!(e instanceof ApiError), 'a missing config was reported as an API failure');
      want((e as Error).message.includes('VITE_API_BASE_URL'), 'unhelpful message');
      return (e as Error).message.split('\n')[0]!;
    }
    throw new Error('a request went out with no base URL');
  });
}

const suites: Record<string, () => Promise<void>> = { real, mock, unreachable, unset };
await suites[target]!();
console.log(`::${pass}:${fail}`);
LIVE

# Each suite is a separate bundle, because the base URL is baked in at build
# time. Its own outDir, so two runs cannot collide over one directory.
run_suite() {
    local label="$1" target="$2" baseurl="$3" token="${4:-}"
    local out=".verify-out/$target" build

    build="$(VITE_VERIFY_TARGET="$target" VITE_API_BASE_URL="$baseurl" VITE_API_TOKEN="$token" \
        npx vite build --ssr src/__verify_live.ts --outDir "$out" --emptyOutDir --logLevel error 2>&1)"

    if [ ! -f "$out/__verify_live.js" ]; then
        bad "$label" "the verification bundle would not build"
        printf '       %s%s%s\n' "$dim" "$(printf '%s' "$build" | tail -3 | tr '\n' ' ')" "$off"
        return
    fi

    local output; output="$(node "$out/__verify_live.js" 2>&1)"
    local tally; tally="$(printf '%s' "$output" | grep '^::' | tail -1)"

    printf '%s\n' "$output" | grep -v '^::'

    if [ -z "$tally" ]; then
        bad "$label" "the suite did not finish"
        printf '       %s%s%s\n' "$dim" "$(printf '%s' "$output" | tail -2 | tr '\n' ' ')" "$off"
        return
    fi

    pass=$((pass + $(printf '%s' "$tally" | cut -d: -f3)))
    fail=$((fail + $(printf '%s' "$tally" | cut -d: -f4)))
}

# Prism is stateless, so start it here and stop it on exit.
if ! curl -s -o /dev/null --max-time 2 http://127.0.0.1:4010/auth/me; then
    printf '  %sstarting prism on :4010%s\n' "$dim" "$off"
    npx -y @stoplight/prism-cli mock "$REPO/docs/openapi.yaml" --port 4010 --host 127.0.0.1 \
        >/dev/null 2>&1 &
    PRISM_PID=$!
    for _ in $(seq 1 40); do
        curl -s -o /dev/null --max-time 1 http://127.0.0.1:4010/auth/me && break
        sleep 0.5
    done
fi

printf '\n%sagainst prism, no backend  %shttp://127.0.0.1:4010%s\n' "$b$off" "$dim" "$off"
if curl -s -o /dev/null --max-time 2 http://127.0.0.1:4010/auth/me; then
    run_suite "prism" mock http://127.0.0.1:4010 mock-token
else
    skp "prism would not start" "check npx can reach the network"
fi

# The token: web/.env first, then the file the seeder wrote.
TOKEN="$(grep -s '^VITE_API_TOKEN=' "$WEB/.env" | cut -d= -f2-)"
[ -z "$TOKEN" ] && TOKEN="$(grep -s 'Jane N' "$HOME/reflection-diary-tokens.txt" | awk '{print $NF}')"

printf '\n%sagainst the real API      %shttp://localhost:8000/api/v1%s\n' "$b$off" "$dim" "$off"
if ! curl -s -o /dev/null --max-time 2 http://localhost:8000/up; then
    skp "nothing serving on :8000" "start it with ./run api, then run this again"
elif [ -z "$TOKEN" ]; then
    skp "no seeded token" "put VITE_API_TOKEN in web/.env, or reseed with php artisan db:seed --class=DemoSeeder"
else
    printf '  %screates one export row on the shared database, as smoke.sh does%s\n' "$dim" "$off"
    run_suite "real" real http://localhost:8000/api/v1 "$TOKEN"
fi

printf '\n%sthe failure paths%s\n' "$b$off" "$off"
run_suite "unreachable" unreachable http://127.0.0.1:9 ''
run_suite "unset" unset '' ''

# --------------------------------------------------------------------------
printf '\n%s%s passed%s' "$grn" "$pass" "$off"
[ "$fail" -gt 0 ] && printf ', %s%s FAILED%s' "$red" "$fail" "$off"
[ "$skip" -gt 0 ] && printf ', %s%s skipped%s' "$ylw" "$skip" "$off"
printf '\n'
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
