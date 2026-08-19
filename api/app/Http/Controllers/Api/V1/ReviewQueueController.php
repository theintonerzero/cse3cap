<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Reflection;
use Illuminate\Contracts\Database\Query\Builder;
use Illuminate\Http\Request;

class ReviewQueueController extends Controller
{
    /**
     * Submitted reflections on the caller's gigs that the caller has not
     * scored yet.
     *
     * "Awaiting the caller's score" rather than "awaiting any score",
     * because a gig can have both an assessor and a supervisor and each
     * has their own queue. A reflection one of them has scored is still
     * work for the other.
     *
     * @return array<int, array<string, mixed>>
     */
    public function index(Request $request): array
    {
        $user = $request->user();

        $reflections = Reflection::query()
            ->where('status', 'submitted')
            ->whereExists(fn (Builder $sub) => $sub
                ->selectRaw('1')
                ->from('gig_participants')
                ->whereColumn('gig_participants.gig_id', 'reflections.gig_id')
                ->where('gig_participants.user_id', $user->id)
                ->whereIn('gig_participants.role', ['assessor', 'supervisor', 'employer']))
            ->whereHas('entries', fn ($q) => $q->whereDoesntHave(
                'scores',
                fn ($s) => $s->where('scorer_user_id', $user->id),
            ))
            ->with(['owner', 'gig', 'sprint', 'entries.scores'])
            ->orderBy('submitted_at')
            ->get();

        return $reflections->map(function (Reflection $reflection) use ($user) {
            $total = $reflection->entries->count();
            $done = $reflection->entries
                ->filter(fn ($e) => $e->scores->contains('scorer_user_id', $user->id))
                ->count();

            return [
                'reflection_id' => $reflection->id,
                'student' => [
                    'id' => $reflection->owner->id,
                    'display_name' => $reflection->owner->display_name,
                ],
                'gig_id' => $reflection->gig_id,
                'gig_title' => $reflection->gig?->title,
                'sprint_id' => $reflection->sprint_id,
                'sprint_ordinal' => $reflection->sprint?->ordinal,
                'submitted_at' => $reflection->submitted_at,
                // What the worklist shows on each row: how far through
                // this reflection the caller personally is.
                'progress' => [
                    'scored_by_me' => $done,
                    'entries' => $total,
                ],
            ];
        })->values()->all();
    }
}
