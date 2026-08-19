<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreScoreRequest;
use App\Models\Level;
use App\Models\ReflectionEntry;
use App\Services\RoleResolver;
use App\Services\Scoring;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ScoreController extends Controller
{
    public function __construct(
        private Scoring $scoring,
        private RoleResolver $roles,
    ) {}

    /**
     * The student's own score. An upsert, because changing your mind
     * before submitting is part of reflecting rather than an edge case.
     */
    public function self(StoreScoreRequest $request, ReflectionEntry $entry): JsonResponse
    {
        $reflection = $entry->reflection;

        Gate::authorize('update', $reflection);

        if ($reflection->status !== 'draft') {
            throw new ApiException(
                'NOT_DRAFT',
                'This reflection has been submitted and its self-scores can no longer change.',
                ['status' => $reflection->status],
                409,
            );
        }

        $level = Level::findOrFail($request->validated('level_id'));
        $score = $this->scoring->selfScore($entry, $request->user(), $level);

        return response()->json($this->present($score->fresh(['level'])), 200);
    }

    /**
     * Everyone else's. An assessor, supervisor or employer on the gig.
     */
    public function store(StoreScoreRequest $request, ReflectionEntry $entry): JsonResponse
    {
        $reflection = $entry->reflection;
        $gig = $reflection->gig;

        // The reflection has to be visible before anything else is
        // considered, and invisible means 404 rather than 403.
        $role = $gig === null ? null : $this->roles->for($request->user(), $gig);

        if ($role === null) {
            throw new NotFoundHttpException;
        }

        // A student on the gig can see the reflection but has no business
        // scoring it, including their own.
        abort_if(! in_array($role, ['assessor', 'supervisor', 'employer'], true), 403);

        $level = Level::findOrFail($request->validated('level_id'));

        [$score, $completed] = $this->scoring->counterScore(
            $entry,
            $request->user(),
            $role,
            $level,
            $request->validated('comment'),
        );

        return response()->json(
            $this->present($score->fresh(['level'])) + [
                'reflection_status' => $reflection->fresh()->status,
                'completed_the_reflection' => $completed,
            ],
            201,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function present($score): array
    {
        return [
            'id' => $score->id,
            'reflection_entry_id' => $score->reflection_entry_id,
            'scorer_role' => $score->scorer_role,
            'scorer_class' => $score->scorer_role === 'self' ? 'self' : 'counter',
            'level_id' => $score->level_id,
            'level_value' => $score->level->level_value,
            'comment' => $score->comment,
            'scored_at' => $score->scored_at,
        ];
    }
}
