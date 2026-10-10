<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Sprint extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'sprints';

    public $timestamps = false;

    protected $fillable = ['gig_id', 'ordinal', 'opens_on', 'due_on'];

    protected $casts = [
        'ordinal' => 'integer',
        'opens_on' => 'date',
        'due_on' => 'date',
    ];

    public function gig(): BelongsTo
    {
        return $this->belongsTo(Gig::class);
    }
}
