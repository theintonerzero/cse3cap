<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Framework;
use App\Models\FrameworkAssignment;
use App\Models\Gig;
use App\Models\User;

/**
 * One rubric per gig, and the guard that keeps it that way.
 *
 * The schema does not say this. ak_fw_assignments is unique on
 * (gig_id, framework_id), which stops the same rubric being assigned
 * twice and permits a second, different one. Nothing downstream is built
 * for that: Gig::assignment is a hasOne, the contract gives a gig one
 * framework object, and ReflectionCreator snapshots whichever framework
 * that relation resolves to. A gig carrying two assignments would hand
 * different rubrics to two students on the same gig with nothing on
 * screen to explain it.
 *
 * So the rule is enforced here, once, and see ADR #33 for why it is not
 * yet a UNIQUE (gig_id) constraint instead.
 */
class FrameworkAssigner
{
    public function assign(Gig $gig, Framework $framework, User $by): FrameworkAssignment
    {
        $existing = $gig->assignment;

        if ($existing !== null) {
            throw new ApiException(
                'DUPLICATE_ASSIGNMENT',
                $existing->framework_id === $framework->id
                    ? 'That framework is already assigned to this gig.'
                    : 'This gig already has a rubric, and a gig is scored against one. Copy the rubric you want and assign it to a new gig.',
                ['framework_id' => $existing->framework_id],
                409,
            );
        }

        return FrameworkAssignment::create([
            'gig_id' => $gig->id,
            'framework_id' => $framework->id,
            'assigned_by' => $by->id,
        ]);
    }
}
