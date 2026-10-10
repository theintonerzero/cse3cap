<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateLevelRequest;
use App\Models\Level;
use App\Services\FrameworkEditing;
use Illuminate\Support\Facades\Gate;

/**
 * Rewording a descriptor is editing the framework, and it is the edit
 * most likely to matter: the descriptor is the thing a student reads when
 * deciding what to score themselves.
 */
class LevelController extends Controller
{
    public function __construct(private FrameworkEditing $editing) {}

    /**
     * @return array<string, mixed>
     */
    public function update(UpdateLevelRequest $request, Level $level): array
    {
        $framework = $level->competency->framework;

        Gate::authorize('update', $framework);
        $this->editing->assertEditable($framework);

        $level->update($request->validated());

        return [
            'id' => $level->id,
            'competency_id' => $level->competency_id,
            'level_value' => $level->level_value,
            'descriptor' => $level->descriptor,
        ];
    }
}
