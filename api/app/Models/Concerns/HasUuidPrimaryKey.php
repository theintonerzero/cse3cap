<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Concerns\HasUuids;

/**
 * Ids are char(36) uuids, not auto-increment integers. They appear in
 * exported records and URLs, where sequential integers would leak row
 * counts and let someone enumerate other students' reflections.
 */
trait HasUuidPrimaryKey
{
    use HasUuids;

    public function initializeHasUuidPrimaryKey(): void
    {
        $this->keyType = 'string';
        $this->incrementing = false;

        // Every timestamp column in this schema is DATETIME(6), and
        // Eloquent's default format is 'Y-m-d H:i:s', so without this it
        // truncates to the second on the way in and the extra precision
        // the schema asks for is never written.
        //
        // Not cosmetic. v_entry_score decides which counter-score counts
        // by ordering on scored_at, and the History sheet orders events
        // the same way. At second resolution two writes in the same
        // second tie, and the tiebreak falls to a uuid, which is to say
        // to nothing.
        $this->dateFormat = 'Y-m-d H:i:s.u';
    }
}
