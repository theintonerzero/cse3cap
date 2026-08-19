<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Level extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'levels';

    public $timestamps = false;

    protected $fillable = ['competency_id', 'level_value', 'descriptor'];

    protected $casts = ['level_value' => 'integer'];

    public function competency(): BelongsTo
    {
        return $this->belongsTo(Competency::class);
    }
}
