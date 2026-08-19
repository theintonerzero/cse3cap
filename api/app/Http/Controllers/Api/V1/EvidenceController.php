<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEvidenceRequest;
use App\Models\Evidence;
use App\Models\ReflectionEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

class EvidenceController extends Controller
{
    /**
     * A link or a file, both attached to one entry.
     *
     * The type and size limits come from the framework rather than from
     * config, because they are the rubric's policy: one gig may accept a
     * screenshot and another may want a PDF.
     */
    public function store(StoreEvidenceRequest $request, ReflectionEntry $entry): JsonResponse
    {
        $reflection = $entry->reflection;

        Gate::authorize('update', $reflection);
        $this->assertDraft($reflection->status);

        $evidence = $request->hasFile('file')
            ? $this->storeFile($request->file('file'), $entry, $request->validated('label'), $reflection->framework)
            : $entry->evidence()->create([
                'kind' => 'link',
                'label' => $request->validated('label'),
                'uri' => $request->validated('uri'),
            ]);

        return response()->json([
            'id' => $evidence->id,
            'reflection_entry_id' => $evidence->reflection_entry_id,
            'kind' => $evidence->kind,
            'label' => $evidence->label,
            'uri' => $evidence->uri,
            'size_bytes' => $evidence->size_bytes,
            'uploaded_at' => $evidence->uploaded_at,
        ], 201);
    }

    public function destroy(Evidence $evidence): JsonResponse
    {
        $reflection = $evidence->entry->reflection;

        Gate::authorize('update', $reflection);
        $this->assertDraft($reflection->status);

        $evidence->delete();

        return response()->json(null, 204);
    }

    private function storeFile(UploadedFile $file, ReflectionEntry $entry, string $label, $framework): Evidence
    {
        $accepted = $framework->accepted_file_types;
        $extension = strtolower($file->getClientOriginalExtension());

        // Null means the rubric has not restricted anything. An empty
        // list would mean "nothing is acceptable", which is a different
        // statement and one nobody has asked for.
        if (is_array($accepted) && ! in_array($extension, array_map('strtolower', $accepted), true)) {
            throw new ApiException(
                'FILE_TYPE_NOT_ACCEPTED',
                'This rubric does not accept that file type.',
                ['extension' => $extension, 'accepted' => $accepted],
                400,
            );
        }

        if ($file->getSize() > $framework->max_file_bytes) {
            throw new ApiException(
                'FILE_TOO_LARGE',
                'That file is larger than this rubric allows.',
                ['size_bytes' => $file->getSize(), 'max_file_bytes' => $framework->max_file_bytes],
                400,
            );
        }

        // Through the filesystem abstraction, so moving to S3 later is
        // configuration rather than code. Filed per entry so an entry's
        // evidence stays together on disk.
        $path = Storage::disk('local')->putFile("evidence/{$entry->id}", $file);

        return $entry->evidence()->create([
            'kind' => str_starts_with((string) $file->getMimeType(), 'image/') ? 'image' : 'file',
            'label' => $label,
            'uri' => $path,
            'size_bytes' => $file->getSize(),
        ]);
    }

    private function assertDraft(string $status): void
    {
        if ($status === 'draft') {
            return;
        }

        throw new ApiException(
            'NOT_DRAFT',
            'This reflection has been submitted and its evidence can no longer be changed.',
            ['status' => $status],
            409,
        );
    }
}
