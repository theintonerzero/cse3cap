<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Competency extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'competencies';

    public $timestamps = false;

    protected $fillable = ['framework_id', 'code', 'name', 'category', 'position', 'short_label'];

    protected $casts = ['position' => 'integer'];

    public function framework(): BelongsTo
    {
        return $this->belongsTo(Framework::class);
    }

    /**
     * Levels hang off competencies, not frameworks, because a SFIA skill
     * is only valid across part of the seven-point scale.
     */
    public function levels(): HasMany
    {
        return $this->hasMany(Level::class)->orderBy('level_value');
    }
}
