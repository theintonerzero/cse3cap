# Agent tooling

How the team's AI coding agents are set up in this repository: Claude Code's shared
configuration, the read-only database and Jira connections, the subagents and skills, and the
guards that stop an agent doing what a permission rule can't see. The rules agents follow are
in [`CLAUDE.md`](../CLAUDE.md), and the background they need is
[`PROJECT-CONTEXT.md`](PROJECT-CONTEXT.md).

## Claude Code

The repository ships shared configuration so everyone gets the same setup.

`.claude/settings.json` enables ten plugins from the official Anthropic marketplace: the PHP
and TypeScript language servers, Context7, frontend design, Playwright, superpowers, security
guidance, GitHub, commit commands, and the PR review toolkit. `.mcp.json` adds a read-only
MySQL connection so agents can inspect the real schema instead of guessing, and the
`atlassian` server through which agents read and move Jira tickets (ADR #38).

Trust the repository folder when prompted and Claude Code should offer to install them. If
nothing appears, run `/plugin` and install from the Discover tab.

Install the language server binaries once per machine; the plugins do not install them:

```bash
npm install -g typescript-language-server typescript
npm install -g intelephense
```

The MySQL MCP connection is deliberately read-only. Agents can read the schema and query
data, but cannot modify a database five people share. That is enforced by the grant on
`diary_ro`, not only by the server's own flags.

Everything it needs is defaulted in `.mcp.json` except the password, so setup is one line
in your shell profile:

```bash
export DB_READONLY_PASSWORD='...'      # from the team channel
```

Restart Claude Code afterwards. Without it the MySQL server fails to start and agents fall
back to guessing from `db/01-schema.sql`.

Only plugins from the official marketplace are enabled. Plugins execute arbitrary code with
your user privileges, so raise it in the channel before adding others.

## Jira

Ticket state lives in Jira, not in `docs/jira/*.csv`, which are the import files the tickets
were created from and carry no status column at all (ADR #38). Agents reach it through the
`atlassian` server in `.mcp.json`. Three steps, once per person:

1. Create an API token: your avatar → **Account settings → Security → API tokens → Create
   API token**, or go straight to
   [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens).
   Atlassian shows it once.
2. Export both values in your **shell profile**, next to `DB_READONLY_PASSWORD`:

   ```bash
   # ~/.zshrc
   export JIRA_EMAIL="you@students.latrobe.edu.au"
   export JIRA_API_TOKEN="paste-the-token"
   ```

   It has to be the profile. An MCP server is handed the environment Claude Code inherited
   when it launched, and nothing loads a `.env` into that.
3. `./run jira` to check, then **restart Claude Code from a new terminal**. A session that
   started before you added those exports cannot see them, however many times the check
   passes.

`./run jira` verifies the token over HTTP and starts the MCP server from your real
environment, so a pass means an agent can actually use it. `uv` is needed for the server;
the check prints the install line if it is missing. How agents read and move tickets is in
[`.claude/skills/jira-tickets/`](../.claude/skills/jira-tickets/).

## Agents and skills

`.claude/agents/` defines six subagents, tiered by what the task costs to get wrong rather
than by how long it takes. Without them every subagent inherits the main model, and a
one-line documentation fix costs the same as a schema change.

| Agent | Model | For |
| --- | --- | --- |
| `schema-migration` | Opus, xhigh | The schema, migrations, views, and the ADR that travels with them |
| `backend-endpoint` | Opus, high | An endpoint end to end: rule, policy, resource, test, contract |
| `frontend-screen` | Sonnet, high | React screens and components in `web/` |
| `contract-sync` | Sonnet | Keeping `openapi.yaml`, the API spec and the generated types in agreement |
| `repo-explorer` | Haiku | Read-only "where is X" before you write anything |
| `docs-tidy` | Haiku | Mechanical doc maintenance: a moved path, a stale version, a broken link |

Neither Haiku agent can run Bash. `.claude/skills/` holds eight task recipes, invoked with
`/add-endpoint`, `/add-migration`, `/add-policy`, `/add-screen`, `/seed-data`, `/write-adr`,
`/jira-tickets` and `/design-inventory`.

## Guards

Two `PreToolUse` hooks refuse things that a permission rule cannot see, both with their
cases run in CI:

- `scripts/guard-shared-db.sh` blocks any shell command that destroys schema without naming
  a test database. `api/tests/TestCase.php` already refuses inside PHPUnit, but a command
  typed at the shell goes nowhere near it, and five people share one instance.
- `scripts/guard-docs-location.sh` blocks a new document written outside `docs/`. Agents
  produce prose constantly, and left alone it lands wherever the agent happened to be. It
  reads shell redirections as well as the Write tool, because an agent working through
  Bash creates every file with `cat > path`.

Every document this project keeps lives in `docs/` and is listed in the README's
documentation table. A working note belongs in your scratchpad, outside the repository.
