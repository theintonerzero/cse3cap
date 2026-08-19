<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreFrameworkAssignmentRequest;
use App\Models\Framework;
use App\Models\Gig;
use App\Services\FrameworkAssigner;
use App\Services\RoleResolver;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class FrameworkAssignmentController extends Controller
{
    public function __construct(
        private RoleResolver $roles,
        private FrameworkAssigner $assigner,
    ) {}

    /**
     * Which rubric a gig is scored against. The permission matrix gives
     * this to a supervisor or an employer, and to nobody else.
     *
     * A gig takes one rubric and the rule lives in FrameworkAssigner.
     * The unique index on (gig_id, framework_id) stays behind it as the
     * race backstop for the identical-rubric case, and surfaces as the
     * same DUPLICATE_ASSIGNMENT through the envelope.
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
