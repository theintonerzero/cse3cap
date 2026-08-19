<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateCompetencyRequest;
use App\Models\Competency;
use App\Services\FrameworkEditing;
use Illuminate\Support\Facades\Gate;

/**
 * Renaming a competency is editing its framework, so it answers to the
 * framework's policy and the framework's in-use guard. Neither rule is
 * restated here.
 */
class CompetencyController extends Controller
{
    public function __construct(private FrameworkEditing $editing) {}

    /**
     * @return array<string, mixed>
     */
    public function update(UpdateCompetencyRequest $request, Competency $competency): array
    {
        $framework = $competency->framework;

        Gate::authorize('update', $framework);
        $this->editing->assertEditable($framework);

        $competency->update($request->validated());

        return [
            'id' => $competency->id,
            'framework_id' => $competency->framework_id,
            'code' => $competency->code,
            'name' => $competency->name,
            'short_label' => $competency->short_label,
            'category' => $competency->category,
            'position' => $competency->position,
        ];
    }
}
