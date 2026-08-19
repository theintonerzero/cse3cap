<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Reflection extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'reflections';

    /**
     * gig_key and sprint_key are database-generated and deliberately
     * absent from $fillable. Writing to them is an error; a duplicate
     * context surfaces as MySQL 1062 and is rendered as
     * 409 DUPLICATE_REFLECTION.
     */
    protected $fillable = [
        'user_id', 'sprint_id', 'gig_id',
        'framework_id', 'framework_version', 'status', 'submitted_at',
    ];

    protected $casts = [
        'submitted_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function gig(): BelongsTo
    {
        return $this->belongsTo(Gig::class);
    }

    public function sprint(): BelongsTo
    {
        return $this->belongsTo(Sprint::class);
    }

    public function framework(): BelongsTo
    {
        return $this->belongsTo(Framework::class);
    }

    public function entries(): HasMany
    {
        return $this->hasMany(ReflectionEntry::class);
    }

    /**
     * Append-only, newest first. The History sheet reads this and
     * notifications are derived from it rather than stored separately.
     */
    public function events(): HasMany
    {
        // Newest first. occurred_at is DATETIME(6) and the models write
        // microseconds, so ties are vanishingly unlikely; id is there so
        // the order is total rather than merely usually-right.
        return $this->hasMany(Event::class)
            ->orderByDesc('occurred_at')
            ->orderByDesc('id');
    }
}
