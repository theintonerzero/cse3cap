<?php

namespace App\Http\Resources;

use App\Services\RoleResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MeResource extends JsonResource
{
    public static $wrap = null;

    /**
     * One participation per gig, with the role RoleResolver decides. The nav
     * is built from these, so a person holding two roles on a gig must see
     * the one the policies act on (ADR #47), not a row for each.
     */
    public function toArray(Request $request): array
    {
        $roles = app(RoleResolver::class);

        return [
            'id' => $this->id,
            'display_name' => $this->display_name,
            'participations' => $this->participations->unique('gig_id')->map(fn ($p) => [
                'gig_id' => $p->gig_id,
                'gig_title' => $p->gig->title,
                'role' => $roles->for($this->resource, $p->gig),
            ])->values(),
        ];
    }
}
