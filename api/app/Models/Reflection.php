<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Services\RoleResolver;
use Closure;
use Illuminate\Contracts\Database\Query\Builder as QueryBuilder;
use Illuminate\Database\Eloquent\Builder;
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

    /**
     * Reflections this user reviews: the ones on gigs where they hold a
     * reviewing role. Their own are not included, because reviewing your
     * own reflection is not a thing.
     *
     * This is the collection half of `ReflectionPolicy::view`. A policy
     * answers yes or no about one record and cannot scope a query, so the
     * rule would otherwise be written out per list endpoint -- which is
     * exactly what it was, in three controllers, until CAP-19's audit.
     * Both halves now read the same constant, and every list endpoint calls
     * one of these two scopes rather than restating the join.
     */
    public function scopeReviewableBy(Builder $query, User $user): Builder
    {
        return $query->whereExists(self::reviewerExists($user));
    }

    /** Reflections this user may see at all: their own, plus the ones they review. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->where(fn (QueryBuilder $group) => $group
            ->where('reflections.user_id', $user->id)
            ->orWhereExists(self::reviewerExists($user)));
    }

    /**
     * The join itself, built once so both scopes share it rather than each
     * restating it -- which is the duplication CAP-19 found, one level down.
     *
     * The closure is typed against the query-builder contract, not the
     * Eloquent builder: `whereExists` and `orWhereExists` hand their callback
     * a query builder, and typing it as Eloquent gives a TypeError at
     * runtime rather than at compile time. The controllers this replaced
     * imported the contract for the same reason.
     */
    private static function reviewerExists(User $user): Closure
    {
        return fn (QueryBuilder $sub) => $sub
            ->selectRaw('1')
            ->from('gig_participants')
            ->whereColumn('gig_participants.gig_id', 'reflections.gig_id')
            ->where('gig_participants.user_id', $user->id)
            ->whereIn('gig_participants.role', RoleResolver::REVIEWER_ROLES);
    }

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
