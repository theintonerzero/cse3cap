<?php

namespace Tests\Feature;

use App\Exports\PdfRenderer;
use Tests\TestCase;

/**
 * Student-written text reaches the PDF export as markup, not as text.
 *
 * Every field below is typed by a person: narratives, comments, evidence
 * labels and links, framework names from a supervisor's copy, display
 * names. The templates escape all of them with {{ }}, and this holds that
 * in place, because one {!! !!} added for a line break would turn a
 * narrative into HTML that dompdf renders. See the 2026-09-19 entry in
 * docs/Security-Review.md.
 *
 * No database: the templates render from the array BuildExport::assemble()
 * returns, so the payload is built here in that shape.
 */
class ExportRenderingTest extends TestCase
{
    private function hostile(string $field): string
    {
        return "<script>alert('{$field}')</script><img src=x onerror=alert(1)><a href=\"javascript:alert(1)\">{$field}</a>";
    }

    /** @return array<string, mixed> */
    private function payload(): array
    {
        $axis = [
            'code' => 'C1',
            'short_label' => $this->hostile('short_label'),
            'self' => 2,
            'counter' => 3,
            'counter_role' => $this->hostile('counter_role'),
        ];

        return [
            'exported_at' => '2026-09-19T00:00:00Z',
            'summary' => ['reflections' => 1, 'scores' => 1, 'files' => 1],
            'reflections' => [[
                'gig' => $this->hostile('gig'),
                'sprint_ordinal' => 1,
                'status' => 'assessed',
                'submitted_at' => null,
                'framework' => ['name' => $this->hostile('framework'), 'fw_key' => 'k', 'version' => 1],
                'radar' => ['axes' => [$axis, $axis, $axis], 'scale_min' => 1, 'scale_max' => 4],
                'entries' => [[
                    'competency_code' => 'C1',
                    'competency_name' => $this->hostile('competency'),
                    'narrative' => $this->hostile('narrative'),
                    'evidence' => [[
                        'kind' => 'link',
                        'label' => $this->hostile('evidence_label'),
                        'uri' => $this->hostile('evidence_uri'),
                    ]],
                    'scores' => [[
                        'scorer' => $this->hostile('scorer'),
                        'scorer_role' => 'assessor',
                        'level_value' => 3,
                        'comment' => $this->hostile('comment'),
                        'scored_at' => null,
                    ]],
                ]],
            ]],
        ];
    }

    public function test_no_student_text_becomes_markup_in_the_pdf_template(): void
    {
        $html = view('exports.pdf', $this->payload())->render();

        $this->assertStringNotContainsString('<script', $html);
        $this->assertDoesNotMatchRegularExpression('/<img[^>]*onerror/i', $html);
        $this->assertDoesNotMatchRegularExpression('/<a\s/i', $html);

        foreach (['gig', 'framework', 'competency', 'narrative', 'evidence_label', 'evidence_uri', 'scorer', 'comment'] as $field) {
            $this->assertStringContainsString(
                "&lt;script&gt;alert(&#039;{$field}&#039;)&lt;/script&gt;",
                $html,
                "{$field} should reach the page as text",
            );
        }
    }

    public function test_no_student_text_becomes_markup_in_the_radar_svg(): void
    {
        $svg = view('exports.radar', ['radar' => $this->payload()['reflections'][0]['radar']])->render();

        $this->assertStringNotContainsString('<script', $svg);
        $this->assertStringContainsString('&lt;script&gt;alert(&#039;short_label&#039;)', $svg);
    }

    public function test_the_rendered_pdf_carries_no_script_or_link_actions(): void
    {
        $pdf = (new PdfRenderer)->render($this->payload());

        $this->assertStringStartsWith('%PDF-', $pdf);
        $this->assertDoesNotMatchRegularExpression('#/(JavaScript|JS)\b#', $pdf);
        $this->assertDoesNotMatchRegularExpression('#/URI\b#', $pdf);
    }
}
