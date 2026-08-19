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
}
