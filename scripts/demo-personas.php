<?php
/**
 * The live demo's personas.json, from `php artisan db:seed` output (CAP-54).
 *
 *   php scripts/demo-personas.php SEED_OUTPUT_FILE > personas.json
 *
 * Runs inside the diary-api container, which is where the seed runs; the box
 * has no PHP. scripts/demo-reset.sh is its only caller. A person with no token
 * line is left out, as the laptop preflight does. None at all is an error, so
 * a reset never publishes an empty picker.
 */
require __DIR__ . '/lib/token-for.php';
require __DIR__ . '/lib/demo-people.php';

$file = $argv[1] ?? '';
$personas = [];
foreach (DEMO_PEOPLE as [$id, $name, $role_hint, $slot]) {
    $token = token_for($name, $file);
    if ($token !== '') {
        $personas[] = ['id' => $id, 'name' => $name, 'role_hint' => $role_hint, 'slot' => $slot, 'token' => $token];
    }
}

if ($personas === []) {
    fwrite(STDERR, "Error: no demo person's token in $file. Was it the output of db:seed on an empty database?\n");
    exit(1);
}

echo json_encode($personas, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), "\n";
