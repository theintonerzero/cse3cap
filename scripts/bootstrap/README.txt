Reflection Diary development setup
CSE3CAP / Alumable / Team 404 Not Found

Linux and macOS:

  curl -fsSL https://dl.darkovski.dev/git/cse3cap/install.sh | bash

Windows, in PowerShell:

  irm https://dl.darkovski.dev/git/cse3cap/install.ps1 | iex

Both clone https://github.com/theintonerzero/cse3cap into ~/cse3cap, or
update it if already present, then run scripts/setup.sh or scripts/setup.ps1
inside the repository. Set CSE3CAP_DIR first to put it somewhere else.

Prefer -fsSL over -s on the curl. Without -f, curl writes the server's error
page to stdout on a failure and bash executes that instead.

The installer checks that git, PHP 8.3 or newer, Composer, Node and npm are
present and tells you what to run if any are missing. It never installs
anything itself.

It asks for two passwords, both pinned in the team channel. diary_app is the
one Laravel connects as and goes into api/.env. diary_ro is read only and is
exported into your shell profile, where .mcp.json picks it up so coding
agents can read the schema without being able to change it. Leave either
blank to skip it and set it yourself later.

Neither script contains a password.

It also generates your APP_KEY, which is per developer and never shared, and
gives you your own test database name in DB_TEST_DATABASE. That second one
matters: the test suite rebuilds the database it is pointed at from nothing,
so two people sharing the value would drop each other's schema mid-run.

These two files are generated from scripts/bootstrap/ in the repository.
Edit them there, not here.

It is safe to rerun. It stops rather than guessing if the destination is not
a git repository, is a checkout of something else, or has uncommitted
changes, and it leaves an existing api/.env alone.

Verify before running, which is worth doing for anything piped to a shell:

  curl -fsSL https://dl.darkovski.dev/git/cse3cap/SHA256SUMS
