<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\GigResource;
use App\Models\Gig;
use App\Models\User;
use Illuminate\Contracts\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class GigController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();

        $gigs = Gig::query()
            ->whereHas('participants', fn ($q) => $q->where('user_id', $user->id))
            ->with([
                'sprints',
                'assignment.framework',
                'reflections' => $this->visibleReflections($user),
            ])
            ->orderBy('starts_on')
            ->get();

        return GigResource::collection($gigs);
    }

    public function show(Request $request, Gig $gig): GigResource
    {
        // GigPolicy decides, and denies as not-found rather than
        // forbidden. Authorisation lives in policies and nowhere else, so
        // there is no role check in this method to fall out of step with
        // it when reflections and scoring arrive.
        Gate::authorize('view', $gig);

        $gig->load([
            'sprints',
            'assignment.framework',
            'reflections' => $this->visibleReflections($request->user()),
            'participants.user',
        ]);

        return new GigResource($gig, withParticipants: true);
    }

    /**
     * Constrain the eager load to the reflections this caller is allowed
     * to see, which is what reflection_summary then counts.
     *
     * The permission matrix gives a student their own reflections and
     * nobody else's, while an assessor, supervisor or employer sees every
     * reflection on a gig they are on. Counting the gig's reflections
     * unconditionally, as the plan did, tells a student how many
     * reflections their classmates have written.
     *
     * Expressed as one constraint rather than a per-gig branch because
     * roles are per gig: the same person can be a student on one gig and
     * a supervisor on the next, and this endpoint returns both at once.
     * Scoping the query rather than the resource also means the rows are
     * never fetched, so there is nothing to leak by accident later.
     */
    private function visibleReflections(User $user): callable
    {
        return fn ($query) => $query->where(fn (Builder $group) => $group
            ->where('reflections.user_id', $user->id)
            ->orWhereExists(fn (Builder $sub) => $sub
                ->selectRaw('1')
                ->from('gig_participants')
                ->whereColumn('gig_participants.gig_id', 'reflections.gig_id')
                ->where('gig_participants.user_id', $user->id)
                ->whereIn('gig_participants.role', ['assessor', 'supervisor', 'employer'])));
    }
}
