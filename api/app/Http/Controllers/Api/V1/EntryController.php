<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateEntryRequest;
use App\Models\ReflectionEntry;
use Illuminate\Support\Facades\Gate;

class EntryController extends Controller
{
    /**
     * The autosave endpoint. Owner only, draft only.
     *
     * The draft check is a 409 rather than a 403 because the caller is
     * allowed to be here; the record has simply moved past the point
     * where it can change. That distinction is what the status codes are
     * for, and it is the difference between "you may not" and "not now".
     *
     * @return array<string, mixed>
     */
    public function update(UpdateEntryRequest $request, ReflectionEntry $entry): array
    {
        $reflection = $entry->reflection;

        Gate::authorize('update', $reflection);
        $this->assertDraft($reflection->status);

        $entry->update($request->validated());

        return [
            'id' => $entry->id,
            'reflection_id' => $entry->reflection_id,
            'competency_id' => $entry->competency_id,
            'narrative' => $entry->narrative,
            'updated_at' => $entry->updated_at,
        ];
    }

    private function assertDraft(string $status): void
    {
        if ($status === 'draft') {
            return;
        }

        throw new ApiException(
            'NOT_DRAFT',
            'This reflection has been submitted and can no longer be edited.',
            ['status' => $status],
            409,
        );
    }
}
