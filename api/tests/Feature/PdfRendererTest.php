<?php

namespace Tests\Feature;

use App\Exports\PdfRenderer;
use Tests\TestCase;

/**
 * The renderer's own settings, independent of what the templates escape.
 *
 * The templates escape every value, so no student text can reach dompdf as
 * a script today. These tests feed dompdf raw HTML on purpose, to prove the
 * renderer would not act on it if a template ever stopped escaping. CAP-33,
 * and F6 in docs/Security-Review.md.
 *
 * No database: nothing here reads a model.
 */
class PdfRendererTest extends TestCase
{
    public function test_a_script_in_the_html_does_not_become_pdf_javascript(): void
    {
        $pdf = (new PdfRenderer)->fromHtml(
            '<html><body><p>Narrative</p>'
            .'<script type="text/javascript">app.alert("from the narrative");</script>'
            .'</body></html>'
        );

        $this->assertStringStartsWith('%PDF-', $pdf);
        $this->assertDoesNotMatchRegularExpression('#/(JavaScript|JS)\b#', $pdf);
        $this->assertStringNotContainsString('from the narrative', $pdf);
    }
}
