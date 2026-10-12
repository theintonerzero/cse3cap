# Assessor guide

Run the whole Reflection Diary on your own machine with one command: the app, its own
database with the seeded demo, the AI on your own Anthropic key if you want it, and every
test suite. Nothing here touches the team's servers. CAP-71, [ADR #67](adr/architecture-decision-records.md).

## What you need

- **Docker.** Docker Desktop on macOS or Windows, or Docker Engine with the Compose v2 and
  Buildx plugins on Linux. Give it at least 4 GB of memory.
- **git.**
- About **6 GB of disk** for the images, and a network connection for the first run.
- On Windows, PowerShell 7 or Windows PowerShell 5.1.

Nothing else: no PHP, Composer, Node, Python or MySQL.

## Start it

```bash
git clone https://github.com/theintonerzero/cse3cap.git
cd cse3cap
./assess              # Windows: .\assess.ps1
```

The first run builds the images and seeds the demo, which takes 5 to 10 minutes. Later
runs start in seconds and keep your data. When it says **Ready**, open
<http://localhost:8080>.

There's no login screen in this product (it lives inside Alumable, which signs people in).
Instead you pick who to be from a list of the seeded people. You never see a token or a
password.

## Who to sign in as

| Person | Is | Shows |
| --- | --- | --- |
| **Jane N** | A student on both gigs | Both rubrics: La Trobe's six competencies on a four-level scale, and SFIA's six skills on seven. Assessed reflections with the radar, one waiting on its assessor, and her learning record and export. Her third La Trobe sprint is free to start. |
| **Noor A** | A student | A draft part-way through the stepper, with gaps in coverage. |
| **Tom H** | A student | A large calibration gap: consistently two levels above his assessor. |
| **Priya R** | A student | Almost no gap: well calibrated. |
| **Sam O** | An assessor, on one gig only | The review queue, counter-scoring, and that he sees only his gig. |
| **Dr Lee** | A supervisor on both gigs | Choosing, copying and editing a rubric, and counter-scoring on SFIA. |

Scores are shaped rather than random, so the radar's gaps mean something. Switch person
from the menu in the top bar.

## The AI, with your own key

The AI is a separate service beside the app ([ADR #64](adr/architecture-decision-records.md)).
It asks questions and finds related reflections. It never writes a reflection, suggests a
score or writes a reviewer's comment.

**Turning it on.** The first `./assess` asks once for an Anthropic API key. Paste one, or
press Enter to skip. Later, `./assess ai` adds, replaces or removes it, or changes the
spending cap. The key is checked with Anthropic before it's saved, and it's kept in
`.assess/ai.env` on your machine, which git ignores. If Anthropic refuses the key, you see
Anthropic's reason. A key made outside a workspace is refused, so make it inside one:
Anthropic Console, Settings, Workspaces, API keys.

**Cost.** The model is Claude Haiku 5.5, and a question from the coach costs about a tenth
of a cent. Spending is capped at **US$1 a day** (`./assess ai --cap 5` changes it). At the
cap, the features that ask Claude say they're unavailable until midnight UTC. Similar
reflections and search never ask Claude, so they keep working.

**Where to try it:**

| Feature | Sign in as | Then |
| --- | --- | --- |
| The coach | Noor, or Jane after starting her sprint 3 reflection | On a competency in the draft, **Ask me questions** |
| Similar reflections | Jane or Noor | Under a competency, **From your earlier sprints** |
| The calibration coach | Tom | Open an assessed reflection, then **Think about the difference** on a competency where his score and the assessor's differ |
| Search and themes | Sam | The review queue: **Search reflections by meaning**, and **Recurring themes** |

Every control that asks the AI carries an **AI** mark. With no key, none of them appear and
everything else works.

## Run the tests

```bash
./assess test          # all three suites
./assess test api      # or one: api, ai or web
```

| Suite | What it covers |
| --- | --- |
| `api` | The Laravel backend: every endpoint, policy and business rule, against its own test database. |
| `ai` | The AI sidecar, including the database tests that skip on a laptop without one. |
| `web` | The browser checks: every screen driven in Chromium and Firefox against a fake API ([ADR #42](adr/architecture-decision-records.md)). |

The first run downloads the browser image, about 2 GB. The command ends with one line per
suite and exits non-zero if any failed.

## Commands

| Command | Does |
| --- | --- |
| `./assess` | Build, start and seed (the first time), then print the address. |
| `./assess ai` | Add, replace or remove your key, or change the cap. `--cap N`, `--off` for scripting. |
| `./assess test [api\|ai\|web]` | The test suites, with a summary. |
| `./assess reset` | Reseed the demo and empty the AI's tables. Anyone signed in reloads the page. |
| `./assess smoke` | Check the running app from outside: the page, `/up`, the six people, a sign-in, and the AI's status. |
| `./assess status` | What's running, and whether the AI is on. |
| `./assess down` | Stop it. `./assess` starts it again with the same data. |
| `./assess down --wipe` | Stop it and delete its database, images and `.assess/`, for a clean start. |

On Windows, `.\assess.ps1` takes the same commands.

## When something goes wrong

| You see | Do |
| --- | --- |
| Docker is installed but not running | Start Docker Desktop, then run `./assess` again. |
| Docker Compose v2, or Buildx, is missing | Install Docker Desktop, which includes both. |
| Port 8080 is in use | Free it, or use another port: `ASSESS_PORT=8090 ./assess` (Windows: `$env:ASSESS_PORT=8090; .\assess.ps1`). |
| A build failed | Usually memory: give Docker at least 4 GB, then run `./assess` again. |
| The AI says "not available right now" | The daily cap was reached, or the key was refused. `./assess ai` shows its state. |
| Anything else | `./assess down --wipe`, then `./assess`, for a clean start. The logs: `docker compose -f deploy/assess/compose.yml logs`. |

## What runs where

`./assess` runs a Compose project called `diary-assess` (`deploy/assess/compose.yml`):

| Container | Does |
| --- | --- |
| `mysql` | MySQL 9.7.2 with the app's database, the AI's, and one for each test suite. Not reachable from outside Docker. |
| `diary-api` | The Laravel API. |
| `diary-web` | The app, at `127.0.0.1:8080`, the only port opened, and only on your machine. |
| `diary-ai` | The AI sidecar, off until you give it a key. |

The API, web and AI images are built from the same Dockerfiles as the live demo, so what
you run is what we deploy. `.assess/` holds the database passwords and Laravel key, made at
random on the first run, plus your Anthropic key if you gave one. Every file there is
readable only by you, and none of it is ever committed.
