<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The list shape. Enough to render a diary row and route to the stepper,
 * without loading every narrative in the gig.
 */
class ReflectionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'status' => $this->status,
            'gig_id' => $this->gig_id,
            'sprint_id' => $this->sprint_id,
            'sprint_ordinal' => $this->whenLoaded('sprint', fn () => $this->sprint?->ordinal),
            'framework_id' => $this->framework_id,
            'framework_version' => $this->framework_version,
            'submitted_at' => $this->submitted_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
