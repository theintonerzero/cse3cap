<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * A thin local mirror of an Alumable user. external_ref holds their id
 * for the same person and is the entire coupling surface. There is no
 * password column: identity belongs to the host platform, and the MVP
 * authenticates with three seeded tokens.
 */
class User extends Authenticatable
{
    use HasApiTokens, HasUuidPrimaryKey;

    protected $table = 'users';

    public const CREATED_AT = 'created_at';

    public const UPDATED_AT = null;

    protected $fillable = ['external_ref', 'display_name'];

    protected $casts = ['created_at' => 'datetime'];

    public function participations(): HasMany
    {
        return $this->hasMany(GigParticipant::class);
    }

    public function reflections(): HasMany
    {
        return $this->hasMany(Reflection::class);
    }
}
