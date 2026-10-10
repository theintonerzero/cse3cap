<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Role lives here, not on users, because the same person can be a
 * student on one gig and an assessor on another. Every authorisation
 * decision resolves through this table.
 */
class GigParticipant extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'gig_participants';

    public $timestamps = false;

    protected $fillable = ['gig_id', 'user_id', 'role'];

    public function gig(): BelongsTo
    {
        return $this->belongsTo(Gig::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
