<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Framework extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'frameworks';

    public $timestamps = false;

    protected $fillable = [
        'created_by', 'fw_key', 'version', 'name', 'is_active',
        'comment_required', 'evidence_required',
        'accepted_file_types', 'max_file_bytes',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'comment_required' => 'boolean',
        'evidence_required' => 'boolean',
        'accepted_file_types' => 'array',
        'max_file_bytes' => 'integer',
    ];

    public function competencies(): HasMany
    {
        return $this->hasMany(Competency::class)->orderBy('position');
    }

    public function reflections(): HasMany
    {
        return $this->hasMany(Reflection::class);
    }
}
