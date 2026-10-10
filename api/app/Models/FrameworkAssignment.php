<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FrameworkAssignment extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'framework_assignments';

    public const CREATED_AT = 'assigned_at';

    public const UPDATED_AT = null;

    protected $fillable = ['framework_id', 'gig_id', 'assigned_by'];

    protected $casts = ['assigned_at' => 'datetime'];

    public function framework(): BelongsTo
    {
        return $this->belongsTo(Framework::class);
    }

    public function gig(): BelongsTo
    {
        return $this->belongsTo(Gig::class);
    }
}
