<?php

namespace App\Jobs;

use App\Models\Export;
use App\Models\Reflection;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Builds the file behind an export request.
 *
 * The exports row is the job record, which is why status lives on it as a
 * column rather than being inferred. A job that throws leaves no
 * completion time and no file, and without a stored status a failed
 * export is indistinguishable from a slow one, so the frontend polls for
 * ever. See ADR #25.
 */
class BuildExport implements ShouldQueue
{
    use Queueable;

    public function __construct(public string $exportId) {}

    public function handle(): void
    {
        $export = Export::find($this->exportId);

        if ($export === null || $export->status !== 'pending') {
            return;
        }

        try {
            $payload = $this->assemble($export);
            $path = "exports/{$export->user_id}/{$export->id}.json";

            Storage::disk('local')->put(
                $path,
                json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            );

            $export->update([
                'status' => 'complete',
                'uri' => $path,
                'summary' => $payload['summary'],
                'completed_at' => now(),
            ]);
        } catch (Throwable $e) {
            // Recorded rather than swallowed. The row is what the student
            // is looking at, so it has to say the export failed even
            // though the reason belongs in the queue log.
            $export->update(['status' => 'failed']);

            throw $e;
        }
    }

    /**
     * The record itself: every reflection in scope, with its narratives,
     * evidence and both sides of every score.
     *
     * @return array<string, mixed>
     */
    private function assemble(Export $export): array
    {
        $reflections = Reflection::query()
            ->where('user_id', $export->user_id)
            ->when($export->reflection_id, fn ($q, $id) => $q->where('id', $id))
            ->with([
                'gig', 'sprint', 'framework',
                'entries.competency', 'entries.evidence',
                'entries.scores.level', 'entries.scores.scorer',
            ])
            ->orderBy('created_at')
            ->get();

        $scores = 0;
        $files = 0;

        $body = $reflections->map(function (Reflection $reflection) use (&$scores, &$files) {
            return [
                'id' => $reflection->id,
                'status' => $reflection->status,
                'gig' => $reflection->gig?->title,
                'sprint_ordinal' => $reflection->sprint?->ordinal,
                'framework' => [
                    'fw_key' => $reflection->framework->fw_key,
                    // The snapshot, not the framework's current version.
                    // What this record was scored against is the point.
                    'version' => $reflection->framework_version,
                    'name' => $reflection->framework->name,
                ],
                'submitted_at' => $reflection->submitted_at?->toIso8601ZuluString(),
                'entries' => $reflection->entries->sortBy(fn ($e) => $e->competency->position)
                    ->map(function ($entry) use (&$scores, &$files) {
                        $scores += $entry->scores->count();
                        $files += $entry->evidence->count();

                        return [
                            'competency_code' => $entry->competency->code,
                            'competency_name' => $entry->competency->name,
                            'narrative' => $entry->narrative,
                            'evidence' => $entry->evidence->map(fn ($ev) => [
                                'kind' => $ev->kind,
                                'label' => $ev->label,
                                'uri' => $ev->uri,
                            ])->values(),
                            'scores' => $entry->scores->map(fn ($score) => [
                                'scorer_role' => $score->scorer_role,
                                'scorer_class' => $score->scorer_role === 'self' ? 'self' : 'counter',
                                'scorer' => $score->scorer->display_name,
                                'level_value' => $score->level->level_value,
                                'comment' => $score->comment,
                                'scored_at' => $score->scored_at?->toIso8601ZuluString(),
                            ])->values(),
                        ];
                    })->values(),
            ];
        })->values();

        return [
            'exported_at' => now()->toIso8601ZuluString(),
            'format' => $export->format,
            'summary' => [
                'reflections' => $reflections->count(),
                'sprints' => $reflections->pluck('sprint_id')->filter()->unique()->count(),
                'scores' => $scores,
                'files' => $files,
            ],
            'reflections' => $body,
        ];
    }
}
