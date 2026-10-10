<?php

namespace Tests\Feature;

use App\Exports\PdfRenderer;
use App\Jobs\BuildExport;
use App\Models\Export;
use App\Models\Gig;
use App\Models\Reflection;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoSeeder::class);
        Storage::fake('local');
    }

    private function user(string $name): User
    {
        return User::where('display_name', $name)->firstOrFail();
    }

    /** A submitted, counter-scored reflection, so the file has something in it. */
    private function assessedReflection(): Reflection
    {
        Sanctum::actingAs($this->user('Jane N'));
        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();

        $reflection = Reflection::findOrFail(
            $this->postJson('/api/v1/reflections', [
                'sprint_id' => $gig->sprints()->where('ordinal', 1)->firstOrFail()->id,
            ])->json('id')
        );

        foreach ($reflection->entries()->with('competency.levels')->get() as $entry) {
            $this->patchJson("/api/v1/entries/{$entry->id}", ['narrative' => 'Paired on the importer.']);
            $this->putJson("/api/v1/entries/{$entry->id}/scores/self", [
                'level_id' => $entry->competency->levels->firstWhere('level_value', 3)->id,
            ])->assertOk();
        }

        $this->postJson("/api/v1/entries/{$reflection->entries()->firstOrFail()->id}/evidence", [
            'kind' => 'link', 'label' => 'The pull request', 'uri' => 'https://example.org/pr/4',
        ])->assertStatus(201);

        $this->postJson("/api/v1/reflections/{$reflection->id}/submit")->assertOk();

        Sanctum::actingAs($this->user('Sam O'));
        foreach ($reflection->entries()->with('competency.levels')->get() as $entry) {
            $this->postJson("/api/v1/entries/{$entry->id}/scores", [
                'level_id' => $entry->competency->levels->firstWhere('level_value', 2)->id,
                'comment' => 'Good, with more to do on testing.',
            ])->assertStatus(201);
        }

        Sanctum::actingAs($this->user('Jane N'));

        return $reflection->fresh();
    }

    public function test_requesting_an_export_returns_202_and_something_to_poll(): void
    {
        $this->assessedReflection();

        $body = $this->postJson('/api/v1/exports', ['format' => 'json'])
            ->assertStatus(202)
            ->assertJsonStructure(['id', 'format', 'status', 'requested_at'])
            ->json();

        $this->assertSame('json', $body['format']);
        $this->assertContains($body['status'], ['pending', 'complete']);

        $this->getJson("/api/v1/exports/{$body['id']}")
            ->assertOk()
            ->assertJsonPath('status', 'complete')
            ->assertJsonPath('summary.reflections', 1)
            ->assertJsonPath('summary.scores', 12)
            ->assertJsonPath('summary.files', 1);
    }

    public function test_the_file_holds_the_record_including_both_sides_of_every_score(): void
    {
        $this->assessedReflection();

        $id = $this->postJson('/api/v1/exports', ['format' => 'json'])->json('id');
        $export = Export::findOrFail($id);

        $payload = json_decode(Storage::disk('local')->get($export->uri), true);

        $this->assertSame(1, $payload['summary']['reflections']);
        $reflection = $payload['reflections'][0];

        $this->assertSame('assessed', $reflection['status']);
        $this->assertSame('Develop AI use cases', $reflection['gig']);
        $this->assertSame('latrobe6', $reflection['framework']['fw_key']);
        $this->assertCount(6, $reflection['entries']);

        $entry = $reflection['entries'][0];
        $this->assertSame('Paired on the importer.', $entry['narrative']);
        $this->assertCount(2, $entry['scores'], 'the self-score and the counter-score both travel');
        $this->assertSame(['self', 'counter'], array_column($entry['scores'], 'scorer_class'));
        $this->assertSame('Good, with more to do on testing.', $entry['scores'][1]['comment']);
    }

    public function test_the_version_in_the_file_is_the_snapshot_not_the_current_one(): void
    {
        $reflection = $this->assessedReflection();

        // The framework is frozen once used, so this can only be done
        // behind the API. It proves the export reports what the student
        // was scored against rather than what the rubric says today.
        $reflection->framework->forceFill(['version' => 'v9'])->save();

        $id = $this->postJson('/api/v1/exports', ['format' => 'json'])->json('id');
        $payload = json_decode(Storage::disk('local')->get(Export::findOrFail($id)->uri), true);

        $this->assertSame('v1', $payload['reflections'][0]['framework']['version']);
    }

    public function test_the_file_carries_a_radar_per_reflection_from_the_view(): void
    {
        $reflection = $this->assessedReflection();
        $id = $this->postJson('/api/v1/exports', ['format' => 'json'])->json('id');

        $file = json_decode(Storage::disk('local')->get(Export::findOrFail($id)->uri), true);
        $radar = $file['reflections'][0]['radar'];

        $this->assertSame(1, $radar['scale_min']);
        $this->assertSame(4, $radar['scale_max']);
        $this->assertCount($reflection->entries()->count(), $radar['axes']);

        // Every axis was self-scored 3 and counter-scored 2 by Sam, an assessor.
        foreach ($radar['axes'] as $axis) {
            $this->assertSame(3, $axis['self']);
            $this->assertSame(2, $axis['counter']);
            $this->assertSame('assessor', $axis['counter_role']);
        }

        // Ordered by position, so the chart's shape is stable.
        $positions = array_column($radar['axes'], 'position');
        $sorted = $positions;
        sort($sorted);
        $this->assertSame($sorted, $positions);
    }

    public function test_one_reflection_can_be_exported_on_its_own(): void
    {
        $reflection = $this->assessedReflection();

        // A second reflection that must not appear.
        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        $this->postJson('/api/v1/reflections', [
            'sprint_id' => $gig->sprints()->where('ordinal', 2)->firstOrFail()->id,
        ])->assertStatus(201);

        $id = $this->postJson('/api/v1/exports', [
            'format' => 'json', 'reflection_id' => $reflection->id,
        ])->assertStatus(202)->json('id');

        $this->getJson("/api/v1/exports/{$id}")->assertJsonPath('summary.reflections', 1);

        $whole = $this->postJson('/api/v1/exports', ['format' => 'json'])->json('id');
        $this->getJson("/api/v1/exports/{$whole}")->assertJsonPath('summary.reflections', 2);
    }

    public function test_the_download_streams_the_file_to_its_owner_only(): void
    {
        $this->assessedReflection();
        $id = $this->postJson('/api/v1/exports', ['format' => 'json'])->json('id');

        $this->get("/api/v1/exports/{$id}/download")
            ->assertOk()
            ->assertDownload("reflection-diary-{$id}.json");

        // Not even a supervisor on the gig. Export is "own" for every role.
        Sanctum::actingAs($this->user('Dr Lee'));
        $this->getJson("/api/v1/exports/{$id}")->assertStatus(404);
        $this->get("/api/v1/exports/{$id}/download")->assertStatus(404);
    }

    public function test_a_failed_export_says_so_rather_than_polling_for_ever(): void
    {
        $this->assessedReflection();

        $export = Export::create([
            'user_id' => $this->user('Jane N')->id,
            'format' => 'json',
            'status' => 'failed',
        ]);

        $this->getJson("/api/v1/exports/{$export->id}")
            ->assertOk()
            ->assertJsonPath('status', 'failed')
            ->assertJsonPath('completed_at', null);

        $this->get("/api/v1/exports/{$export->id}/download")
            ->assertStatus(404)
            ->assertJsonPath('error.details.status', 'failed');
    }

    public function test_a_job_that_throws_marks_the_row_failed(): void
    {
        $export = Export::create([
            'user_id' => $this->user('Jane N')->id,
            // Not a real reflection id, so assembling throws when it
            // tries to build the file.
            'format' => 'json',
            'status' => 'pending',
        ]);

        Storage::shouldReceive('disk')->andThrow(new \RuntimeException('disk is gone'));

        try {
            (new BuildExport($export->id))->handle();
        } catch (\Throwable) {
            // The job rethrows so the queue can retry; the row is what
            // the student sees, and it has to say failed either way.
        }

        $this->assertSame('failed', $export->fresh()->status);
    }

    public function test_pdf_is_accepted_and_the_row_says_so(): void
    {
        $this->assessedReflection();

        $this->postJson('/api/v1/exports', ['format' => 'pdf'])
            ->assertStatus(202)
            ->assertJsonPath('format', 'pdf');
    }

    public function test_a_pdf_export_renders_a_pdf_with_the_record_in_it(): void
    {
        $reflection = $this->assessedReflection();
        $id = $this->postJson('/api/v1/exports', ['format' => 'pdf'])->json('id');

        $export = Export::findOrFail($id);
        $this->assertSame('complete', $export->status);
        $this->assertSame("exports/{$export->user_id}/{$id}.pdf", $export->uri);

        $bytes = Storage::disk('local')->get($export->uri);
        $this->assertStringStartsWith('%PDF', $bytes);

        // The summary is the same count the JSON export would have given.
        $this->assertSame(1, $export->summary['reflections']);
        $this->assertSame($reflection->entries()->count() * 2, $export->summary['scores']);
    }

    public function test_the_pdf_page_carries_the_record_not_just_a_title(): void
    {
        $reflection = $this->assessedReflection();
        $payload = $this->assembled($reflection);

        // Assert on the HTML the PDF is rendered from; dompdf's byte
        // stream is compressed and not greppable.
        $html = view('exports.pdf', $payload)->render();

        $this->assertStringContainsString('Develop AI use cases', $html);
        $this->assertStringContainsString('Paired on the importer.', $html);
        $this->assertStringContainsString('Good, with more to do on testing.', $html);
        $this->assertStringContainsString('https://example.org/pr/4', $html);
        $this->assertStringContainsString("version {$reflection->framework_version})", $html);
        // The radar rides inside the page as an SVG data URI, and the
        // SVG itself draws polygons rather than just labelling axes.
        $this->assertStringContainsString('data:image/svg+xml;base64,', $html);
        $svg = view('exports.radar', ['radar' => $payload['reflections'][0]['radar']])->render();
        $this->assertStringContainsString('<svg', $svg);
        $this->assertSame(2, substr_count($svg, 'stroke-width="1.5"'), 'one polygon per score class');
    }

    public function test_the_pdf_downloads_as_a_pdf(): void
    {
        $this->assessedReflection();
        $id = $this->postJson('/api/v1/exports', ['format' => 'pdf'])->json('id');

        $this->get("/api/v1/exports/{$id}/download")
            ->assertOk()
            ->assertDownload("reflection-diary-{$id}.pdf")
            ->assertHeader('content-type', 'application/pdf');
    }

    public function test_another_persons_pdf_is_not_found_not_forbidden(): void
    {
        $this->assessedReflection();
        $id = $this->postJson('/api/v1/exports', ['format' => 'pdf'])->json('id');

        // A supervisor on Jane's own gig, so someone who can legitimately
        // see her reflection. Still 404: the export is "own" for every
        // role, and the answer never distinguishes "not yours" from
        // "does not exist".
        Sanctum::actingAs($this->user('Dr Lee'));
        $this->getJson("/api/v1/exports/{$id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'NOT_FOUND');
        $this->get("/api/v1/exports/{$id}/download")->assertStatus(404);
    }

    public function test_a_render_that_throws_marks_the_pdf_row_failed(): void
    {
        $this->assessedReflection();

        $export = Export::create([
            'user_id' => $this->user('Jane N')->id,
            'format' => 'pdf',
            'status' => 'pending',
        ]);

        $this->app->bind(PdfRenderer::class, function () {
            $renderer = $this->createMock(PdfRenderer::class);
            $renderer->method('render')->willThrowException(new \RuntimeException('font table corrupt'));

            return $renderer;
        });

        try {
            (new BuildExport($export->id))->handle();
        } catch (\Throwable) {
            // Rethrown for the queue; the row is what the student sees.
        }

        $this->assertSame('failed', $export->fresh()->status);
        $this->assertNull($export->fresh()->uri);

        Sanctum::actingAs($this->user('Jane N'));
        $this->get("/api/v1/exports/{$export->id}/download")
            ->assertStatus(404)
            ->assertJsonPath('error.details.status', 'failed');
    }

    public function test_an_unknown_format_is_refused(): void
    {
        Sanctum::actingAs($this->user('Jane N'));

        $this->postJson('/api/v1/exports', ['format' => 'docx'])
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'VALIDATION_FAILED');
    }

    public function test_the_history_lists_only_your_own_exports(): void
    {
        $this->assessedReflection();
        $this->postJson('/api/v1/exports', ['format' => 'json'])->assertStatus(202);
        $this->postJson('/api/v1/exports', ['format' => 'json'])->assertStatus(202);

        $this->getJson('/api/v1/exports')->assertOk()->assertJsonCount(2);

        Sanctum::actingAs($this->user('Sam O'));
        $this->getJson('/api/v1/exports')->assertOk()->assertJsonCount(0);
    }

    public function test_exporting_someone_elses_reflection_is_not_found(): void
    {
        $reflection = $this->assessedReflection();

        Sanctum::actingAs($this->user('Sam O'));
        $this->postJson('/api/v1/exports', ['format' => 'json', 'reflection_id' => $reflection->id])
            ->assertStatus(404);

        // A made-up id gets the same answer, so the endpoint does not
        // say which ids exist.
        $this->postJson('/api/v1/exports', ['format' => 'json', 'reflection_id' => Str::uuid()->toString()])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'NOT_FOUND');
    }

    /**
     * The matrix row "analytics + export: own record", held by a policy
     * rather than a check in the controller. Every non-owner is not-found,
     * including an assessor who may view the reflection: exporting it is
     * taking the student's record away, which is the student's alone.
     */
    public function test_exporting_a_reflection_is_its_owners_alone(): void
    {
        $reflection = $this->assessedReflection();

        $this->assertTrue(Gate::forUser($this->user('Jane N'))->allows('export', $reflection));

        $response = Gate::forUser($this->user('Sam O'))->inspect('export', $reflection);
        $this->assertTrue(Gate::forUser($this->user('Sam O'))->allows('view', $reflection), 'Sam can see it');
        $this->assertTrue($response->denied(), 'but may not export it');
        $this->assertSame(404, $response->status());
    }

    public function test_the_pdf_radar_draws_only_the_score_classes_that_exist(): void
    {
        // A draft in a whole-record export: no scores on either side.
        Sanctum::actingAs($this->user('Jane N'));
        $gig = Gig::where('title', 'Develop AI use cases')->firstOrFail();
        $draft = Reflection::findOrFail(
            $this->postJson('/api/v1/reflections', [
                'sprint_id' => $gig->sprints()->where('ordinal', 1)->firstOrFail()->id,
            ])->json('id')
        );

        $radar = fn () => view('exports.radar', [
            'radar' => $this->assembled($draft)['reflections'][0]['radar'],
        ])->render();

        $this->assertSame(0, substr_count($radar(), 'stroke-width="1.5"'), 'nothing scored, no polygon');

        // One self-score: the self polygon appears, the counter one still not.
        $entry = $draft->entries()->with('competency.levels')->firstOrFail();
        $this->putJson("/api/v1/entries/{$entry->id}/scores/self", [
            'level_id' => $entry->competency->levels->firstWhere('level_value', 4)->id,
        ])->assertOk();

        $svg = $radar();
        $this->assertSame(1, substr_count($svg, 'stroke-width="1.5"'), 'self only');
        // The other five axes are unscored and sit at the centre.
        $this->assertSame(5, substr_count($svg, '150,150'));
    }

    /**
     * The payload BuildExport would write for one reflection, without
     * going through the queue or the disk.
     *
     * @return array<string, mixed>
     */
    private function assembled(Reflection $reflection): array
    {
        return (new \ReflectionClass(BuildExport::class))
            ->getMethod('assemble')
            ->invoke(new BuildExport('unused'), Export::create([
                'user_id' => $reflection->user_id,
                'reflection_id' => $reflection->id,
                'format' => 'pdf',
                'status' => 'pending',
            ]));
    }
}
