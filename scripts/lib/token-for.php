<?php
/**
 * The tokens-file reader, in PHP (CAP-51). scripts/lib/token-for.sh is the
 * same rule for bash; scripts/token-for.test.py runs both against the same
 * cases, so the two cannot drift. PHP because `.\run.ps1 demo` has no bash,
 * and every laptop that runs the API has PHP.
 *
 * The rule (CAP-45): the token is the last field of the LAST line naming the
 * person whose last field holds the "|" every Sanctum token has. The last
 * line, because a reissue is appended. The "|", because `php artisan db:seed`
 * also prints a ReflectionSeeder line per reflection that starts with the
 * name. A trailing \r goes, because a file saved on Windows has one.
 *
 *   php scripts/lib/token-for.php NAME [FILE]   prints the token, or nothing
 *
 * Never fails on a missing file or name: the caller says what is missing.
 */

function token_for(string $name, ?string $file): string
{
    if ($file === null || $file === '' || !is_file($file)) {
        return '';
    }
    $token = '';
    foreach (preg_split('/\n/', (string) file_get_contents($file)) as $line) {
        $line = rtrim($line, "\r");
        if (!str_contains($line, $name)) {
            continue;
        }
        $fields = preg_split('/\s+/', trim($line));
        $last = end($fields);
        if ($last !== false && str_contains($last, '|')) {
            $token = $last;
        }
    }
    return $token;
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $name = $argv[1] ?? '';
    $file = $argv[2] ?? (getenv('TOKENS') ?: null);
    $token = token_for($name, $file);
    if ($token !== '') {
        echo $token, "\n";
    }
}
