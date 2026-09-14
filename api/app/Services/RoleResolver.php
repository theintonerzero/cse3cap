<?php

namespace App\Services;

use App\Models\Gig;
use App\Models\GigParticipant;
use App\Models\User;

/**
 * The one place a role is decided. Roles are per gig, never global,
 * because the same person can be a student on one and an assessor on
 * another. A role is never read from the request: a client-supplied role
 * is a client-supplied permission.
 */
class RoleResolver
{
    /**
     * The roles that review somebody else's reflection: every participant
     * role except the student whose reflection it is.
     *
     * ADR #23 is the reason this is one list rather than three checks for
     * `assessor`. The permission matrix lets assessor, supervisor and
     * employer counter-score, and `v_calibration_gap` pivoting on
     * `scorer_role = 'assessor'` alone is the bug that ADR recorded: Dr Lee
     * is a supervisor on both seeded gigs and counter-scores on them, so a
     * narrower list is reachable in the demo, not a corner case.
     *
     * Seeing a reflection that is not yours and counter-scoring it are the
     * same population, which is why one constant serves both.
     *
     * @var list<string>
     */
    public const REVIEWER_ROLES = ['assessor', 'supervisor', 'employer'];

    /** @var array<string, string|null> */
    private array $memo = [];

    public function for(User $user, Gig $gig): ?string
    {
        $key = $user->id.':'.$gig->id;

        return $this->memo[$key] ??= $gig->participants()
            ->where('user_id', $user->id)
            ->value('role');
    }

    /**
     * Null means not a participant, which callers must treat as 404
     * rather than 403. The caller should not learn the gig exists.
     */
    public function isParticipant(User $user, Gig $gig): bool
    {
        return $this->for($user, $gig) !== null;
    }

    /**
     * Frameworks are not owned by a gig, so the question "may you build a
     * rubric" cannot be answered per gig. It is answered by whether the
     * caller supervises anything at all: an educator on one gig is an
     * educator, and the copy they make is theirs rather than the gig's.
     *
     * @param  list<string>  $roles
     */
    public function holdsAnywhere(User $user, array $roles): bool
    {
        return GigParticipant::query()
            ->where('user_id', $user->id)
            ->whereIn('role', $roles)
            ->exists();
    }
}
