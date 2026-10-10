<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Evidence extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'evidence';

    public const CREATED_AT = 'uploaded_at';

    public const UPDATED_AT = null;

    protected $fillable = ['reflection_entry_id', 'kind', 'label', 'uri', 'size_bytes'];

    protected $casts = [
        'size_bytes' => 'integer',
        'uploaded_at' => 'datetime',
    ];

    public function entry(): BelongsTo
    {
        return $this->belongsTo(ReflectionEntry::class, 'reflection_entry_id');
    }
}
