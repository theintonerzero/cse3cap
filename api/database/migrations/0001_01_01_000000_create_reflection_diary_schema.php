<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Baseline.
 *
 * db/01-schema.sql is source of truth number one and this migration
 * executes it verbatim rather than restating it in the Schema builder.
 * Two reasons: the CHECK constraints, generated columns and views have no
 * fluent equivalent, and a second hand-written copy of the schema would
 * drift from the first the moment either changed.
 *
 * On the shared instance this migration is recorded as already run and
 * never executes. On a per-developer test database it builds the whole
 * thing from nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        $path = base_path('../db/01-schema.sql');
        $sql = @file_get_contents($path);

        if ($sql === false) {
            throw new RuntimeException("Cannot read the schema at {$path}");
        }

        foreach ($this->statements($sql) as $statement) {
            DB::unprepared($statement);
        }
    }

    public function down(): void
    {
        // Views before tables, and dependants before what they read
        // through: v_radar and v_calibration_gap both select from
        // v_entry_score.
        $views = [
            'v_coverage_gaps', 'v_calibration_gap', 'v_radar',
            'v_entry_score', 'v_framework_scale',
        ];

        $tables = [
            'exports', 'events', 'evidence', 'scores', 'reflection_entries',
            'reflections', 'framework_assignments', 'levels', 'competencies',
            'frameworks', 'gig_participants', 'sprints', 'gigs', 'users',
        ];

        DB::statement('SET FOREIGN_KEY_CHECKS=0');

        foreach ($views as $view) {
            DB::statement("DROP VIEW IF EXISTS {$view}");
        }

        foreach ($tables as $table) {
            DB::statement("DROP TABLE IF EXISTS {$table}");
        }

        DB::statement('SET FOREIGN_KEY_CHECKS=1');
    }

    /**
     * Split on the semicolons that end a statement, ignoring the ones
     * inside quoted strings and line comments.
     *
     * A naive explode(';') is wrong here: the seed block puts descriptor
     * text in string literals, and the schema is heavily commented.
     *
     * @return list<string>
     */
    private function statements(string $sql): array
    {
        $out = [];
        $buf = '';
        $inSingle = false;
        $inComment = false;
        $len = strlen($sql);

        for ($i = 0; $i < $len; $i++) {
            $ch = $sql[$i];
            $next = $i + 1 < $len ? $sql[$i + 1] : '';

            if ($inComment) {
                $buf .= $ch;

                if ($ch === "\n") {
                    $inComment = false;
                }

                continue;
            }

            if (! $inSingle && $ch === '-' && $next === '-') {
                $inComment = true;
                $buf .= $ch;

                continue;
            }

            if ($ch === "'" && ($i === 0 || $sql[$i - 1] !== '\\')) {
                $inSingle = ! $inSingle;
            }

            if ($ch === ';' && ! $inSingle) {
                $this->push($out, $buf);
                $buf = '';

                continue;
            }

            $buf .= $ch;
        }

        $this->push($out, $buf);

        return $out;
    }

    /**
     * @param  list<string>  $out
     */
    private function push(array &$out, string $chunk): void
    {
        $chunk = trim($chunk);

        if ($chunk !== '' && ! $this->isOnlyComments($chunk)) {
            $out[] = $chunk;
        }
    }

    private function isOnlyComments(string $chunk): bool
    {
        foreach (explode("\n", $chunk) as $line) {
            $line = trim($line);

            if ($line !== '' && ! str_starts_with($line, '--')) {
                return false;
            }
        }

        return true;
    }
};
