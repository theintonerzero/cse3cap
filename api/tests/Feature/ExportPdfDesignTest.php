<?php

namespace Tests\Feature;

use App\Exports\PdfRenderer;
use Tests\TestCase;

/**
 * The PDF export reads as the Reflection Diary (CAP-65): Inter embedded in
 * the file, self and counter-score in the colours the screen uses, and every
 * page saying what it is and where it sits.
 *
 * No database: the templates render from the array BuildExport::assemble()
 * returns, so the payload is built here in that shape.
 */
class ExportPdfDesignTest extends TestCase
{
    /** The diary's self and counter-score colours, from web/src/tokens.css. */
    private const SELF = '#8053ad';

    private const COUNTER = '#317234';

    /**
     * @param  list<int|null>  $self
     * @param  list<int|null>  $counter
     * @return array<string, mixed>
     */
    private function reflection(array $self, array $counter, int $max = 4, string $narrative = 'Paired on the importer.'): array
    {
        $axes = [];
        $entries = [];
        foreach ($self as $i => $value) {
            $code = 'C'.($i + 1);
            $axes[] = [
                'code' => $code,
                'short_label' => "Skill {$i}",
                'self' => $value,
                'counter' => $counter[$i],
                'counter_role' => $counter[$i] === null ? null : 'assessor',
            ];
            $scores = [[
                'scorer_role' => 'student', 'scorer_class' => 'self', 'scorer' => 'Jane N',
                'level_value' => $value, 'comment' => null, 'scored_at' => '2026-08-15T09:40:00Z',
            ]];
            if ($counter[$i] !== null) {
                $scores[] = [
                    'scorer_role' => 'assessor', 'scorer_class' => 'counter', 'scorer' => 'Sam O',
                    'level_value' => $counter[$i], 'comment' => 'Good, with more to do on testing.',
                    'scored_at' => '2026-08-20T03:12:00Z',
                ];
            }
            $entries[] = [
                'competency_code' => $code,
                'competency_name' => "Competency {$i}",
                'narrative' => $narrative,
                'evidence' => [['kind' => 'link', 'label' => 'The pull request', 'uri' => 'https://example.org/pr/4']],
                'scores' => $scores,
            ];
        }

        return [
            'id' => 'r1',
            'status' => 'assessed',
            'gig' => 'Develop AI use cases',
            'sprint_ordinal' => 2,
            'framework' => ['fw_key' => 'latrobe6', 'version' => 1, 'name' => 'La Trobe six-competency'],
            'submitted_at' => '2026-08-29T09:40:00Z',
            'radar' => ['axes' => $axes, 'scale_min' => 1, 'scale_max' => $max],
            'entries' => $entries,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $reflections
     * @return array<string, mixed>
     */
    private function payload(array $reflections): array
    {
        return [
            'exported_at' => '2026-10-09T06:40:00Z',
            'format' => 'pdf',
            'summary' => ['reflections' => count($reflections), 'sprints' => count($reflections), 'scores' => 4, 'files' => 1],
            'reflections' => $reflections,
        ];
    }

    private function html(array $payload): string
    {
        return view('exports.pdf', $payload)->render();
    }

    public function test_the_pdf_embeds_inter(): void
    {
        $pdf = (new PdfRenderer)->render($this->payload([$this->reflection([3, 2], [2, 2])]));

        $this->assertStringStartsWith('%PDF-', $pdf);
        $this->assertMatchesRegularExpression('#/BaseFont\s*/[A-Z]{6}\+Inter#', $pdf, 'Inter, subset and embedded');
    }

    public function test_self_and_counter_are_drawn_in_the_colours_the_screen_uses(): void
    {
        $svg = view('exports.radar', ['radar' => $this->reflection([3, 2, 1], [2, 2, 2])['radar']])->render();

        $this->assertStringContainsString(self::SELF, $svg);
        $this->assertStringContainsString(self::COUNTER, $svg);
        $this->assertStringNotContainsString('#3b6ea5', $svg, 'the old blue');
        $this->assertStringNotContainsString('#c0662b', $svg, 'the old orange');

        $html = $this->html($this->payload([$this->reflection([3, 2, 1], [2, 2, 2])]));
        $this->assertStringContainsString(self::SELF, $html, 'the legend and score marks agree with the radar');
        $this->assertStringContainsString(self::COUNTER, $html);
    }

    public function test_every_page_names_the_diary_and_carries_a_page_number(): void
    {
        $html = $this->html($this->payload([$this->reflection([3], [2])]));

        // Fixed elements repeat on every page in dompdf, and counter(page)
        // is the page number it draws into them.
        $this->assertMatchesRegularExpression('/class="running-head"[^>]*>.*Reflection Diary/s', $html);
        $this->assertStringContainsString('counter(page)', $html);
        $this->assertMatchesRegularExpression('/\.running-head\s*\{[^}]*position:\s*fixed/s', $html);
        $this->assertMatchesRegularExpression('/\.running-foot\s*\{[^}]*position:\s*fixed/s', $html);
    }

    public function test_each_reflection_opens_with_its_gig_sprint_status_and_framework(): void
    {
        $html = $this->html($this->payload([$this->reflection([3], [2])]));

        $this->assertStringContainsString('Develop AI use cases', $html);
        $this->assertStringContainsString('Sprint 2', $html);
        $this->assertMatchesRegularExpression('/class="status status-assessed"[^>]*>\s*Assessed\s*</', $html);
        $this->assertStringContainsString('La Trobe six-competency (latrobe6, version 1)', $html);
        $this->assertStringContainsString('Submitted 29 August 2026', $html);
    }

    public function test_it_renders_an_empty_record_a_seven_point_scale_and_a_long_narrative(): void
    {
        $renderer = new PdfRenderer;

        $empty = $renderer->render($this->payload([]));
        $this->assertStringStartsWith('%PDF-', $empty);
        $this->assertStringContainsString('No reflections yet', $this->html($this->payload([])));

        $seven = $this->reflection([5, 4, 3], [4, null, 3], 7);
        $this->assertStringStartsWith('%PDF-', $renderer->render($this->payload([$seven])));

        $long = $this->reflection([3], [2], 4, str_repeat("A long paragraph about the sprint, written in full.\n\n", 120));
        $this->assertStringStartsWith('%PDF-', $renderer->render($this->payload([$long])));
    }
}
