<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * ak_fw_assignments goes from (gig_id, framework_id) to (gig_id).
 *
 * The old key stopped the same rubric being assigned to a gig twice and
 * permitted a second, different one, which is the case that hurts: every
 * reflection snapshots its gig's framework, so a gig holding two rubrics
 * scores two students against different ones. See ADR #35.
 *
 * Idempotent on purpose. The baseline migration builds a database from
 * db/01-schema.sql, which now carries the new key, so on a fresh test
 * database this migration finds the work already done; on the shared
 * instance, built before the change, it does the alter. Both run the same
 * file and neither may fail.
 */
return new class extends Migration
{
    private const TABLE = 'framework_assignments';

    private const KEY = 'ak_fw_assignments';

    public function up(): void
    {
        if ($this->keyColumns() === ['gig_id']) {
            return;
        }

        $this->assertOneRubricPerGig();

        // Both halves in one statement. gig_id leads the old key and
        // fk_fa_gig depends on an index over it, so dropping first and
        // adding second would leave the constraint uncovered in between
        // and MySQL refuses that.
        DB::statement('ALTER TABLE '.self::TABLE.
            ' DROP INDEX '.self::KEY.
            ', ADD UNIQUE KEY '.self::KEY.' (gig_id)');
    }

    public function down(): void
    {
        if ($this->keyColumns() === ['gig_id', 'framework_id']) {
            return;
        }

        DB::statement('ALTER TABLE '.self::TABLE.
            ' DROP INDEX '.self::KEY.
            ', ADD UNIQUE KEY '.self::KEY.' (gig_id, framework_id)');
    }

    /**
     * Refuse rather than fail halfway. A gig holding two rubrics is data
     * the new key cannot represent, and MySQL's own error names a
     * duplicate key value without saying which gig, so the operator would
     * have to go looking. Naming them here is the difference between a
     * message you can act on and one you have to investigate.
     */
    private function assertOneRubricPerGig(): void
    {
        $offenders = DB::table(self::TABLE)
            ->select('gig_id')
            ->selectRaw('COUNT(*) AS rubrics')
            ->groupBy('gig_id')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('rubrics', 'gig_id');

        if ($offenders->isEmpty()) {
            return;
        }

        throw new RuntimeException(
            'Cannot hold a gig to one rubric while these hold more than one: '
            .$offenders->map(fn ($n, $gig) => "{$gig} ({$n})")->implode(', ')
            .'. Decide which rubric each gig is scored against and delete the rest, '
            .'remembering that reflections already created point at the framework they '
            .'snapshotted rather than at the assignment.'
        );
    }

    /**
     * @return list<string>
     */
    private function keyColumns(): array
    {
        return DB::table('information_schema.STATISTICS')
            ->where('TABLE_SCHEMA', DB::getDatabaseName())
            ->where('TABLE_NAME', self::TABLE)
            ->where('INDEX_NAME', self::KEY)
            ->orderBy('SEQ_IN_INDEX')
            ->pluck('COLUMN_NAME')
            ->all();
    }
};
