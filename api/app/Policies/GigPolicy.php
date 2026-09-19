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
     * Writing a reflection on this gig. The matrix row is "create own
     * reflection": student only. Every other participant can see the gig,
     * so they get 403. A reflection is a student's account of their own
     * work, and an assessor on the gig has none to write.
     *
     * On the gig rather than on Reflection, because the reflection does not
     * exist yet. The gig is resolved from the sprint first when only a
     * sprint is sent; see ReflectionCreator::resolveContext.
     */
    public function createReflection(User $user, Gig $gig): Response
    {
        $role = $this->roles->for($user, $gig);

        if ($role === null) {
            return Response::denyAsNotFound();
        }

        return $role === 'student'
            ? Response::allow()
            : Response::deny('Only a student on this gig can write a reflection on it.');
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
