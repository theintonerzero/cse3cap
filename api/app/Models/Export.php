<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Export extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'exports';

    public const CREATED_AT = 'requested_at';

    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'reflection_id', 'format', 'status', 'uri', 'summary', 'completed_at'];

    protected $casts = [
        'summary' => 'array',
        'requested_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
