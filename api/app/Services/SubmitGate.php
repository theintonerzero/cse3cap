<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Reflection;
use App\Models\ReflectionEntry;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The submit gate. This is the only implementation, and submit is the only
 * endpoint that calls it.
 *
 * It refuses on the first rule that fails rather than collecting all of
 * them, because the stepper sends the student to the offending entries and
 * one clear instruction beats three at once. Every refusal names the
 * entries in details.entry_ids so the UI can mark them.
 */
class SubmitGate
{
    public function __construct(private EventLog $events) {}

    public function submit(Reflection $reflection, User $actor): Reflection
    {
        if ($reflection->status !== 'draft') {
            throw new ApiException(
                'NOT_DRAFT',
                'This reflection has already been submitted.',
                ['status' => $reflection->status],
                409,
            );
        }

        $reflection->load(['entries.scores', 'entries.evidence', 'framework']);
        $entries = $reflection->entries;

        $blank = $entries->filter(fn ($e) => trim((string) $e->narrative) === '');
        if ($blank->isNotEmpty()) {
            $this->refuse('NARRATIVE_REQUIRED', 'Every competency needs something written before you can submit.', $blank);
        }

        $unscored = $entries->filter(
            fn ($e) => $e->scores->firstWhere('scorer_role', 'self') === null
        );
        if ($unscored->isNotEmpty()) {
            $this->refuse('SELF_SCORE_MISSING', 'Every competency needs a self-score before you can submit.', $unscored);
        }

        // Per framework, not global. La Trobe does not require evidence
        // and SFIA might, and the same student can be on both.
        if ($reflection->framework->evidence_required) {
            $unevidenced = $entries->filter(fn ($e) => $e->evidence->isEmpty());
            if ($unevidenced->isNotEmpty()) {
                $this->refuse('EVIDENCE_REQUIRED', 'This rubric requires evidence on every competency.', $unevidenced);
            }
        }

        return DB::transaction(function () use ($reflection, $actor) {
            $reflection->update([
                'status' => 'submitted',
                'submitted_at' => now(),
            ]);

            $this->events->record($reflection, $actor, 'reflection_submitted', [
                'entries' => $reflection->entries->count(),
            ]);

            return $reflection->fresh();
        });
    }

    /**
     * @param  Collection<int, ReflectionEntry>  $entries
     */
    private function refuse(string $code, string $message, $entries): never
    {
        throw new ApiException($code, $message, [
            'entry_ids' => $entries->pluck('id')->values()->all(),
        ], 400);
    }
}
