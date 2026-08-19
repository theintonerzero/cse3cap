<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MeResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'display_name' => $this->display_name,
            'participations' => $this->participations->map(fn ($p) => [
                'gig_id' => $p->gig_id,
                'gig_title' => $p->gig->title,
                'role' => $p->role,
            ])->values(),
        ];
    }
}
