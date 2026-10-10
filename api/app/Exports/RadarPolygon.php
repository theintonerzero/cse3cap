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
        return $this->number($p['x']).','.$this->number($p['y']);
    }

    /**
     * Three decimals, trailing zeros dropped, so a value that lands on an
     * integer prints as one. The `+ 0.0` turns the -0 that cos(-π/2)
     * rounds to back into 0.
     */
    private function number(float $n): string
    {
        $rounded = round($n, 3) + 0.0;

        return rtrim(rtrim(number_format($rounded, 3, '.', ''), '0'), '.');
    }
}
