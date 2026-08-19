<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

class FrameworkDetailResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        // The scale is computed from the level rows by v_framework_scale
        // rather than stored on the framework, because a SFIA skill is
        // valid over only part of the seven-point scale. Read the view;
        // do not aggregate in PHP.
        $scale = DB::table('v_framework_scale')->where('framework_id', $this->id)->first();

        return [
            'id' => $this->id,
            'fw_key' => $this->fw_key,
            'version' => $this->version,
            'name' => $this->name,
            'created_by' => $this->created_by,
            'in_use' => (bool) $this->reflections_exists,
            'comment_required' => (bool) $this->comment_required,
            'evidence_required' => (bool) $this->evidence_required,
            'accepted_file_types' => $this->accepted_file_types,
            'max_file_bytes' => (int) $this->max_file_bytes,
            'scale' => [
                'min' => (int) ($scale->scale_min ?? 0),
                'max' => (int) ($scale->scale_max ?? 0),
            ],
            'competencies' => $this->competencies->map(fn ($c) => [
                'id' => $c->id,
                'code' => $c->code,
                'name' => $c->name,
                'short_label' => $c->short_label,
                'category' => $c->category,
                'position' => $c->position,
                'levels' => $c->levels->map(fn ($l) => [
                    'id' => $l->id,
                    'level_value' => $l->level_value,
                    'descriptor' => $l->descriptor,
                ])->values(),
            ])->values(),
        ];
    }
}
