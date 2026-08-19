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

    public function assignment(): HasOne
    {
        return $this->hasOne(FrameworkAssignment::class);
    }

    public function reflections(): HasMany
    {
        return $this->hasMany(Reflection::class);
    }
}
