<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreFrameworkAssignmentRequest;
use App\Models\Framework;
use App\Models\FrameworkAssignment;
use App\Models\Gig;
use App\Services\RoleResolver;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class FrameworkAssignmentController extends Controller
{
    public function __construct(private RoleResolver $roles) {}

    /**
     * Which rubric a gig is scored against. The permission matrix gives
     * this to a supervisor or an employer, and to nobody else.
     *
     * A duplicate is caught by the unique index on (gig_id,
     * framework_id) rather than by a lookup first, so two people
     * assigning at once cannot both succeed. It surfaces as
     * DUPLICATE_ASSIGNMENT through the envelope.
     */
    public function store(StoreFrameworkAssignmentRequest $request): JsonResponse
    {
        $gig = Gig::findOrFail($request->validated('gig_id'));
        $role = $this->roles->for($request->user(), $gig);

        // Not a participant at all: 404, because the caller should not
        // learn the gig exists. A participant in the wrong role: 403,
        // because they can already see it.
        if ($role === null) {
            throw new NotFoundHttpException;
        }

        abort_if(! in_array($role, ['supervisor', 'employer'], true), 403);

        $framework = Framework::findOrFail($request->validated('framework_id'));

        $assignment = FrameworkAssignment::create([
            'gig_id' => $gig->id,
            'framework_id' => $framework->id,
            'assigned_by' => $request->user()->id,
        ]);

        return response()->json([
            'id' => $assignment->id,
            'gig_id' => $assignment->gig_id,
            'framework_id' => $assignment->framework_id,
            'assigned_by' => $assignment->assigned_by,
            'assigned_at' => $assignment->assigned_at,
        ], 201);
    }
}
