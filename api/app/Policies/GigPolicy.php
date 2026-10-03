<?php

namespace App\Policies;

use App\Models\Gig;
use App\Models\User;
use App\Services\RoleResolver;
use Illuminate\Auth\Access\Response;

/**
 * Authorisation for gigs lives here, not in the controller.
 *
 * The matrix in docs/API-Specification.md section 11 decides each method.
 * Every participant can see the gig. Writing a reflection on it is the
 * student's, and choosing its rubric is the supervisor's. Anyone not on the
 * gig gets 404 from all three, never 403.
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
     * Which rubric this gig is scored against. Supervisor only, same as
     * the matrix row. The supervisor is the educator (ADR #17), and
     * choosing the rubric is part of the framework boundary that ADR #17
     * keeps from employers, who are external to the university (ADR #48).
     * Everyone else on the gig can see it, so they get 403, not 404.
     */
    public function assignFramework(User $user, Gig $gig): Response
    {
        $role = $this->roles->for($user, $gig);

        if ($role === null) {
            return Response::denyAsNotFound();
        }

        return $role === 'supervisor'
            ? Response::allow()
            : Response::deny('Only a supervisor can assign this gig\'s framework.');
    }
}
