<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreFrameworkAssignmentRequest;
use App\Models\Framework;
use App\Models\Gig;
use App\Services\FrameworkAssigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class FrameworkAssignmentController extends Controller
{
    public function __construct(
        private FrameworkAssigner $assigner,
    ) {}

    /**
     * Which rubric a gig is scored against. The permission matrix gives
     * this to a supervisor or an employer, and to nobody else.
     *
     * A gig takes one rubric. ak_fw_assignments enforces it and
     * FrameworkAssigner explains it; both surface as the same
     * DUPLICATE_ASSIGNMENT through the envelope.
     */
    public function store(StoreFrameworkAssignmentRequest $request): JsonResponse
    {
        $gig = Gig::findOrFail($request->validated('gig_id'));

        Gate::authorize('assignFramework', $gig);

        $framework = Framework::findOrFail($request->validated('framework_id'));

        $assignment = $this->assigner->assign($gig, $framework, $request->user());

        return response()->json([
            'id' => $assignment->id,
            'gig_id' => $assignment->gig_id,
            'framework_id' => $assignment->framework_id,
            'assigned_by' => $assignment->assigned_by,
            'assigned_at' => $assignment->assigned_at,
        ], 201);
    }
}
