<?php
/**
 * Before `./run demo` (and `.\run.ps1 demo`) start the API and the web app
 * (CAP-51): can this laptop run the client demo against the shared database?
 *
 *   1. The shared database answers on the host and port in api/.env. Venue
 *      wifi often blocks 3306; if so this stops and says to use a hotspot,
 *      rather than letting the demo open on a page that never loads.
 *   2. The demo sign-in's people come from the team's tokens file
 *      (~/reflection-diary-tokens.txt, or $TOKENS), read by the same rule as
 *      every other script (scripts/lib/token-for.php). They are written into
 *      web/.env.development.local, which only the dev server reads and git
 *      ignores, keeping every other line there. With no tokens file, an
 *      existing set-up is left alone; with none at all the sign-in falls back
 *      to pasting a token.
 *
 * It never prints a token or a password: only who it found.
 *
 *   php scripts/demo-preflight.php [--api-env F] [--tokens F] [--web-env F]
 */

require __DIR__ . '/lib/token-for.php';
require __DIR__ . '/lib/demo-people.php';

$root = dirname(__DIR__);
$opts = getopt('', ['api-env:', 'tokens:', 'web-env:']);
$api_env = $opts['api-env'] ?? "$root/api/.env";
$web_env = $opts['web-env'] ?? "$root/web/.env.development.local";
$home = getenv('HOME') ?: (getenv('USERPROFILE') ?: '');
$tokens = $opts['tokens'] ?? (getenv('TOKENS') ?: "$home/reflection-diary-tokens.txt");

function say(string $m): void { fwrite(STDOUT, "==> $m\n"); }
function ok(string $m): void { fwrite(STDOUT, "  ok $m\n"); }
function warn(string $m): void { fwrite(STDERR, "  !! $m\n"); }
function fail(string $m): never { fwrite(STDERR, "Error: $m\n"); exit(1); }

/** KEY=value lines of a dotenv file, without interpreting anything else. */
function env_value(string $file, string $key): ?string
{
    foreach (preg_split('/\R/', (string) @file_get_contents($file)) as $line) {
        if (preg_match('/^\s*' . preg_quote($key, '/') . '\s*=\s*(.*)$/', $line, $m)) {
            return trim($m[1], " \t\"'");
        }
    }
    return null;
}

/** The env file's lines, with KEY set to VALUE (replaced, or appended). */
function set_lines(array $lines, string $key, string $value): array
{
    $out = [];
    $done = false;
    foreach ($lines as $line) {
        if (preg_match('/^\s*' . preg_quote($key, '/') . '\s*=/', $line)) {
            if (!$done) { $out[] = "$key=$value"; $done = true; }
            continue;
        }
        $out[] = $line;
    }
    if (!$done) { $out[] = "$key=$value"; }
    return $out;
}

function write_env(string $file, array $lines): void
{
    $lines = array_values(array_filter($lines, fn ($l) => $l !== ''));
    $old = umask(0077);
    file_put_contents($file, implode("\n", $lines) . "\n");
    umask($old);
    @chmod($file, 0600);
}

say('Checking this laptop can run the demo');

// 1. The shared database.
if (!is_file($api_env)) {
    fail("$api_env is missing. Run ./run setup (or .\\run.ps1 setup on Windows) first.");
}
$host = env_value($api_env, 'DB_HOST');
$port = (int) (env_value($api_env, 'DB_PORT') ?: 3306);
if (!$host) {
    fail("$api_env has no DB_HOST. Run ./run setup again.");
}
$socket = @fsockopen($host, $port, $errno, $errstr, 5);
if ($socket === false) {
    fail("cannot reach the database at $host:$port from this network. Venue and campus wifi "
        . "often block it: switch to a phone hotspot and run the demo command again. If it "
        . "still fails, present the recorded video (docs/Demo-Script.md, Before you start).");
}
fclose($socket);
ok("database $host:$port reachable");

// 2. The demo sign-in's people.
$lines = is_file($web_env) ? preg_split('/\R/', rtrim((string) file_get_contents($web_env))) : [];
$found = [];
foreach (DEMO_PEOPLE as [$id, $name, $role_hint, $slot]) {
    $token = token_for($name, is_file($tokens) ? $tokens : null);
    if ($token !== '') {
        $found[] = ['id' => $id, 'name' => $name, 'role_hint' => $role_hint, 'slot' => $slot, 'token' => $token];
    }
}

if ($found) {
    $lines = set_lines($lines, 'VITE_DEMO_SHELL', '1');
    $lines = set_lines($lines, 'VITE_DEMO_TOKENS', json_encode($found, JSON_UNESCAPED_SLASHES));
    write_env($web_env, $lines);
    ok('demo sign-in: ' . implode(', ', array_column($found, 'name')) . " (from $tokens)");
    $missing = array_diff(['Jane N', 'Noor A', 'Sam O', 'Dr Lee'], array_column($found, 'name'));
    if ($missing) {
        warn('no token for ' . implode(', ', $missing) . " in $tokens. Ask Tony for the "
            . 'current tokens file (Runbook, Run the demo on your laptop).');
    }
    exit(0);
}

$existing = env_value($web_env, 'VITE_DEMO_TOKENS');
$names = $existing ? array_column(json_decode($existing, true) ?: [], 'name') : [];
if ($names) {
    ok('demo sign-in: ' . implode(', ', $names) . ' (already set up in ' . basename($web_env) . ')');
    exit(0);
}

$lines = set_lines($lines, 'VITE_DEMO_SHELL', '1');
write_env($web_env, $lines);
warn("no tokens file at $tokens, so the demo sign-in will ask you to paste a token. Ask "
    . 'Tony for the tokens file and save it there (Runbook, Run the demo on your laptop).');
exit(0);
