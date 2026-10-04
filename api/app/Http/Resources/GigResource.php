<?php

namespace App\Http\Resources;

use App\Services\RoleResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GigResource extends JsonResource
{
    public static $wrap = null;

    public function __construct($resource, private bool $withParticipants = false)
    {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        $framework = $this->assignment?->framework;

        $data = [
            'id' => $this->id,
            'title' => $this->title,
            'org_name' => $this->org_name,
            'starts_on' => $this->starts_on?->toDateString(),
            'ends_on' => $this->ends_on?->toDateString(),
            'my_role' => app(RoleResolver::class)->for($request->user(), $this->resource),
            'sprints' => $this->sprints->map(fn ($s) => [
                'id' => $s->id,
                'ordinal' => $s->ordinal,
                'opens_on' => $s->opens_on?->toDateString(),
                'due_on' => $s->due_on?->toDateString(),
            ])->values(),
            'framework' => $framework ? [
                'id' => $framework->id,
                'fw_key' => $framework->fw_key,
                'name' => $framework->name,
                'version' => $framework->version,
            ] : null,
            'reflection_summary' => [
                'draft' => $this->reflections->where('status', 'draft')->count(),
                'submitted' => $this->reflections->where('status', 'submitted')->count(),
                'assessed' => $this->reflections->where('status', 'assessed')->count(),
            ],
        ];

        // Only the single-gig endpoint returns participants. Do not use
        // array_filter to strip the key when absent: a gig with no
        // org_name or no dates would lose those keys too, and the
        // frontend types are generated from a fixed shape.
        //
        // One row per person, with the role RoleResolver answers (ADR #47).
        // gig_participants can hold two rows for one person, and listing
        // both would show a student as reviewing their own gig.
        if ($this->withParticipants) {
            $roles = app(RoleResolver::class);
            $data['participants'] = $this->participants->unique('user_id')->map(fn ($p) => [
                'id' => $p->user_id,
                'display_name' => $p->user->display_name,
                'role' => $roles->for($p->user, $this->resource),
            ])->values();
        }

        return $data;
    }
}
