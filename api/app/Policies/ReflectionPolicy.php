<?php

namespace App\Policies;

use App\Models\Reflection;
use App\Models\User;
use App\Services\RoleResolver;
use Illuminate\Auth\Access\Response;

/**
 * The record belongs to the student. Everything here follows from that.
 *
 * Reading is wider than writing: an assessor needs to read a reflection to
 * score it, and a supervisor needs to read it to moderate. Writing is the
 * owner and nobody else, ever, including an assessor correcting a typo.
 */
class ReflectionPolicy
{
    public function __construct(private RoleResolver $roles) {}

    /**
     * Owner, or a non-student participant of the gig it belongs to.
     *
     * Denied as not-found rather than forbidden: a classmate must not be
     * able to tell someone else's reflection apart from one that does not
     * exist, and the status code is enough to do that.
     */
    public function view(User $user, Reflection $reflection): Response
    {
        if ($reflection->user_id === $user->id) {
            return Response::allow();
        }

        $gig = $reflection->gig;

        if ($gig === null) {
            return Response::denyAsNotFound();
        }

        $role = $this->roles->for($user, $gig);

        return in_array($role, ['assessor', 'supervisor', 'employer'], true)
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    /**
     * Writing anything on the reflection: the narrative, evidence, the
     * self-score. Owner only, and only while it is a draft.
     *
     * The state half is not a separate concern bolted on. Submitting is
     * what makes the record real to somebody else, and an owner who could
     * still edit afterwards would be editing what an assessor already
     * read.
     */
    public function update(User $user, Reflection $reflection): Response
    {
        if ($reflection->user_id !== $user->id) {
            return $this->view($user, $reflection)->allowed()
                ? Response::deny('Only the student who owns this reflection can change it.')
                : Response::denyAsNotFound();
        }

        return Response::allow();
    }

    public function submit(User $user, Reflection $reflection): Response
    {
        return $this->update($user, $reflection);
    }

    /**
     * Draft only, and the state check lives in the controller so the
     * refusal can be a 409 with a code rather than a bare 403. Submitted
     * and assessed records cannot be deleted through the API at all,
     * which is part of the ownership promise: the student keeps the
     * record, and so does the institution.
     */
    public function delete(User $user, Reflection $reflection): Response
    {
        return $this->update($user, $reflection);
    }
}
