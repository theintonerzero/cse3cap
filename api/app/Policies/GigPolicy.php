<?php

namespace App\Policies;

use App\Models\Gig;
use App\Models\User;
use App\Services\RoleResolver;
use Illuminate\Auth\Access\Response;

/**
 * Authorisation for gigs lives here, not in the controller.
 *
 * The matrix in docs/API-Specification.md section 11 gives every role
 * "their gigs" and nothing else. There is no capability on a gig that one
 * participant has and another does not, so this policy is one method; the
 * per-role distinctions start with reflections and scoring.
 */
class GigPolicy
{
    public function __construct(private RoleResolver $roles) {}

    /**
     * A non-participant gets 404, never 403. Not found and not yours are
     * deliberately indistinguishable, so the caller cannot use the status
     * code to discover which gigs exist.
     */
    public function view(User $user, Gig $gig): Response
    {
        return $this->roles->isParticipant($user, $gig)
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    /**
     * Which rubric this gig is scored against. Supervisor or employer,
     * same as the matrix row -- a student or an assessor can see the gig
     * but has no business changing what it is scored against.
     */
    public function assignFramework(User $user, Gig $gig): Response
    {
        $role = $this->roles->for($user, $gig);

        if ($role === null) {
            return Response::denyAsNotFound();
        }

        return in_array($role, ['supervisor', 'employer'], true)
            ? Response::allow()
            : Response::deny('Only a supervisor or employer can assign this gig\'s framework.');
    }
}
