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

    /**
     * A font the template registers (Inter, CAP-65) has its file and metrics
     * written to dompdf's fontDir. Left at its default that is inside vendor/,
     * which the deployed image's PHP user cannot write: every PDF export
     * failed with "fopen(...inter_normal_....ufm): Permission denied".
     */
    public function test_a_registered_font_is_written_under_storage_not_vendor(): void
    {
        // Nothing is deleted first: other tests share dompdf's cache, and a
        // font's files gone with its registry entry left behind breaks every
        // later render. Without fontDir moved, Inter never lands here at all.
        $dir = storage_path('app/dompdf');
        $fonts = resource_path('fonts/inter');

        $pdf = (new PdfRenderer)->fromHtml(
            "<html><head><style>@font-face { font-family: 'Inter'; src: url('$fonts/Inter-Regular.ttf') format('truetype'); }"
            ."body { font-family: 'Inter'; }</style></head><body><p>Narrative</p></body></html>"
        );

        $this->assertStringStartsWith('%PDF-', $pdf);
        $this->assertNotEmpty(glob("$dir/inter_*.ufm"), 'Inter\'s metrics should be cached under storage/app/dompdf');
    }
}
