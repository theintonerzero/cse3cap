# CAP-17 PDF export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED SKILLS:** Load `/add-endpoint` before Task 4 (the request rule and the contract change) and `/write-adr` before Task 7. Load `superpowers:test-driven-development` for every task in `api/`: the failing test comes first.

**Goal:** `POST /exports` with `format: pdf` produces a standalone PDF of the student's record — narratives, evidence, both score sets, the framework version snapshot and a radar — through the export pipeline CAP-16 already built.

**Architecture:** Nothing about the pipeline changes. `BuildExport::assemble()` already walks the record into one array; this adds a `radar` block per reflection from `v_radar`, then switches the *writer* on `format`: JSON encodes the array, PDF hands it to a Blade view and dompdf. The radar is inline SVG drawn server-side by a small geometry class, because dompdf runs no JavaScript and recharts cannot help here. Status, authorisation, download and polling are untouched and stay tested.

**Tech Stack:** PHP 8.5 / Laravel 13, `dompdf/dompdf` (plain package, no Laravel wrapper), Blade, inline SVG. No frontend change: CAP-18 owns the format selector and will pick `pdf` up from the regenerated types.

**Ticket:** COA4-75 (`project = COA4 AND summary ~ "CAP-17"`). In Progress, assigned to Jesse. Acceptance criteria are on the ticket and reproduced per task below.

**Decisions already made (2026-09-17, in conversation):** dompdf is agreed; the radar is server-side SVG.

## Global Constraints

