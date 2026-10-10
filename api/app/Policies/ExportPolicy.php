<?php

namespace App\Policies;

use App\Models\Export;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * An export is the student's own record leaving the system in one file.
 * Nobody else reads it, not an assessor and not a supervisor, because the
 * permission matrix gives export to "own" for every role.
 */
class ExportPolicy
{
    public function view(User $user, Export $export): Response
    {
        return $export->user_id === $user->id
            ? Response::allow()
            : Response::denyAsNotFound();
    }
}
