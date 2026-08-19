<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Framework;
use App\Models\Gig;
use App\Models\Reflection;
use App\Models\Sprint;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Everything that has to be true before a reflection exists.
 *
 * Context resolution is the fiddly part. The UI can start from a gig, or
 * from a sprint inside a gig, and a sprint already knows its gig, so
 * asking the client to send both would invite the two to disagree.
 */
class ReflectionCreator
{
    public function __construct(private EventLog $events) {}

    public function create(User $student, ?string $gigId, ?string $sprintId): Reflection
    {
        [$gig, $sprint] = $this->resolveContext($gigId, $sprintId);

        $role = app(RoleResolver::class)->for($student, $gig);

        // A reflection is a student's account of their own work. An
        // assessor on the gig has no reflection to write.
        abort_if($role === null, 404);
        abort_if($role !== 'student', 403);

        $framework = $this->frameworkFor($gig);

        return DB::transaction(function () use ($student, $gig, $sprint, $framework) {
            $reflection = Reflection::create([
                'user_id' => $student->id,
                'gig_id' => $gig->id,
                'sprint_id' => $sprint?->id,
                'framework_id' => $framework->id,
                // Snapshot, set once. The framework is frozen from this
                // moment, so the pair identifies exactly what was scored.
                'framework_version' => $framework->version,
                'status' => 'draft',
            ]);

            // One entry per competency, eagerly. The stepper needs to say
            // "3 of 6" before the student has written anything, and the
            // submit gate needs something to check emptiness against.
            $entries = $framework->competencies()
                ->orderBy('position')
                ->pluck('id')
                ->map(fn ($id) => ['competency_id' => $id])
                ->all();

            $reflection->entries()->createMany($entries);

            $this->events->record($reflection, $student, 'reflection_created', [
                'gig_id' => $gig->id,
                'sprint_id' => $sprint?->id,
                'framework_id' => $framework->id,
                'entries' => count($entries),
            ]);

            return $reflection;
        });
    }

    /**
     * @return array{Gig, Sprint|null}
     */
    private function resolveContext(?string $gigId, ?string $sprintId): array
    {
        if ($gigId === null && $sprintId === null) {
            throw new ApiException(
                'CONTEXT_REQUIRED',
                'A reflection needs a gig, a sprint, or both.',
                [],
                400,
            );
        }

        if ($sprintId !== null) {
            $sprint = Sprint::findOrFail($sprintId);

            // The sprint knows its gig. If the caller sent one too and it
            // disagrees, that is a bug in the client rather than a choice
            // to honour.
            if ($gigId !== null && $gigId !== $sprint->gig_id) {
                throw new ApiException(
                    'CONTEXT_REQUIRED',
                    'That sprint belongs to a different gig.',
                    ['sprint_gig_id' => $sprint->gig_id],
                    400,
                );
            }

            return [$sprint->gig, $sprint];
        }

        return [Gig::findOrFail($gigId), null];
    }

    private function frameworkFor(Gig $gig): Framework
    {
        $framework = $gig->assignment?->framework;

        if ($framework === null) {
            throw new ApiException(
                'FRAMEWORK_NOT_ASSIGNED',
                'This gig has no rubric assigned yet, so there is nothing to reflect against. Ask your supervisor to assign one.',
                ['gig_id' => $gig->id],
                400,
            );
        }

        return $framework;
    }
}