- Sources of truth in order: `db/01-schema.sql`, `docs/openapi.yaml`, `docs/adr/`, Jira. Never invent a column or endpoint.
- No schema change. `exports.format` already allows `pdf` (schema CHECK) and the contract's `Export.format` enum already lists it. Only the *request* enum is narrowed today.
- Status is stored on the row, never derived (ADR #25). The row is the job record (ADR #30).
- Another student's export is a **404**, never a 403. `ExportPolicy` already does this; do not touch it.
- One envelope for every non-2xx: `{ "error": { "code", "message", "details" } }`.
- Business rules live once. Nothing here is a new business rule; do not put one in the view.
- Analytics reads the SQL views. The radar data comes from `v_radar` and `v_framework_scale`, not from aggregating scores in PHP.
- `docs/openapi.yaml` is updated in the same PR, and `web/src/api/schema.ts` is regenerated from it, never hand-edited.
- Every check lives in `api/tests/` or `scripts/`. Nothing in a scratchpad.
- The database is shared. `RefreshDatabase` runs against your own `DB_TEST_DATABASE` (see `api/phpunit.xml`); never run migrations or seeders from two places at once.
- Commit messages: `type(scope): what and why (CAP-17)`, matching `git log`.

## Picking this up

```bash
git worktree add ../cse3cap-worktrees/CAP-17 -b feat/CAP-17-pdf-export origin/dev
cd ../cse3cap-worktrees/CAP-17
cp ../../cse3cap/api/.env api/.env    # your own env, gitignored; carries DB_TEST_DATABASE
cd api && composer install && cd ..
./run test                            # 110 green before you start; if not, stop and say so
```

## File map

| File | Responsibility |
| --- | --- |
| `api/composer.json`, `api/composer.lock` | Modify: add `dompdf/dompdf` |
| `api/app/Jobs/BuildExport.php` | Modify: radar block in `assemble()`; writer switched on format |
| `api/app/Exports/RadarPolygon.php` | Create: pure geometry, values → SVG point strings |
| `api/app/Exports/PdfRenderer.php` | Create: payload array → PDF bytes via Blade + dompdf |
| `api/resources/views/exports/pdf.blade.php` | Create: the document |
| `api/resources/views/exports/radar.blade.php` | Create: the inline SVG partial |
| `api/app/Http/Requests/StoreExportRequest.php` | Modify: `in:json,pdf` |
| `api/tests/Unit/RadarPolygonTest.php` | Create |
| `api/tests/Feature/ExportTest.php` | Modify: radar in payload; pdf render, download, authorisation, failure |
| `docs/openapi.yaml` | Modify: request enum, descriptions |
| `web/src/api/schema.ts` | Regenerate only |
| `scripts/smoke.sh` | Modify: pdf is requested, not refused |
| `docs/adr/architecture-decision-records.md` | Append ADR #39 |

---

### Task 1: Add dompdf

**Files:**
- Modify: `api/composer.json`, `api/composer.lock`

**Interfaces:**
- Produces: `Dompdf\Dompdf` and `Dompdf\Options` available to Task 5.

- [ ] **Step 1: Require the package**

Run from `api/`:
```bash
composer require dompdf/dompdf:^3.1
```
Expected: lockfile updated, no conflict with `laravel/framework ^13.17` or PHP 8.5. If composer reports a PHP version conflict, stop and report it; do not lower the constraint.

- [ ] **Step 2: Confirm it loads**

```bash
php -r 'require "vendor/autoload.php"; $d = new Dompdf\Dompdf(); $d->loadHtml("<p>ok</p>"); $d->render(); echo substr($d->output(), 0, 4), PHP_EOL;'
```
Expected output: `%PDF`

- [ ] **Step 3: Run the suite, unchanged**

```bash
./run test
```
Expected: same green count as before (110).

- [ ] **Step 4: Commit**

```bash
git add api/composer.json api/composer.lock
git commit -m "build(api): add dompdf for the pdf export (CAP-17)"
```

---

### Task 2: The radar data rides on the payload

`assemble()` is the one place the record is walked. The PDF needs per-reflection radar axes, and the JSON record is better for carrying them too, so they are added to the payload rather than fetched inside the view.

**Files:**
- Modify: `api/app/Jobs/BuildExport.php` (`assemble()`)
- Test: `api/tests/Feature/ExportTest.php`

**Interfaces:**
- Produces, per reflection in `$payload['reflections'][n]`:
  ```php
  'radar' => [
      'scale_min' => int,
      'scale_max' => int,
      'axes' => [ ['code' => string, 'short_label' => string, 'position' => int,
                   'self' => ?int, 'counter' => ?int, 'counter_role' => ?string], ... ],
  ]
  ```
  Axes ordered by `position`; one per competency in the framework, scored or not.

- [ ] **Step 1: Write the failing test**

Add to `ExportTest`, after `test_the_version_in_the_file_is_the_snapshot_not_the_current_one`:

```php
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
        $sorted = $positions; sort($sorted);
        $this->assertSame($sorted, $positions);
    }
```

If the seeded La Trobe framework's scale is not 1..4, read `v_framework_scale` for it (`SELECT * FROM v_framework_scale` through the MySQL MCP) and fix the two asserts; do not fix the view. If Sam O's role on "Develop AI use cases" is not `assessor`, read `gig_participants` and fix the assert.

- [ ] **Step 2: Run it, expect failure**

```bash
cd api && php artisan test --filter=test_the_file_carries_a_radar_per_reflection_from_the_view
```
Expected: FAIL, undefined array key `"radar"`.

- [ ] **Step 3: Add the radar to `assemble()`**

In `BuildExport`, add `use Illuminate\Support\Facades\DB;` and a private method:

```php
    /**
     * One axis per competency in the reflection's framework, scored or not,
     * read through v_radar so the export draws the same chart the screen
     * does. The counter value is already the one v_entry_score chose.
     *
     * @return array<string, mixed>
     */
    private function radar(Reflection $reflection): array
    {
        $scale = DB::table('v_framework_scale')
            ->where('framework_id', $reflection->framework_id)
            ->first();

        $scored = [];
        foreach (DB::table('v_radar')->where('reflection_id', $reflection->id)->get() as $row) {
            if ($row->scorer_class !== null) {
                $scored[$row->competency_code][$row->scorer_class] = $row;
            }
        }

        $axes = $reflection->entries
            ->sortBy(fn ($e) => $e->competency->position)
            ->map(function ($entry) use ($scored) {
                $code = $entry->competency->code;

                return [
                    'code' => $code,
                    'short_label' => $entry->competency->short_label,
                    'position' => $entry->competency->position,
                    'self' => isset($scored[$code]['self']) ? (int) $scored[$code]['self']->level_value : null,
                    'counter' => isset($scored[$code]['counter']) ? (int) $scored[$code]['counter']->level_value : null,
                    'counter_role' => $scored[$code]['counter']->scorer_role ?? null,
                ];
            })->values()->all();

        return [
            'scale_min' => (int) $scale->scale_min,
            'scale_max' => (int) $scale->scale_max,
            'axes' => $axes,
        ];
    }
```

Then in the `$body` map, after `'submitted_at' => ...`, add:

```php
                'radar' => $this->radar($reflection),
```

- [ ] **Step 4: Run the whole export suite**

```bash
php artisan test --filter=ExportTest
```
Expected: the new test passes; the other ten still pass (extra key, no path assertions broken).

- [ ] **Step 5: Commit**

```bash
git add api/app/Jobs/BuildExport.php api/tests/Feature/ExportTest.php
git commit -m "feat(api): the export payload carries a radar per reflection (CAP-17)"
```

---

### Task 3: Radar geometry

A pure class so the SVG maths is unit-tested and the Blade view holds no arithmetic worth testing.

**Files:**
- Create: `api/app/Exports/RadarPolygon.php`
- Test: `api/tests/Unit/RadarPolygonTest.php`

**Interfaces:**
- Produces:
  ```php
  final class RadarPolygon {
      public function __construct(int $axes, int $scaleMin, int $scaleMax,
                                  float $cx = 150.0, float $cy = 150.0, float $radius = 110.0);
      /** @param list<?int> $values one per axis, null = unscored */
      public function points(array $values): string;   // "x,y x,y ..." — SVG polygon points; null axes sit at the centre
      public function ring(int $level): string;         // polygon for one grid level
      public function axisEnd(int $i): array;           // ['x' => float, 'y' => float] at full radius
      public function labelAt(int $i, float $pad = 18.0): array;  // ['x','y','anchor'] beyond the rim
  }
  ```

- [ ] **Step 1: Write the failing test**

`api/tests/Unit/RadarPolygonTest.php`:

```php
<?php

namespace Tests\Unit;

use App\Exports\RadarPolygon;
use PHPUnit\Framework\TestCase;

class RadarPolygonTest extends TestCase
{
    public function test_the_first_axis_points_straight_up(): void
    {
        $radar = new RadarPolygon(axes: 4, scaleMin: 1, scaleMax: 4);

        $end = $radar->axisEnd(0);
        $this->assertEqualsWithDelta(150.0, $end['x'], 0.001);
        $this->assertEqualsWithDelta(40.0, $end['y'], 0.001);
    }

    public function test_the_maximum_reaches_the_rim_and_the_minimum_the_centre(): void
    {
        $radar = new RadarPolygon(axes: 4, scaleMin: 1, scaleMax: 4);

        // 4 up, 1 right, 4 down, 1 left. Minimum is the centre, not a dot short of it.
        $this->assertSame('150,40 150,150 150,260 150,150', $radar->points([4, 1, 4, 1]));
    }

    public function test_an_unscored_axis_sits_at_the_centre(): void
    {
        $radar = new RadarPolygon(axes: 3, scaleMin: 0, scaleMax: 2);

        $points = explode(' ', $radar->points([2, null, null]));
        $this->assertSame('150,40', $points[0]);
        $this->assertSame('150,150', $points[1]);
        $this->assertSame('150,150', $points[2]);
    }

    public function test_a_ring_is_a_closed_regular_polygon_at_that_level(): void
    {
        $radar = new RadarPolygon(axes: 6, scaleMin: 1, scaleMax: 4);

        $this->assertCount(6, explode(' ', $radar->ring(2)));
        $this->assertSame($radar->ring(4), $radar->points([4, 4, 4, 4, 4, 4]));
    }

    public function test_labels_anchor_by_side(): void
    {
        $radar = new RadarPolygon(axes: 4, scaleMin: 1, scaleMax: 4);

        $this->assertSame('middle', $radar->labelAt(0)['anchor']);  // top
        $this->assertSame('start', $radar->labelAt(1)['anchor']);   // right
        $this->assertSame('end', $radar->labelAt(3)['anchor']);     // left
    }
}
```

- [ ] **Step 2: Run it, expect failure**

```bash
php artisan test --filter=RadarPolygonTest
```
Expected: FAIL, class `App\Exports\RadarPolygon` not found.

- [ ] **Step 3: Implement**

`api/app/Exports/RadarPolygon.php`:

```php
<?php

namespace App\Exports;

/**
 * The geometry behind the export's radar. Axes start at twelve o'clock
 * and run clockwise, the same as the recharts radar on screen, so the
 * PDF and the page draw the same shape for the same scores.
 *
 * Nothing here knows about competencies or scores; it maps a list of
 * values on a scale onto SVG polygon points and nothing else.
 */
final class RadarPolygon
{
    public function __construct(
        private readonly int $axes,
        private readonly int $scaleMin,
        private readonly int $scaleMax,
        private readonly float $cx = 150.0,
        private readonly float $cy = 150.0,
        private readonly float $radius = 110.0,
    ) {}

    /**
     * @param  list<?int>  $values  one per axis; null is unscored and sits at the centre
     */
    public function points(array $values): string
    {
        $points = [];

        for ($i = 0; $i < $this->axes; $i++) {
            $points[] = $this->format($this->at($i, $values[$i] ?? null));
        }

        return implode(' ', $points);
    }

    public function ring(int $level): string
    {
        return $this->points(array_fill(0, $this->axes, $level));
    }

    /** @return array{x: float, y: float} */
    public function axisEnd(int $i): array
    {
        return $this->at($i, $this->scaleMax);
    }

    /** @return array{x: float, y: float, anchor: string} */
    public function labelAt(int $i, float $pad = 18.0): array
    {
        $angle = $this->angle($i);
        $x = $this->cx + ($this->radius + $pad) * cos($angle);
        $y = $this->cy + ($this->radius + $pad) * sin($angle);

        // A label to the right of centre starts there; to the left it
        // ends there; straight above or below it is centred.
        $dx = round(cos($angle), 6);
        $anchor = $dx > 0 ? 'start' : ($dx < 0 ? 'end' : 'middle');

        return ['x' => $x, 'y' => $y, 'anchor' => $anchor];
    }

    /** @return array{x: float, y: float} */
    private function at(int $i, ?int $value): array
    {
        $span = max(1, $this->scaleMax - $this->scaleMin);
        $fraction = $value === null ? 0.0 : ($value - $this->scaleMin) / $span;
        $fraction = max(0.0, min(1.0, $fraction));
        $angle = $this->angle($i);

        return [
            'x' => $this->cx + $this->radius * $fraction * cos($angle),
            'y' => $this->cy + $this->radius * $fraction * sin($angle),
        ];
    }

    private function angle(int $i): float
    {
        return -M_PI / 2 + 2 * M_PI * $i / $this->axes;
    }

    /** @param array{x: float, y: float} $p */
    private function format(array $p): string
    {
        // Rounded so a value that lands on an integer prints as one and
        // the tests can assert on exact strings.
        return rtrim(rtrim(number_format($p['x'], 3, '.', ''), '0'), '.')
            .','.rtrim(rtrim(number_format($p['y'], 3, '.', ''), '0'), '.');
    }
}
```

- [ ] **Step 4: Run it, expect green**

```bash
php artisan test --filter=RadarPolygonTest
```
Expected: 5 passed. If `150,40` comes out as `150,40.000` or `-0` appears, fix `format()`, not the test. (`cos(-π/2)` is ~6e-17, which rounds to `0`; if it prints `-0`, add `+ 0.0` after rounding.)

- [ ] **Step 5: Commit**

```bash
git add api/app/Exports/RadarPolygon.php api/tests/Unit/RadarPolygonTest.php
git commit -m "feat(api): radar geometry for the pdf export (CAP-17)"
```

---

### Task 4: `pdf` is accepted

Load `/add-endpoint` first: this is a request-rule change and it carries a contract change with it (Task 6), which the skill insists travel together in the PR.

**Files:**
- Modify: `api/app/Http/Requests/StoreExportRequest.php`
- Test: `api/tests/Feature/ExportTest.php`

**Interfaces:**
- Produces: `POST /exports {format: 'pdf'}` → 202 with a row whose `format` is `pdf`. The job still writes JSON at this point (Task 5 fixes that), which is why the test only checks the row.

- [ ] **Step 1: Replace the refusal test**

Delete `test_pdf_is_refused_clearly_rather_than_quietly_producing_json` and put in its place:

```php
    public function test_pdf_is_accepted_and_the_row_says_so(): void
    {
        $this->assessedReflection();

        $this->postJson('/api/v1/exports', ['format' => 'pdf'])
            ->assertStatus(202)
            ->assertJsonPath('format', 'pdf');
    }

    public function test_an_unknown_format_is_refused(): void
    {
        Sanctum::actingAs($this->user('Jane N'));

        $this->postJson('/api/v1/exports', ['format' => 'docx'])
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'VALIDATION_FAILED');
    }
```

- [ ] **Step 2: Run, expect one failure**

```bash
php artisan test --filter='test_pdf_is_accepted|test_an_unknown_format'
```
Expected: `test_pdf_is_accepted_and_the_row_says_so` FAILS (400); `test_an_unknown_format_is_refused` passes.

- [ ] **Step 3: Widen the rule**

Replace the whole of `StoreExportRequest`'s docblock, `rules()` and `messages()`:

```php
    /**
     * Both formats the schema allows. A named reflection has to exist;
     * whether it is the caller's is the controller's 404, not this
     * request's 400, so the two stay indistinguishable from outside.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'format' => ['required', 'in:json,pdf'],
            'reflection_id' => ['nullable', 'uuid', 'exists:reflections,id'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'format.in' => 'Exports are json or pdf.',
        ];
    }
```

- [ ] **Step 4: Run the export suite**

```bash
php artisan test --filter=ExportTest
```
Expected: all green. (The job wrote a `.json` file for the pdf row; that is Task 5's problem and nothing asserts on it yet.)

- [ ] **Step 5: Commit**

```bash
git add api/app/Http/Requests/StoreExportRequest.php api/tests/Feature/ExportTest.php
git commit -m "feat(api): POST /exports accepts pdf (CAP-17)"
```

---

### Task 5: The job renders a PDF

**Files:**
- Create: `api/app/Exports/PdfRenderer.php`
- Create: `api/resources/views/exports/pdf.blade.php`
- Create: `api/resources/views/exports/radar.blade.php`
- Modify: `api/app/Jobs/BuildExport.php` (`handle()`)
- Test: `api/tests/Feature/ExportTest.php`

**Interfaces:**
- Consumes: `$payload` from `assemble()` including `radar` (Task 2); `RadarPolygon` (Task 3).
- Produces: `PdfRenderer::render(array $payload): string` returning PDF bytes; `exports/{user}/{id}.pdf` on the `local` disk; `download` streams it as `reflection-diary-{id}.pdf` with `Content-Type: application/pdf`.

- [ ] **Step 1: Write the failing tests**

Add to `ExportTest`:

```php
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
        $payload = (new \ReflectionClass(BuildExport::class))
            ->getMethod('assemble')
            ->invoke(new BuildExport('unused'), Export::create([
                'user_id' => $reflection->user_id, 'format' => 'pdf', 'status' => 'pending',
            ]));

        // Assert on the HTML the PDF is rendered from; dompdf's byte
        // stream is compressed and not greppable.
        $html = view('exports.pdf', $payload)->render();

        $this->assertStringContainsString('Develop AI use cases', $html);
        $this->assertStringContainsString('Paired on the importer.', $html);
        $this->assertStringContainsString('Good, with more to do on testing.', $html);
        $this->assertStringContainsString('https://example.org/pr/4', $html);
        $this->assertStringContainsString($reflection->framework_version, $html);
        $this->assertStringContainsString('<svg', $html);
        $this->assertStringContainsString('<polygon', $html);
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
```

Note on `framework_version`: read `api/app/Models/Reflection.php` casts. If it is an integer, wrap the assert value in `(string)`.

- [ ] **Step 2: Run, expect failure**

```bash
php artisan test --filter='pdf_export_renders|pdf_page_carries|pdf_downloads'
```
Expected: all three FAIL — uri ends `.json`, view `exports.pdf` not found, content type is json.

- [ ] **Step 3: The renderer**

`api/app/Exports/PdfRenderer.php`:

```php
<?php

namespace App\Exports;

use Dompdf\Dompdf;
use Dompdf\Options;

/**
 * Turns the assembled export payload into PDF bytes.
 *
 * dompdf is a pure-PHP renderer with no JavaScript, which is why the
 * radar is drawn as inline SVG (see RadarPolygon) rather than by the
 * recharts component the screen uses. Remote assets are off: the record
 * has to stand on its own with nothing fetched at render time.
 */
final class PdfRenderer
{
    /**
     * @param  array<string, mixed>  $payload  the array BuildExport::assemble() returns
     */
    public function render(array $payload): string
    {
        $options = new Options();
        $options->set('isRemoteEnabled', false);
        $options->set('isHtml5ParserEnabled', true);
        $options->set('defaultFont', 'DejaVu Sans');

        $dompdf = new Dompdf($options);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->loadHtml(view('exports.pdf', $payload)->render());
        $dompdf->render();

        return $dompdf->output();
    }
}
```

- [ ] **Step 4: The radar partial**

`api/resources/views/exports/radar.blade.php` — receives `$radar` (the block from Task 2):

```blade
@php
    $axes = $radar['axes'];
    $n = count($axes);
    $geometry = new \App\Exports\RadarPolygon($n, $radar['scale_min'], $radar['scale_max']);
@endphp
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    @for ($level = $radar['scale_min'] + 1; $level <= $radar['scale_max']; $level++)
        <polygon points="{{ $geometry->ring($level) }}" fill="none" stroke="#cccccc" stroke-width="0.6" />
    @endfor
    @foreach ($axes as $i => $axis)
        @php $end = $geometry->axisEnd($i); $label = $geometry->labelAt($i); @endphp
        <line x1="150" y1="150" x2="{{ $end['x'] }}" y2="{{ $end['y'] }}" stroke="#cccccc" stroke-width="0.6" />
        <text x="{{ $label['x'] }}" y="{{ $label['y'] }}" text-anchor="{{ $label['anchor'] }}"
              dominant-baseline="middle" font-size="8" fill="#333333">{{ $axis['short_label'] }}</text>
    @endforeach
    <polygon points="{{ $geometry->points(array_column($axes, 'self')) }}"
             fill="#3b6ea5" fill-opacity="0.25" stroke="#3b6ea5" stroke-width="1.5" />
    @if (array_filter(array_column($axes, 'counter'), fn ($v) => $v !== null))
        <polygon points="{{ $geometry->points(array_column($axes, 'counter')) }}"
                 fill="#c0662b" fill-opacity="0.25" stroke="#c0662b" stroke-width="1.5" />
    @endif
</svg>
```

Hex colour is allowed here: the no-raw-hex rule is a `web/` rule about `tokens.css`, and a PDF has no stylesheet to inherit from. Say so in a Blade comment at the top of the file.

- [ ] **Step 5: The document**

`api/resources/views/exports/pdf.blade.php` — receives the whole payload (`exported_at`, `format`, `summary`, `reflections`):

```blade
{{-- The student's record, leaving the system. Everything on this page has
     to make sense without the application: the framework version the
     scores were given against, who gave them, and when. --}}
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page { margin: 18mm 16mm; }
    body { font-family: 'DejaVu Sans', sans-serif; font-size: 10pt; color: #222222; }
    h1 { font-size: 18pt; margin: 0 0 2mm; }
    h2 { font-size: 13pt; margin: 8mm 0 2mm; page-break-after: avoid; }
    h3 { font-size: 11pt; margin: 5mm 0 1mm; page-break-after: avoid; }
    .meta { color: #666666; font-size: 9pt; }
    .reflection { page-break-before: always; }
    .reflection:first-of-type { page-break-before: auto; }
    .radar { text-align: center; margin: 4mm 0; }
    table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; }
    th, td { border: 0.5pt solid #cccccc; padding: 1.5mm 2mm; text-align: left; vertical-align: top; }
    th { background: #f2f2f2; font-weight: bold; }
    .narrative { white-space: pre-wrap; margin: 1mm 0 2mm; }
    .legend span { display: inline-block; width: 3mm; height: 3mm; margin-right: 1.5mm; vertical-align: middle; }
    .self { background: #3b6ea5; } .counter { background: #c0662b; }
    ul { margin: 0 0 2mm 4mm; padding: 0; }
</style>
</head>
<body>
<h1>Reflection Diary</h1>
<p class="meta">
    Exported {{ \Carbon\Carbon::parse($exported_at)->format('j F Y, H:i') }} UTC ·
    {{ $summary['reflections'] }} {{ \Illuminate\Support\Str::plural('reflection', $summary['reflections']) }} ·
    {{ $summary['scores'] }} scores · {{ $summary['files'] }} evidence items
</p>

@forelse ($reflections as $reflection)
<section class="reflection">
    <h2>{{ $reflection['gig'] ?? 'Gig' }} — Sprint {{ $reflection['sprint_ordinal'] ?? '?' }}</h2>
    <p class="meta">
        Scored against {{ $reflection['framework']['name'] }}
        ({{ $reflection['framework']['fw_key'] }}, version {{ $reflection['framework']['version'] }}) ·
        status {{ $reflection['status'] }}
        @if ($reflection['submitted_at']) · submitted {{ \Carbon\Carbon::parse($reflection['submitted_at'])->format('j F Y') }} @endif
    </p>

    <div class="radar">
        @include('exports.radar', ['radar' => $reflection['radar']])
        <p class="meta legend"><span class="self"></span>Self &nbsp; <span class="counter"></span>Counter-score</p>
    </div>

    <table>
        <thead><tr><th>Competency</th><th>Self</th><th>Counter</th><th>By</th></tr></thead>
        <tbody>
        @foreach ($reflection['radar']['axes'] as $axis)
            <tr>
                <td>{{ $axis['code'] }} · {{ $axis['short_label'] }}</td>
                <td>{{ $axis['self'] ?? '—' }}</td>
                <td>{{ $axis['counter'] ?? '—' }}</td>
                <td>{{ $axis['counter_role'] ?? '' }}</td>
            </tr>
        @endforeach
        </tbody>
    </table>

    @foreach ($reflection['entries'] as $entry)
        <h3>{{ $entry['competency_code'] }} · {{ $entry['competency_name'] }}</h3>
        <p class="narrative">{{ $entry['narrative'] ?: 'No narrative written.' }}</p>

        @if (count($entry['evidence']))
            <ul>
            @foreach ($entry['evidence'] as $evidence)
                <li>{{ $evidence['label'] }} ({{ $evidence['kind'] }}): {{ $evidence['uri'] }}</li>
            @endforeach
            </ul>
        @endif

        @if (count($entry['scores']))
            <table>
                <thead><tr><th>Scorer</th><th>Level</th><th>Comment</th><th>When</th></tr></thead>
                <tbody>
                @foreach ($entry['scores'] as $score)
                    <tr>
                        <td>{{ $score['scorer'] }} ({{ $score['scorer_role'] }})</td>
                        <td>{{ $score['level_value'] }}</td>
                        <td>{{ $score['comment'] ?? '' }}</td>
                        <td>{{ $score['scored_at'] ? \Carbon\Carbon::parse($score['scored_at'])->format('j M Y') : '' }}</td>
                    </tr>
                @endforeach
                </tbody>
            </table>
        @endif
    @endforeach
</section>
@empty
<p>No reflections yet.</p>
@endforelse
</body>
</html>
```

`$reflection['entries']` is a Collection (from `->values()`), so `count()` and `@foreach` work as written. If `$entry['evidence']` arrives as a Collection, `count()` still works.

- [ ] **Step 6: Switch the writer in `BuildExport::handle()`**

Add `use App\Exports\PdfRenderer;` and replace the `try` body's first three statements with:

```php
            $payload = $this->assemble($export);
            $path = "exports/{$export->user_id}/{$export->id}.{$export->format}";

            Storage::disk('local')->put($path, match ($export->format) {
                'pdf' => (new PdfRenderer())->render($payload),
                default => json_encode(
                    $payload,
                    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
                ),
            });
```

Leave the `update([...])` and the `catch` exactly as they are.

- [ ] **Step 7: Make `download` say what it is streaming**

In `ExportController::download()`, replace the final `return`:

```php
        return $disk->download(
            $export->uri,
            "reflection-diary-{$export->id}.{$export->format}",
            ['Content-Type' => $export->format === 'pdf' ? 'application/pdf' : 'application/json'],
        );
```

- [ ] **Step 8: Run the export suite**

```bash
php artisan test --filter=ExportTest
```
Expected: all green, including the three new ones. If dompdf complains about a font, check that `DejaVu Sans` ships with dompdf (`vendor/dompdf/dompdf/lib/fonts/`); it does in 3.x.

- [ ] **Step 9: Look at it**

```bash
php artisan tinker --execute='
$e = App\Models\Export::where("format","pdf")->latest("requested_at")->first();
echo $e?->uri ?? "no pdf export yet — request one through the API first", PHP_EOL;'
```
Against the dev database (not the test one), request a PDF for Jane N with the seeded token through `./run api` and `curl`, then open `api/storage/app/private/exports/<user>/<id>.pdf` (or `storage/app/exports/...`, whichever the `local` disk root is in `config/filesystems.php`). Confirm: radar renders, two polygons, labels readable, one reflection per page, tables not overflowing. Fix layout in the Blade only; no test asserts on layout.

- [ ] **Step 10: Commit**

```bash
git add api/app/Exports/PdfRenderer.php api/resources/views/exports api/app/Jobs/BuildExport.php api/app/Http/Controllers/Api/V1/ExportController.php api/tests/Feature/ExportTest.php
git commit -m "feat(api): the export job renders a pdf with the radar drawn server-side (CAP-17)"
```

---

### Task 6: Authorisation and failure path, for PDF specifically

The policy is unchanged, but the ticket's criterion is written against `pdf`, so it is tested against `pdf`. The failure path already has `test_a_job_that_throws_marks_the_row_failed` for a disk failure; this adds the render failing.

**Files:**
- Test: `api/tests/Feature/ExportTest.php`

- [ ] **Step 1: Write the tests**

```php
    public function test_another_students_pdf_is_not_found_not_forbidden(): void
    {
        $this->assessedReflection();
        $id = $this->postJson('/api/v1/exports', ['format' => 'pdf'])->json('id');

        // Another student on no gig with Jane, then a supervisor on hers.
        // Both 404: the export is "own" for every role, and the answer
        // never distinguishes "not yours" from "does not exist".
        foreach (['Wei Z', 'Dr Lee'] as $someoneElse) {
            Sanctum::actingAs($this->user($someoneElse));
            $this->getJson("/api/v1/exports/{$id}")->assertStatus(404)->assertJsonPath('error.code', 'NOT_FOUND');
            $this->get("/api/v1/exports/{$id}/download")->assertStatus(404);
        }
    }

    public function test_a_render_that_throws_marks_the_pdf_row_failed(): void
    {
        $this->assessedReflection();

        $export = Export::create([
            'user_id' => $this->user('Jane N')->id,
            'format' => 'pdf',
            'status' => 'pending',
        ]);

        $this->app->bind(\App\Exports\PdfRenderer::class, function () {
            $renderer = $this->createMock(\App\Exports\PdfRenderer::class);
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
```

Check `DemoSeeder` for the second student's display name: `grep -n "display_name" api/database/seeders/DemoSeeder.php`. Use a student who is not on "Develop AI use cases". If none exists, drop that name from the loop and keep 'Dr Lee'; do not seed one.

- [ ] **Step 2: Run, expect the render test to fail**

```bash
php artisan test --filter='another_students_pdf|render_that_throws'
```
Expected: the authorisation test passes already; the render test FAILS because `BuildExport` does `new PdfRenderer()` and the container binding is bypassed.

- [ ] **Step 3: Resolve the renderer through the container**

In `BuildExport::handle()`, change `(new PdfRenderer())->render($payload)` to `app(PdfRenderer::class)->render($payload)`. `PdfRenderer` must stay `final` with a no-arg constructor; a mock of a final class is not possible with PHPUnit, so **drop `final` from `PdfRenderer`** and note in its docblock that it is un-final only so the failure path can be tested.

- [ ] **Step 4: Run the export suite**

```bash
php artisan test --filter=ExportTest
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add api/app/Exports/PdfRenderer.php api/app/Jobs/BuildExport.php api/tests/Feature/ExportTest.php
git commit -m "test(api): pdf export authorisation and failure path (CAP-17)"
```

---

### Task 7: The contract, the generated types and the smoke walk

Load `/add-endpoint` if not already loaded. The contract changes in the same PR as the code, and the frontend types are regenerated from it, never edited.

**Files:**
- Modify: `docs/openapi.yaml` (`POST /exports` requestBody, ~line 1030)
- Regenerate: `web/src/api/schema.ts`
- Modify: `scripts/smoke.sh` (~line 300)

- [ ] **Step 1: Update the request schema**

Replace the `format` property under `POST /exports` requestBody:

```yaml
                format:
                  type: string
                  enum: [json, pdf]
                  description: >
                    json is the record as data. pdf is the same record laid
                    out to stand alone: narratives, evidence, both score
                    sets, the framework version each was scored against and
                    a radar per reflection. Neither needs the application to
                    read.
```

Also find the `download` operation's response (search `operationId: downloadExport`) and, if it lists only `application/json`, add `application/pdf` with `schema: { type: string, format: binary }` alongside it.

- [ ] **Step 2: Lint and regenerate**

```bash
./run lint            # runs the OpenAPI linter among others; read the output
cd web && npm run gen:types && cd ..
git diff --stat web/src/api/schema.ts
```
Expected: lint clean; `schema.ts` diff touches only the `format` enum under the exports request body (and the download response if changed).

- [ ] **Step 3: Smoke walk**

In `scripts/smoke.sh`, replace the line

```bash
call "pdf is refused, not faked"      400 "$JANE" POST /exports '{"format":"pdf"}'
```

with

```bash
call "request it as a pdf"            202 "$JANE" POST /exports '{"format":"pdf"}'
PDF="$(jq_get '["id"]')"
call "an unknown format is refused"   400 "$JANE" POST /exports '{"format":"docx"}'
```

and after `call "download it" ...` add

```bash
call "download the pdf"               200 "$JANE" GET "/exports/$PDF/download"
call "nobody else can, pdf either"    404 "$LEE"  GET "/exports/$PDF/download"
```

- [ ] **Step 4: Run it**

With `./run api` up in another terminal:

```bash
./run smoke
```
Expected: every line `ok`, including the four new ones. Quote the passed/failed line in your report.

- [ ] **Step 5: `./run verify` and `./run check`**

```bash
./run verify
./run check
```
Expected: both green. `check` is the floor; it includes `one-rule`, which must not object to anything here (no business rule was added).

- [ ] **Step 6: Commit**

```bash
git add docs/openapi.yaml web/src/api/schema.ts scripts/smoke.sh
git commit -m "docs(api): the contract and smoke walk accept pdf exports (CAP-17)"
```

---

### Task 8: ADR #39

Load `/write-adr` first. It carries the format, the numbering and the voice. Read ADR #30 (line ~1220 of the ADR file) before writing, because #39 lifts the one deferral #30 made.

**Files:**
- Modify: `docs/adr/architecture-decision-records.md` (append)

- [ ] **Step 1: Append the record**

Append after ADR #38, following `docs/adr/TEMPLATE.md`. The content, to be written in the project's voice rather than pasted:

```
ADR #39: PDF export renders with dompdf, and the radar is server-side SVG

Status: Accepted
Date: 2026-09-17

Context:
ADR #30 shipped the export pipeline and refused pdf rather than fake it, leaving the
renderer as a team decision. The schema, the exports.format constraint and the Export
response type already permitted pdf, so nothing about the contract was waiting on it; only
the request rule was narrowed. The team agreed dompdf on 2026-09-17.

The record leaves the system. It has to be readable in ten years with nothing but a PDF
viewer: the narratives, the evidence references, both sides of every score, the framework
version each was scored against, and the radar the student saw on screen.

dompdf runs no JavaScript, so the recharts radar cannot be reused.

Decision:
- dompdf/dompdf, the plain package, no Laravel wrapper. Remote assets disabled.
- BuildExport::assemble() gains a radar block per reflection read from v_radar and
  v_framework_scale; the writer switches on format. Everything else in ADR #30 stands.
- The radar is inline SVG drawn by App\Exports\RadarPolygon from the same axes and scale
  the screen uses. Twelve o'clock, clockwise, one polygon per score class.
- The JSON export carries the radar block too; the two formats are the same record.

Consequences:
Positive: [standalone record; same data path as the screen; no browser in the pipeline;
one payload feeds both formats so they cannot drift]
Negative: [a pure-PHP renderer is slow on long records and single-threaded, which is why
the job is queued; the SVG radar is a second drawing of the chart, kept honest by sharing
the view and the geometry test rather than by sharing code with recharts; raw hex in the
Blade because a PDF has no tokens.css; dompdf's CSS support is partial, so layout is
tested by eye and not by assertion]

Alternatives:
barryvdh/laravel-dompdf. Rejected: a facade over four lines of code, and one more package
to keep in step with Laravel majors.
mpdf. Rejected: comparable, no deciding advantage, and the team named dompdf.
Browsershot / headless Chromium. Rejected: a browser binary on a shared VPS for one
feature, and the record would depend on the frontend bundle to render.
TCPDF. Rejected: draw-by-coordinates API; every layout change is code, not a template.
A client-rendered PNG posted with the request. Rejected: the export would depend on a
browser having been open, and the record would not stand alone.
```

Write it out fully in the ADR voice: prose paragraphs, honest negatives, no bullet stubs left in brackets.

- [ ] **Step 2: Reference it from the code**

In `PdfRenderer`'s docblock add `See ADR #39.` In `StoreExportRequest::rules()`'s docblock add `pdf per ADR #39.`

- [ ] **Step 3: Docs guard and commit**

```bash
./scripts/guard-docs-location.sh 2>/dev/null || true   # only if the script takes no args; otherwise skip
git add docs/adr/architecture-decision-records.md api/app/Exports/PdfRenderer.php api/app/Http/Requests/StoreExportRequest.php
git commit -m "docs(adr): #39 pdf export renders with dompdf (CAP-17)"
```

---

### Task 9: Finish

- [ ] **Step 1: Full verification, read the output**

```bash
./run test     # expect 110 + the new ones (3 in Task 2/4, 3 in Task 5, 2 in Task 6, 5 unit) all green
./run check
./run smoke    # with ./run api running
```
Quote the counts.

- [ ] **Step 2: Acceptance criteria, one at a time**

| Criterion (Jira COA4-75) | Where it is met |
| --- | --- |
| ADR recording dompdf and what was rejected, appended | ADR #39 |
| `POST /exports` accepts pdf; job renders; status stored | `StoreExportRequest`, `BuildExport::handle()`, `test_a_pdf_export_renders_a_pdf_with_the_record_in_it` |
| PDF carries reflections, both score sets, version snapshot, radar | `pdf.blade.php`, `test_the_pdf_page_carries_the_record_not_just_a_title` |
| `openapi.yaml` in the same PR | Task 7 |
| Another student's export is 404 | `test_another_students_pdf_is_not_found_not_forbidden` |
| Feature tests for render, authorisation, failure | Tasks 5 and 6 |

- [ ] **Step 3: Code review, then PR**

`superpowers:requesting-code-review`, then `superpowers:finishing-a-development-branch`: PR into `dev` titled `feat(api): pdf export with dompdf (CAP-17)`, body listing the six criteria and where each is met, plus one screenshot of a rendered page. Request a reviewer. Merging your own PR is allowed (CONTRIBUTING); pushing to `dev` is not.

- [ ] **Step 4: Jira**

Per `/jira-tickets`: COA4-75 is already In Progress. Move to **In Review** when the PR is open and CI is green; to **Done** only after merge *and* the table above has been checked against `dev`. Say what was moved in the same message.

---

## Self-review

- **Spec coverage:** six criteria → Tasks 8, 4+5, 5, 7, 6, 5+6. The ticket's "the radar" is met by SVG, agreed in conversation. ✓
- **Placeholders:** the ADR body in Task 8 is a brief the executor writes out; that is the one place the text is deliberately not final, because ADRs are prose in the project's voice, and the skill governs it. Everything else is literal.
- **Type consistency:** `radar` block shape (Task 2) is what `radar.blade.php` and `pdf.blade.php` read (Task 5); `RadarPolygon` signatures (Task 3) match their use in the partial; `PdfRenderer::render(array): string` is what `BuildExport` calls (Tasks 5, 6). `final` is removed in Task 6 and the note in Task 5's class comment should be dropped at that point. ✓
- **Not in scope:** the frontend format selector (CAP-18), a signed download URL, re-rendering an existing export in the other format, PDF layout assertions.
