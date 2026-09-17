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

        $dompdf = new Dompdf($options);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->loadHtml(view('exports.pdf', $payload)->render());
        $dompdf->render();

        return $dompdf->output();
    }
}
