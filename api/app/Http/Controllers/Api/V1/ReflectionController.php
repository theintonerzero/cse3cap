<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreReflectionRequest;
use App\Http\Resources\ReflectionDetailResource;
use App\Http\Resources\ReflectionResource;
use App\Models\Gig;
use App\Models\Reflection;
use App\Services\EventLog;
use App\Services\ReflectionCreator;
use App\Services\RoleResolver;
use App\Services\SubmitGate;
use Illuminate\Contracts\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class ReflectionController extends Controller
{
    public function __construct(
        private RoleResolver $roles,
        private ReflectionCreator $creator,
        private SubmitGate $gate,
        private EventLog $events,
    ) {}

    /**
     * Reflections the caller may see, newest first.
     *
     * Scoped the same way GET /gigs scopes its counts: a student sees
     * their own, everyone else sees every reflection on the gigs they are
     * on. Done in the query rather than after it, so the rows nobody may
     * read are never loaded.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();

        $reflections = Reflection::query()
            ->where(fn (Builder $visible) => $visible
                ->where('reflections.user_id', $user->id)
                ->orWhereExists(fn (Builder $sub) => $sub
                    ->selectRaw('1')
                    ->from('gig_participants')
                    ->whereColumn('gig_participants.gig_id', 'reflections.gig_id')
                    ->where('gig_participants.user_id', $user->id)
                    ->whereIn('gig_participants.role', ['assessor', 'supervisor', 'employer'])))
            ->when($request->query('gig_id'), fn ($q, $id) => $q->where('gig_id', $id))
            ->when($request->query('sprint_id'), fn ($q, $id) => $q->where('sprint_id', $id))
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->with('sprint')
            ->orderByDesc('created_at')
            ->get();

        return ReflectionResource::collection($reflections);
    }

    public function store(StoreReflectionRequest $request): JsonResponse
    {
        $reflection = $this->creator->create(
            $request->user(),
            $request->validated('gig_id'),
            $request->validated('sprint_id'),
        );

        return (new ReflectionDetailResource($this->loadDetail($reflection)))
            ->response()->setStatusCode(201);
    }

    public function show(Reflection $reflection): ReflectionDetailResource
    {
        Gate::authorize('view', $reflection);

        return new ReflectionDetailResource($this->loadDetail($reflection));
    }

    /**
     * The gate lives in SubmitGate and is called from here and nowhere
     * else, which is what stops it drifting into a second half-copy in
     * the frontend or in a validation rule.
     */
    public function submit(Request $request, Reflection $reflection): ReflectionDetailResource
    {
        Gate::authorize('submit', $reflection);

        $submitted = $this->gate->submit($reflection, $request->user());

        return new ReflectionDetailResource($this->loadDetail($submitted));
    }

    /**
     * Draft only. A submitted or assessed record cannot be deleted
     * through the API at all: somebody else has read it by then, and the
     * RESTRICT constraints on user_id and gig_id exist so that the record
     * outlives the gig rather than being tidied away with it.
     */
    public function destroy(Reflection $reflection): JsonResponse
    {
        Gate::authorize('delete', $reflection);

        if ($reflection->status !== 'draft') {
            throw new ApiException(
                'NOT_DRAFT',
                'A submitted reflection is part of the record and cannot be deleted.',
                ['status' => $reflection->status],
                409,
            );
        }

        $reflection->delete();

        return response()->json(null, 204);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function events(Reflection $reflection): array
    {
        Gate::authorize('view', $reflection);

        return $reflection->events()->with('actor')->get()->map(fn ($event) => [
            'id' => $event->id,
            'event_type' => $event->event_type,
            'actor_display_name' => $event->actor?->display_name,
            'occurred_at' => $event->occurred_at,
            'metadata' => (object) ($event->metadata ?? []),
        ])->all();
    }

    private function loadDetail(Reflection $reflection): Reflection
    {
        return $reflection->load([
            'owner',
            'entries.competency',
            'entries.evidence',
            'entries.scores.level',
            'entries.scores.scorer',
        ]);
    }
}
