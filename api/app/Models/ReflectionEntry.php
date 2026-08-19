<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReflectionEntry extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'reflection_entries';

    protected $fillable = ['reflection_id', 'competency_id', 'narrative'];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function reflection(): BelongsTo
    {
        return $this->belongsTo(Reflection::class);
    }

    public function competency(): BelongsTo
    {
        return $this->belongsTo(Competency::class);
    }

    public function scores(): HasMany
    {
        return $this->hasMany(Score::class);
    }

    public function evidence(): HasMany
    {
        return $this->hasMany(Evidence::class);
    }
}
