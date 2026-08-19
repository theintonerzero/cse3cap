<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Framework;
use App\Models\Reflection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Thin wrappers over the SQL views. Every number on this page is computed
 * by MySQL and pivoted here at most; nothing is aggregated in PHP.
 *
 * All four endpoints are about the caller's own record. There is no way to
 * ask for someone else's analytics, which is why none of them takes a user
 * id: the permission matrix gives every role "own" and nothing wider.
 */
class AnalyticsController extends Controller
{
    /**
     * Self against counter, per competency.
     *
     * Scope mirrors the UI. A sprint gives that sprint's true comparison;
     * a gig gives the latest score per competency within it; neither
     * gives the latest across the record.
     *
     * That last case needs a framework picked for it, because a student
     * on two gigs can be scored against two different rubrics whose
     * competency codes do not overlap at all, and a radar drawn across
     * both would have twelve axes and mean nothing. The framework of the
     * most recent reflection wins, and the response says which.
     *
     * @return array<string, mixed>
     */
    public function radar(Request $request): array
    {
        $user = $request->user();
        $gigId = $request->query('gig_id');
        $sprintId = $request->query('sprint_id');

        $framework = $this->frameworkInScope($request, $gigId, $sprintId);

        $bindings = [$user->id, $framework->fw_key];
        $filter = '';

        if ($gigId !== null) {
            $filter .= ' AND vr.gig_id = ?';
            $bindings[] = $gigId;
        }

        if ($sprintId !== null) {
            $filter .= ' AND vr.sprint_id = ?';
            $bindings[] = $sprintId;
        }

        // The latest score per competency per class. v_entry_score has
        // already decided which counter-score counts within an entry;
        // this decides which entry counts across reflections.
        $rows = DB::select("
            SELECT competency_code, scorer_class, scorer_role, level_value
            FROM (
                SELECT vr.competency_code, vr.scorer_class, vr.scorer_role, vr.level_value,
                       ROW_NUMBER() OVER (
                           PARTITION BY vr.competency_code, vr.scorer_class
                           ORDER BY refl.created_at DESC, vr.reflection_id DESC
                       ) AS rn
                FROM v_radar vr
                JOIN reflections refl ON refl.id = vr.reflection_id
                WHERE vr.user_id = ?
                  AND vr.framework_key = ?
                  AND vr.scorer_class IS NOT NULL
                  {$filter}
            ) ranked
            WHERE rn = 1
        ", $bindings);

        $scored = [];
        foreach ($rows as $row) {
            $scored[$row->competency_code][$row->scorer_class] = $row;
        }

        // Every competency in the framework gets an axis, scored or not,
        // so the shape of the chart does not change as scores arrive.
        $axes = $framework->competencies()->orderBy('position')->get()->map(function ($competency) use ($scored) {
            $self = $scored[$competency->code]['self'] ?? null;
            $counter = $scored[$competency->code]['counter'] ?? null;

            return [
                'code' => $competency->code,
                'short_label' => $competency->short_label,
                'position' => $competency->position,
                'self' => $self?->level_value,
                'counter' => $counter?->level_value,
                'counter_role' => $counter?->scorer_role,
            ];
        })->values();

        $scale = DB::table('v_framework_scale')->where('framework_id', $framework->id)->first();

        return [
            'scope' => ['gig_id' => $gigId, 'sprint_id' => $sprintId],
            'framework' => [
                'id' => $framework->id,
                'fw_key' => $framework->fw_key,
                'scale_min' => (int) ($scale->scale_min ?? 0),
                'scale_max' => (int) ($scale->scale_max ?? 0),
            ],
            'axes' => $axes,
        ];
    }

    /**
     * The same two numbers per competency, but along the sprints of one
     * gig, which is what turns a snapshot into a trend.
     *
     * @return array<string, mixed>
     */
    public function progress(Request $request): array
    {
        $gigId = $this->requiredQuery($request, 'gig_id');

        $rows = DB::select('
            SELECT vr.competency_code,
                   vr.short_label,
                   vr.position,
                   s.ordinal AS sprint_ordinal,
                   MAX(CASE WHEN vr.scorer_class = \'self\'    THEN vr.level_value END) AS self_level,
                   MAX(CASE WHEN vr.scorer_class = \'counter\' THEN vr.level_value END) AS counter_level
            FROM v_radar vr
            JOIN sprints s ON s.id = vr.sprint_id
            WHERE vr.user_id = ? AND vr.gig_id = ?
            GROUP BY vr.competency_code, vr.short_label, vr.position, s.ordinal
            ORDER BY vr.position, s.ordinal
        ', [$request->user()->id, $gigId]);

        $competencies = [];
        foreach ($rows as $row) {
            $competencies[$row->competency_code] ??= [
                'code' => $row->competency_code,
                'short_label' => $row->short_label,
                'series' => [],
            ];

            $competencies[$row->competency_code]['series'][] = [
                'sprint_ordinal' => (int) $row->sprint_ordinal,
                'self' => $row->self_level === null ? null : (int) $row->self_level,
                'counter' => $row->counter_level === null ? null : (int) $row->counter_level,
            ];
        }

        return ['competencies' => array_values($competencies)];
    }

    /**
     * Self minus counter. A positive gap means the student rated
     * themselves higher than the person assessing them did, which is the
     * conversation the screen exists to start.
     *
     * @return array<int, array<string, mixed>>
     */
    public function calibration(Request $request): array
    {
        $gigId = $request->query('gig_id');

        $rows = DB::table('v_calibration_gap')
            ->where('user_id', $request->user()->id)
            ->when($gigId, fn ($q) => $q->where('gig_id', $gigId))
            ->orderBy('competency_code')
            ->get();

        return $rows->map(fn ($row) => [
            'competency_code' => $row->competency_code,
            'gig_id' => $row->gig_id,
            'sprint_id' => $row->sprint_id,
            'self_level' => $row->self_level === null ? null : (int) $row->self_level,
            'counter_level' => $row->counter_level === null ? null : (int) $row->counter_level,
            'counter_role' => $row->counter_role,
            'gap' => $row->gap === null ? null : (int) $row->gap,
        ])->values()->all();
    }

    /**
     * Competencies the caller has never been scored on.
     *
     * Scored rather than evidenced: evidence is optional per framework, so
     * requiring it would report gaps that are not gaps.
     *
     * @return array<int, array<string, mixed>>
     */
    public function coverage(Request $request): array
    {
        $frameworkId = $this->requiredQuery($request, 'framework_id');

        $rows = DB::table('v_coverage_gaps')
            ->where('user_id', $request->user()->id)
            ->where('framework_id', $frameworkId)
            ->orderBy('position')
            ->get();

        return $rows->map(fn ($row) => [
            'competency_code' => $row->competency_code,
            'name' => $row->name,
            'short_label' => $row->short_label,
            'position' => (int) $row->position,
        ])->values()->all();
    }

    private function frameworkInScope(Request $request, ?string $gigId, ?string $sprintId): Framework
    {
        $reflection = Reflection::query()
            ->where('user_id', $request->user()->id)
            ->when($gigId, fn ($q) => $q->where('gig_id', $gigId))
            ->when($sprintId, fn ($q) => $q->where('sprint_id', $sprintId))
            ->orderByDesc('created_at')
            ->with('framework')
            ->first();

        if ($reflection === null) {
            throw new ApiException(
                'NOT_FOUND',
                'There is nothing to chart yet. Write a reflection first.',
                ['gig_id' => $gigId, 'sprint_id' => $sprintId],
                404,
            );
        }

        return $reflection->framework;
    }

    private function requiredQuery(Request $request, string $key): string
    {
        $value = $request->query($key);

        if ($value === null || $value === '') {
            throw new ApiException(
                'VALIDATION_FAILED',
                "This endpoint needs a {$key}.",
                [$key => ['required']],
                400,
            );
        }

        return $value;
    }
}
