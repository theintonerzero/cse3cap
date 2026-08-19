<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Framework;
use App\Models\FrameworkAssignment;
use App\Models\Gig;
use App\Models\User;

/**
 * One rubric per gig, and the message that explains the refusal.
 *
 * The rule itself is the database's: ak_fw_assignments is unique on
 * (gig_id) as of ADR #35, so a second assignment cannot be written even
 * if this check is somehow skipped, and two people assigning at once
 * cannot both win. What this adds is a refusal a person can act on. A
 * 1062 says a duplicate key value exists; this says which rubric the gig
 * already has, in details.framework_id, and why it matters.
 *
 * Both arrive as 409 DUPLICATE_ASSIGNMENT either way, so a client sees
 * one behaviour and does not have to know which layer caught it.
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
