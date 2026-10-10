<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Scores are rows, not self_score and assessor_score columns. Each row
 * is one scorer's opinion tagged with scorer_role, so the radar is one
 * query grouped by role and a new scorer type needs no migration.
 */
class Score extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'scores';

    public const CREATED_AT = 'scored_at';

    public const UPDATED_AT = null;

    protected $fillable = [
        'reflection_entry_id', 'scorer_user_id', 'scorer_role', 'level_id', 'comment',
    ];

    protected $casts = ['scored_at' => 'datetime'];

    public function entry(): BelongsTo
    {
        return $this->belongsTo(ReflectionEntry::class, 'reflection_entry_id');
    }

    public function level(): BelongsTo
    {
        return $this->belongsTo(Level::class);
    }

    public function scorer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'scorer_user_id');
    }
}
