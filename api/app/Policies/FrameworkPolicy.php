<?php

namespace App\Policies;

use App\Models\Framework;
use App\Models\User;
use App\Services\RoleResolver;
use Illuminate\Auth\Access\Response;

/**
 * Frameworks are readable by everyone and writable by almost nobody.
 *
 * Who may change or delete one is decided here rather than in the
 * controllers that need it: it has to be your own copy, and a seeded base
 * template is nobody's.
 *
 * Whether it may change at all is not a permission. A framework in use is
 * read-only, and one assigned to a gig is never deleted, for its owner as
 * much as for anyone (FrameworkEditing). Every reflection snapshots the
 * framework version it was scored against, and that snapshot is only
 * meaningful if the thing it points at cannot change underneath it.
 */
class FrameworkPolicy
{
    public function __construct(private RoleResolver $roles) {}

    /**
     * Reading a rubric is not sensitive. A student needs the descriptors
     * to score themselves and an assessor needs them to counter-score.
     */
    public function view(User $user, Framework $framework): bool
    {
        return true;
    }

    /**
     * Copying is the only way to create one, and only an educator does it.
     */
    public function create(User $user): Response
    {
        return $this->roles->holdsAnywhere($user, ['supervisor'])
            ? Response::allow()
            : Response::deny('Only a supervisor can create a framework copy.');
    }

    /**
     * Applies to the framework and, through it, to its competencies and
     * levels. Editing a descriptor is editing the framework.
     */
    public function update(User $user, Framework $framework): Response
    {
        if ($framework->created_by !== $user->id) {
            return Response::deny(
                $framework->created_by === null
                    ? 'That is a seeded base template. Copy it, then edit the copy.'
                    : 'That framework belongs to someone else. Copy it, then edit the copy.'
            );
        }

        return Response::allow();
    }

    /**
     * Your own copy, and you still supervise a gig (ADR #59). The second
     * test is create's, asked rather than retyped: deleting a copy is
     * undoing one, and somebody who could not make a copy now should not
     * be able to remove one either.
     */
    public function delete(User $user, Framework $framework): Response
    {
        if ($framework->created_by !== $user->id) {
            return Response::deny(
                $framework->created_by === null
                    ? 'That is a seeded base template, and a template is never deleted.'
                    : 'That framework belongs to someone else. Only the person who made a copy can delete it.'
            );
        }

        return $this->create($user)->allowed()
            ? Response::allow()
            : Response::deny('Only a supervisor can delete a framework copy.');
    }
}
