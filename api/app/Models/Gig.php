<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Gig extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'gigs';

    public const CREATED_AT = 'created_at';

    public const UPDATED_AT = null;

    protected $fillable = ['external_ref', 'title', 'org_name', 'starts_on', 'ends_on'];

    protected $casts = [
        'starts_on' => 'date',
        'ends_on' => 'date',
        'created_at' => 'datetime',
    ];

    public function sprints(): HasMany
    {
        return $this->hasMany(Sprint::class)->orderBy('ordinal');
    }

    public function participants(): HasMany
    {
        return $this->hasMany(GigParticipant::class);
    }

    /**
     * The gig's rubric. FrameworkAssigner allows only one, but the schema
     * still permits two, so this pins which row wins rather than taking
     * whatever MySQL returns first: without an order, a second assignment
     * would change what new reflections are scored against, and could
     * change back again on the next query.
     */
    public function assignment(): HasOne
    {
        // assigned_at is DATETIME(6), so a tie needs two writes in the
        // same microsecond; the ids are UUIDv7 and sort by time, so they
        // break it deterministically if that ever happens.
        return $this->hasOne(FrameworkAssignment::class)
            ->ofMany(['assigned_at' => 'max', 'id' => 'max']);
    }

    public function reflections(): HasMany
    {
        return $this->hasMany(Reflection::class);
    }
}
