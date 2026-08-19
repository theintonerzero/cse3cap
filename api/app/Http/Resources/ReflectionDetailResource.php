<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The screen payload, for the student's stepper and the assessor's.
 *
 * Both roles get the same shape. What differs is what they may do with
 * it, and that is decided by policies rather than by hiding fields here:
 * an assessor needs to read the narrative to score it, and a student
 * needs to see the counter-score once it exists.
 */
class ReflectionDetailResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'status' => $this->status,
            'gig_id' => $this->gig_id,
            'sprint_id' => $this->sprint_id,
            'framework_id' => $this->framework_id,
            'framework_version' => $this->framework_version,
            'submitted_at' => $this->submitted_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'owner' => [
                'id' => $this->owner->id,
                'display_name' => $this->owner->display_name,
            ],
            'entries' => $this->entries->map(fn ($entry) => [
                'id' => $entry->id,
                'competency_id' => $entry->competency_id,
                'competency_code' => $entry->competency->code,
                'competency_name' => $entry->competency->name,
                'short_label' => $entry->competency->short_label,
                'position' => $entry->competency->position,
                'narrative' => $entry->narrative,
                'evidence' => $entry->evidence->map(fn ($item) => [
                    'id' => $item->id,
                    'kind' => $item->kind,
                    'label' => $item->label,
                    'uri' => $item->uri,
                    'size_bytes' => $item->size_bytes,
                    'uploaded_at' => $item->uploaded_at,
                ])->values(),
                'scores' => $entry->scores->map(fn ($score) => [
                    'id' => $score->id,
                    'scorer_role' => $score->scorer_role,
                    // self or counter. The radar draws one opposing
                    // polygon, not one per role, and the frontend should
                    // not have to know which roles count as which.
                    'scorer_class' => $score->scorer_role === 'self' ? 'self' : 'counter',
                    'level_id' => $score->level_id,
                    'level_value' => $score->level->level_value,
                    'comment' => $score->comment,
                    'scorer' => [
                        'id' => $score->scorer->id,
                        'display_name' => $score->scorer->display_name,
                    ],
                    'scored_at' => $score->scored_at,
                ])->sortBy('scored_at')->values(),
            ])->sortBy('position')->values(),
        ];
    }
}
