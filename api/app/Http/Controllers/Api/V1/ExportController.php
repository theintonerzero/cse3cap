<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreExportRequest;
use App\Jobs\BuildExport;
use App\Models\Export;
use App\Models\Reflection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ExportController extends Controller
{
    /**
     * Request the record as a file. The row is created first and the job
     * queued after, so there is always something to poll even if the
     * worker is down.
     */
    public function store(StoreExportRequest $request): JsonResponse
    {
        $reflectionId = $request->validated('reflection_id');

        // Null means the whole record. A named reflection has to be the
        // caller's own, and saying "not found" rather than "not yours"
        // keeps the two indistinguishable.
        if ($reflectionId !== null) {
            $reflection = Reflection::findOrFail($reflectionId);

            if ($reflection->user_id !== $request->user()->id) {
                abort(404);
            }
        }

        $export = Export::create([
            'user_id' => $request->user()->id,
            'reflection_id' => $reflectionId,
            'format' => $request->validated('format'),
            'status' => 'pending',
        ]);

        BuildExport::dispatch($export->id);

        // 202, and the status is whatever the row actually says. On the
        // sync queue the job has already run by now and it reads
        // "complete"; on a real worker it reads "pending". Reporting the
        // truth either way means the poll loop terminates in both.
        return response()->json($this->present($export->fresh()), 202);
    }

    public function show(Export $export): JsonResponse
    {
        Gate::authorize('view', $export);

        return response()->json($this->present($export));
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function index(Request $request): array
    {
        return Export::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('requested_at')
            ->get()
            ->map(fn (Export $export) => $this->present($export))
            ->all();
    }

    public function download(Export $export): StreamedResponse
    {
        Gate::authorize('view', $export);

        if ($export->status !== 'complete' || $export->uri === null) {
            throw new ApiException(
                'NOT_FOUND',
                $export->status === 'failed'
                    ? 'That export failed and has no file. Request another.'
                    : 'That export is still being built.',
                ['status' => $export->status],
                404,
            );
        }

        $disk = Storage::disk('local');

        if (! $disk->exists($export->uri)) {
            throw new ApiException(
                'NOT_FOUND',
                'The file for that export is no longer on disk.',
                ['status' => $export->status],
                404,
            );
        }

        return $disk->download(
            $export->uri,
            "reflection-diary-{$export->id}.{$export->format}",
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function present(Export $export): array
    {
        return [
            'id' => $export->id,
            'format' => $export->format,
            'status' => $export->status,
            'reflection_id' => $export->reflection_id,
            'summary' => $export->summary === null ? null : (object) $export->summary,
            'requested_at' => $export->requested_at,
            'completed_at' => $export->completed_at,
            // The stored path, not a signed link. Downloading goes through
            // the API so the policy runs on every fetch rather than once.
            'uri' => $export->uri,
        ];
    }
}
