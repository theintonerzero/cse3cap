<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreFrameworkRequest;
use App\Http\Requests\UpdateFrameworkRequest;
use App\Http\Resources\FrameworkDetailResource;
use App\Http\Resources\FrameworkResource;
use App\Models\Framework;
use App\Services\FrameworkEditing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class FrameworkController extends Controller
{
    public function __construct(private FrameworkEditing $editing) {}

    public function index(Request $request)
    {
        $frameworks = Framework::query()
            ->when($request->boolean('active'), fn ($q) => $q->where('is_active', true))
            ->withExists('reflections')
            ->orderBy('name')
            ->get();

        return FrameworkResource::collection($frameworks);
    }

    public function show(Framework $framework): FrameworkDetailResource
    {
        $framework->loadExists('reflections');
        $framework->load('competencies.levels');

        return new FrameworkDetailResource($framework);
    }

    /**
     * Copy-then-edit. There is no way to create a framework from nothing:
     * every rubric descends from a seeded base, so the axes stay
     * comparable across gigs and the radar means the same thing on every
     * screen.
     */
    public function store(StoreFrameworkRequest $request): JsonResponse
    {
        Gate::authorize('create', Framework::class);

        $base = Framework::findOrFail($request->validated('based_on_framework_id'));
        $copy = $this->editing->copy($base, $request->user(), $request->validated('name'));

        $copy->loadExists('reflections');
        $copy->load('competencies.levels');

        return (new FrameworkDetailResource($copy))->response()->setStatusCode(201);
    }

    public function update(UpdateFrameworkRequest $request, Framework $framework): FrameworkDetailResource
    {
        Gate::authorize('update', $framework);
        $this->editing->assertEditable($framework);

        $framework->update($request->validated());

        $framework->loadExists('reflections');
        $framework->load('competencies.levels');

        return new FrameworkDetailResource($framework);
    }
}
