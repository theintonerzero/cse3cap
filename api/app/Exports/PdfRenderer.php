<?php

namespace App\Exports;

use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\File;

/**
 * Turns the assembled export payload into PDF bytes.
 *
 * dompdf is a pure-PHP renderer with no JavaScript, which is why the
 * radar is drawn as inline SVG (see RadarPolygon) rather than by the
 * recharts component the screen uses. Remote assets are off: the record
 * has to stand on its own with nothing fetched at render time.
 *
 * Not final only so the failure path can be tested with a mock that
 * throws mid-render. See ADR #39.
 */
class PdfRenderer
{
    /**
     * @param  array<string, mixed>  $payload  the array BuildExport::assemble() returns
     */
    public function render(array $payload): string
    {
        $options = new Options;
        $options->set('isRemoteEnabled', false);
        $options->set('isHtml5ParserEnabled', true);
        $options->set('defaultFont', 'DejaVu Sans');

        // dompdf caches parsed font metrics next to the fonts, which is
        // inside vendor/ by default. A deploy that ships vendor/ read-only
        // would fail the first render, so the cache lives under storage/.
        // ensureDirectoryExists rather than a bare mkdir: two workers
        // rendering their first pdf at once would both see no directory,
        // and the loser's mkdir warning would mark its export failed.
        $cache = storage_path('app/dompdf');
        File::ensureDirectoryExists($cache);
        $options->set('fontCache', $cache);

        $dompdf = new Dompdf($options);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->loadHtml(view('exports.pdf', $payload)->render());
        $dompdf->render();

        return $dompdf->output();
    }
}
