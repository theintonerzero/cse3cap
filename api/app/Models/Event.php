<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Event extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'events';

    public const CREATED_AT = 'occurred_at';

    public const UPDATED_AT = null;

    protected $fillable = ['reflection_id', 'actor_user_id', 'event_type', 'metadata'];

    protected $casts = [
        'metadata' => 'array',
        'occurred_at' => 'datetime',
    ];

    public function reflection(): BelongsTo
    {
        return $this->belongsTo(Reflection::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
